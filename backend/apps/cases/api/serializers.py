from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from django.utils import timezone
from rest_framework import serializers


MAX_CONNECTING_FLIGHTS = 4
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {"pdf", "jpg", "jpeg"}
PHONE_PATTERN = re.compile(r"^\+?[0-9().\-\s]{7,20}$")


def combine_date_and_time(date_value, time_value) -> datetime:
    combined = datetime.combine(date_value, time_value)
    if timezone.is_naive(combined):
        return timezone.make_aware(combined, timezone.get_current_timezone())
    return combined


def get_file_extension(file_name: str) -> str:
    if "." not in file_name:
        return ""
    return file_name.rsplit(".", 1)[-1].lower()


class AirportInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)
    name = serializers.CharField(max_length=255)
    city = serializers.CharField(max_length=255)
    country = serializers.CharField(max_length=255)


class PassengerInputSerializer(serializers.Serializer):
    firstName = serializers.CharField(max_length=100)
    lastName = serializers.CharField(max_length=100)
    dateOfBirth = serializers.DateField()
    email = serializers.EmailField(max_length=254)
    phone = serializers.RegexField(PHONE_PATTERN)
    address = serializers.CharField(max_length=255)
    postalCode = serializers.CharField(max_length=32)

    def validate_dateOfBirth(self, value):
        if value >= timezone.localdate():
            raise serializers.ValidationError("Date of birth must be earlier than today.")
        return value


class PrimaryFlightInputSerializer(serializers.Serializer):
    flightDate = serializers.DateField()
    flightNumber = serializers.CharField(max_length=20)
    airline = serializers.CharField(max_length=100)
    plannedDepartureTime = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])
    plannedArrivalTime = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        departure_at = combine_date_and_time(attrs["flightDate"], attrs["plannedDepartureTime"])
        arrival_at = combine_date_and_time(attrs["flightDate"], attrs["plannedArrivalTime"])
        if arrival_at <= departure_at:
            raise serializers.ValidationError(
                {"plannedArrivalTime": ["Planned arrival time must be after planned departure time."]}
            )

        attrs["plannedDepartureAt"] = departure_at
        attrs["plannedArrivalAt"] = arrival_at
        return attrs


class ConnectingFlightInputSerializer(PrimaryFlightInputSerializer):
    id = serializers.CharField(max_length=100)
    departureAirport = AirportInputSerializer()
    destinationAirport = AirportInputSerializer()


class ItineraryInputSerializer(serializers.Serializer):
    departureAirport = AirportInputSerializer()
    destinationAirport = AirportInputSerializer()
    primaryFlight = PrimaryFlightInputSerializer()
    connectingFlights = ConnectingFlightInputSerializer(many=True, required=False, allow_empty=True, max_length=MAX_CONNECTING_FLIGHTS)
    problemFlightId = serializers.CharField(allow_null=True, allow_blank=False, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        connecting_flights = attrs.get("connectingFlights", [])
        problem_flight_id = attrs.get("problemFlightId")

        if connecting_flights and not problem_flight_id:
            raise serializers.ValidationError(
                {"problemFlightId": ["Select the problem flight when connections exist."]}
            )

        if not connecting_flights and problem_flight_id is not None:
            raise serializers.ValidationError(
                {"problemFlightId": ["Problem flight selection is only allowed when connections exist."]}
            )

        if connecting_flights:
            matching_flights = [flight for flight in connecting_flights if flight["id"] == problem_flight_id]
            if len(matching_flights) != 1:
                raise serializers.ValidationError(
                    {"problemFlightId": ["Exactly one problem flight must be selected."]}
                )

        attrs.setdefault("connectingFlights", [])
        attrs.setdefault("problemFlightId", None)
        return attrs


class CaseDocumentField(serializers.FileField):
    default_error_messages = {
        "invalid_extension": "Allowed file types are pdf, jpg, and jpeg.",
        "file_too_large": "File size must be 5 MB or smaller.",
    }

    def to_internal_value(self, data):
        file = super().to_internal_value(data)
        extension = get_file_extension(file.name)
        if extension not in ALLOWED_UPLOAD_EXTENSIONS:
            self.fail("invalid_extension")
        if file.size > MAX_UPLOAD_BYTES:
            self.fail("file_too_large")
        return file


class DisruptionInputSerializer(serializers.Serializer):
    disruptionType = serializers.ChoiceField(choices=["cancellation", "delay", "denied_boarding"])
    cancellationNoticeTiming = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    finalArrivalOutcome = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    gaveUpSeatVoluntarily = serializers.CharField(max_length=5, required=False, allow_blank=True, default="")
    deniedBoardingReason = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    airlineMotiveKnown = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    airlineMotive = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    incidentDescription = serializers.CharField(max_length=1000)


class CaseCreateRequestSerializer(serializers.Serializer):
    reservationNumber = serializers.CharField(max_length=50)
    gdprConsentPrimary = serializers.BooleanField()
    gdprConsentSecondary = serializers.BooleanField()
    passenger = PassengerInputSerializer()
    itinerary = ItineraryInputSerializer()
    disruption = DisruptionInputSerializer()
    boarding_pass = CaseDocumentField()
    identification = CaseDocumentField()

    @classmethod
    def from_multipart(cls, data, files) -> "CaseCreateRequestSerializer":
        raw_payload = data.get("payload")
        if raw_payload in (None, ""):
            raise serializers.ValidationError({"payload": ["This field is required."]})

        if isinstance(raw_payload, str):
            try:
                payload = json.loads(raw_payload)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError({"payload": ["Invalid JSON payload."]}) from exc
        elif isinstance(raw_payload, dict):
            payload = raw_payload
        else:
            raise serializers.ValidationError({"payload": ["Invalid JSON payload."]})

        if not isinstance(payload, dict):
            raise serializers.ValidationError({"payload": ["Payload must be a JSON object."]})

        serializer_input = dict(payload)
        serializer_input["boarding_pass"] = files.get("boarding_pass")
        serializer_input["identification"] = files.get("identification") or files.get("identification_document")
        return cls(data=serializer_input)

    def validate_gdprConsentPrimary(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError("GDPR consent is required to submit.")
        return value
