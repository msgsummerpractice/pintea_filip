from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.cases.models import Case
from apps.cases.models import CaseStatus
from apps.cases.models import CompensationCalculation
from apps.cases.models import Disruption
from apps.cases.models import DocumentCategory
from apps.cases.models import FlightLeg
from apps.cases.models import Passenger
from apps.cases.models import UploadedDocument
from apps.cases.services.compensation import calculate_compensation
from apps.cases.services.passenger_accounts import provision_passenger_account


def create_case(validated_data: dict[str, Any]) -> Case:
    passenger_data = validated_data["passenger"]
    itinerary_data = validated_data["itinerary"]
    primary_flight_data = itinerary_data["primaryFlight"]
    connecting_flights = itinerary_data["connectingFlights"]
    problem_flight_id = itinerary_data["problemFlightId"]
    boarding_pass = validated_data["boarding_pass"]
    identification = validated_data["identification"]

    with transaction.atomic():
        passenger = Passenger.objects.create(
            first_name=passenger_data["firstName"],
            last_name=passenger_data["lastName"],
            date_of_birth=passenger_data["dateOfBirth"],
            email=passenger_data["email"],
            phone=passenger_data["phone"],
            address=passenger_data["address"],
            postal_code=passenger_data["postalCode"],
        )

        case = Case.objects.create(
            passenger=passenger,
            reservation_number=validated_data["reservationNumber"],
            status=CaseStatus.NEW,
            gdpr_consent_primary=validated_data["gdprConsentPrimary"],
            gdpr_consent_secondary=validated_data["gdprConsentSecondary"],
        )

        FlightLeg.objects.create(
            case=case,
            leg_order=1,
            flight_date=primary_flight_data["flightDate"],
            flight_number=primary_flight_data["flightNumber"],
            airline=primary_flight_data["airline"],
            departure_airport_code=itinerary_data["departureAirport"]["code"],
            departure_airport_name=itinerary_data["departureAirport"]["name"],
            destination_airport_code=itinerary_data["destinationAirport"]["code"],
            destination_airport_name=itinerary_data["destinationAirport"]["name"],
            planned_departure_time=primary_flight_data["plannedDepartureAt"],
            planned_arrival_time=primary_flight_data["plannedArrivalAt"],
            is_connecting_leg=False,
            is_problem_flight=False,
        )

        for leg_order, flight_data in enumerate(connecting_flights, start=2):
            FlightLeg.objects.create(
                case=case,
                leg_order=leg_order,
                flight_date=flight_data["flightDate"],
                flight_number=flight_data["flightNumber"],
                airline=flight_data["airline"],
                departure_airport_code=flight_data["departureAirport"]["code"],
                departure_airport_name=flight_data["departureAirport"]["name"],
                destination_airport_code=flight_data["destinationAirport"]["code"],
                destination_airport_name=flight_data["destinationAirport"]["name"],
                planned_departure_time=flight_data["plannedDepartureAt"],
                planned_arrival_time=flight_data["plannedArrivalAt"],
                is_connecting_leg=True,
                is_problem_flight=flight_data["id"] == problem_flight_id,
            )

        UploadedDocument.objects.create(
            case=case,
            document_category=DocumentCategory.BOARDING_PASS,
            original_file_name=boarding_pass.name,
            mime_type=getattr(boarding_pass, "content_type", "application/octet-stream"),
            file_size_bytes=boarding_pass.size,
            file=boarding_pass,
        )
        UploadedDocument.objects.create(
            case=case,
            document_category=DocumentCategory.IDENTIFICATION,
            original_file_name=identification.name,
            mime_type=getattr(identification, "content_type", "application/octet-stream"),
            file_size_bytes=identification.size,
            file=identification,
        )

        disruption_data = validated_data["disruption"]
        Disruption.objects.create(
            case=case,
            disruption_type=disruption_data["disruptionType"].upper(),
            cancellation_notice_timing=disruption_data.get("cancellationNoticeTiming", ""),
            delay_arrival_outcome=disruption_data.get("finalArrivalOutcome", ""),
            gave_up_seat_voluntarily=disruption_data.get("gaveUpSeatVoluntarily", ""),
            denied_boarding_reason=disruption_data.get("deniedBoardingReason", ""),
            airline_motive_known=disruption_data.get("airlineMotiveKnown", ""),
            airline_motive=disruption_data.get("airlineMotive", ""),
            incident_description=disruption_data["incidentDescription"],
        )

        compensation_result = calculate_compensation(
            itinerary_data["departureAirport"]["code"],
            itinerary_data["destinationAirport"]["code"],
        )
        CompensationCalculation.objects.create(
            case=case,
            start_airport_code=itinerary_data["departureAirport"]["code"],
            final_destination_code=itinerary_data["destinationAirport"]["code"],
            orthodromic_distance_km=compensation_result.distance_km,
            compensation_amount_eur=compensation_result.compensation_eur,
        )

        provision_passenger_account(passenger=passenger)

    return case