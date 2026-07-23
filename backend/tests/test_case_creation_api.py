from __future__ import annotations

import json
from datetime import date
from datetime import datetime
from datetime import timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.cases.models import Case
from apps.cases.models import CaseStatus
from apps.cases.models import CompensationCalculation
from apps.cases.models import Disruption
from apps.cases.models import DocumentCategory
from apps.cases.models import FlightLeg
from apps.cases.models import Passenger
from apps.cases.models import UploadedDocument
from apps.cases.services import case_creation
from apps.cases.services.compensation import CompensationResult


def build_payload() -> dict:
    return {
        "reservationNumber": "ABCD1234",
        "gdprConsentPrimary": True,
        "gdprConsentSecondary": False,
        "passenger": {
            "firstName": "Ada",
            "lastName": "Lovelace",
            "dateOfBirth": "1990-12-10",
            "email": "ada@example.com",
            "phone": "+40123456789",
            "address": "1 Analytical Engine Street",
            "postalCode": "010101",
        },
        "disruption": {
            "disruptionType": "cancellation",
            "cancellationNoticeTiming": "<14 days",
            "delayArrivalOutcome": "",
            "gaveUpSeatVoluntarily": "",
            "deniedBoardingReason": "",
            "airlineMotiveKnown": "no",
            "airlineMotive": "",
            "incidentDescription": "The flight was cancelled without proper notice.",
        },
        "itinerary": {
            "departureAirport": {
                "code": "OTP",
                "name": "Henri Coanda International Airport",
                "city": "Bucharest",
                "country": "Romania",
                "displayLabel": "Bucharest - Henri Coanda International Airport (OTP)",
            },
            "destinationAirport": {
                "code": "MAD",
                "name": "Adolfo Suarez Madrid-Barajas Airport",
                "city": "Madrid",
                "country": "Spain",
                "displayLabel": "Madrid - Adolfo Suarez Madrid-Barajas Airport (MAD)",
            },
            "primaryFlight": {
                "flightDate": "2026-07-20",
                "flightNumber": "RO101",
                "airline": "AirAssist Air",
                "plannedDepartureTime": "08:00",
                "plannedArrivalTime": "11:30",
            },
            "connectingFlights": [
                {
                    "id": "cf-1",
                    "flightDate": "2026-07-20",
                    "flightNumber": "RO201",
                    "airline": "AirAssist Air",
                    "departureAirport": {
                        "code": "MAD",
                        "name": "Adolfo Suarez Madrid-Barajas Airport",
                        "city": "Madrid",
                        "country": "Spain",
                        "displayLabel": "Madrid - Adolfo Suarez Madrid-Barajas Airport (MAD)",
                    },
                    "destinationAirport": {
                        "code": "LIS",
                        "name": "Humberto Delgado Airport",
                        "city": "Lisbon",
                        "country": "Portugal",
                        "displayLabel": "Lisbon - Humberto Delgado Airport (LIS)",
                    },
                    "plannedDepartureTime": "13:00",
                    "plannedArrivalTime": "14:15",
                }
            ],
            "problemFlightId": "cf-1",
        },
    }


def build_upload(name: str, content_type: str = "application/pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"test-file-content", content_type=content_type)


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.calculate_compensation")
def test_case_create_api_persists_case_graph(mock_calc, tmp_path, settings) -> None:
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("2000.00"), compensation_eur=400
    )
    settings.MEDIA_ROOT = tmp_path

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(build_payload()),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    assert response.json()["status"] == CaseStatus.NEW

    created_case = Case.objects.get()
    passenger = Passenger.objects.get()
    flight_legs = list(FlightLeg.objects.order_by("leg_order"))
    documents = list(UploadedDocument.objects.order_by("document_category"))

    assert created_case.passenger_id == passenger.pk
    assert created_case.reservation_number == "ABCD1234"
    assert created_case.gdpr_consent_primary is True
    assert created_case.gdpr_consent_secondary is False
    assert passenger.first_name == "Ada"
    assert passenger.date_of_birth == date(1990, 12, 10)
    assert len(flight_legs) == 2
    assert flight_legs[0].is_connecting_leg is False
    assert flight_legs[0].is_problem_flight is False
    assert flight_legs[1].is_connecting_leg is True
    assert flight_legs[1].is_problem_flight is True
    assert [document.document_category for document in documents] == [
        DocumentCategory.BOARDING_PASS,
        DocumentCategory.IDENTIFICATION,
    ]


@pytest.mark.django_db
def test_case_create_api_rejects_missing_primary_gdpr_consent() -> None:
    payload = build_payload()
    payload["gdprConsentPrimary"] = False

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"gdprConsentPrimary": ["GDPR consent is required to submit."]}
    assert Case.objects.count() == 0
    assert Passenger.objects.count() == 0


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.calculate_compensation")
def test_case_create_api_accepts_identification_document_alias(mock_calc, tmp_path, settings) -> None:
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("2000.00"), compensation_eur=400
    )
    settings.MEDIA_ROOT = tmp_path

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(build_payload()),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification_document": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    assert UploadedDocument.objects.count() == 2


@pytest.mark.django_db
def test_case_create_api_rejects_invalid_json_payload() -> None:
    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": "{not-json}",
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"payload": ["Invalid JSON payload."]}
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_primary_flight_arrival_before_departure() -> None:
    payload = build_payload()
    payload["itinerary"]["primaryFlight"]["plannedDepartureTime"] = "11:30"
    payload["itinerary"]["primaryFlight"]["plannedArrivalTime"] = "08:00"

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {
        "itinerary": {
            "primaryFlight": {
                "plannedArrivalTime": ["Planned arrival time must be after planned departure time."]
            }
        }
    }
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_connecting_flight_arrival_before_departure() -> None:
    payload = build_payload()
    payload["itinerary"]["connectingFlights"][0]["plannedDepartureTime"] = "14:15"
    payload["itinerary"]["connectingFlights"][0]["plannedArrivalTime"] = "13:00"

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {
        "itinerary": {
            "connectingFlights": [
                {
                    "plannedArrivalTime": [
                        "Planned arrival time must be after planned departure time."
                    ]
                }
            ]
        }
    }
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_invalid_email() -> None:
    payload = build_payload()
    payload["passenger"]["email"] = "not-an-email"

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"passenger": {"email": ["Enter a valid email address."]}}
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_invalid_phone() -> None:
    payload = build_payload()
    payload["passenger"]["phone"] = "abc"

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"passenger": {"phone": ["This value does not match the required pattern."]}}
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_more_than_four_connecting_flights() -> None:
    payload = build_payload()
    payload["itinerary"]["connectingFlights"] = [
        {
            "id": f"cf-{index}",
            "flightDate": "2026-07-20",
            "flightNumber": f"RO20{index}",
            "airline": "AirAssist Air",
            "departureAirport": {
                "code": "MAD",
                "name": "Adolfo Suarez Madrid-Barajas Airport",
                "city": "Madrid",
                "country": "Spain",
                "displayLabel": "Madrid - Adolfo Suarez Madrid-Barajas Airport (MAD)",
            },
            "destinationAirport": {
                "code": "LIS",
                "name": "Humberto Delgado Airport",
                "city": "Lisbon",
                "country": "Portugal",
                "displayLabel": "Lisbon - Humberto Delgado Airport (LIS)",
            },
            "plannedDepartureTime": "13:00",
            "plannedArrivalTime": "14:15",
        }
        for index in range(1, 6)
    ]
    payload["itinerary"]["problemFlightId"] = "cf-1"

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {
        "itinerary": {
            "connectingFlights": {
                "non_field_errors": ["Ensure this field has no more than 4 elements."]
            }
        }
    }
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_missing_problem_flight_when_connections_exist() -> None:
    payload = build_payload()
    payload["itinerary"]["problemFlightId"] = None

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {
        "itinerary": {"problemFlightId": ["Select the problem flight when connections exist."]}
    }
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_invalid_file_type() -> None:
    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(build_payload()),
            "boarding_pass": build_upload("boarding-pass.png", content_type="image/png"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"boarding_pass": ["Allowed file types are pdf, jpg, and jpeg."]}
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_oversized_upload() -> None:
    oversized_file = SimpleUploadedFile(
        "boarding-pass.pdf",
        b"a" * (5 * 1024 * 1024 + 1),
        content_type="application/pdf",
    )

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(build_payload()),
            "boarding_pass": oversized_file,
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"boarding_pass": ["File size must be 5 MB or smaller."]}
    assert Case.objects.count() == 0


@pytest.mark.django_db
def test_case_create_api_rejects_date_of_birth_today() -> None:
    payload = build_payload()
    payload["passenger"]["dateOfBirth"] = date.today().isoformat()

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {
        "passenger": {"dateOfBirth": ["Date of birth must be earlier than today."]}
    }
    assert Case.objects.count() == 0


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.calculate_compensation")
def test_case_create_api_creates_new_status_without_problem_flight_for_direct_trip(mock_calc, tmp_path, settings) -> None:
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("2000.00"), compensation_eur=400
    )
    settings.MEDIA_ROOT = tmp_path
    payload = build_payload()
    payload["itinerary"]["connectingFlights"] = []
    payload["itinerary"]["problemFlightId"] = None

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    created_case = Case.objects.get()
    flight_legs = list(FlightLeg.objects.order_by("leg_order"))

    assert created_case.status == CaseStatus.NEW
    assert len(flight_legs) == 1
    assert flight_legs[0].is_problem_flight is False


@pytest.mark.django_db
def test_create_case_rolls_back_all_records_when_document_persistence_fails(monkeypatch) -> None:
    payload = build_payload()
    validated_data = {
        **payload,
        "passenger": {
            "firstName": "Ada",
            "lastName": "Lovelace",
            "dateOfBirth": date(1990, 12, 10),
            "email": "ada@example.com",
            "phone": "+40123456789",
            "address": "1 Analytical Engine Street",
            "postalCode": "010101",
        },
        "itinerary": {
            "departureAirport": payload["itinerary"]["departureAirport"],
            "destinationAirport": payload["itinerary"]["destinationAirport"],
            "primaryFlight": {
                **payload["itinerary"]["primaryFlight"],
                "flightDate": date(2026, 7, 20),
                "plannedDepartureAt": datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc),
                "plannedArrivalAt": datetime(2026, 7, 20, 11, 30, tzinfo=timezone.utc),
            },
            "connectingFlights": [
                {
                    **payload["itinerary"]["connectingFlights"][0],
                    "flightDate": date(2026, 7, 20),
                    "plannedDepartureAt": datetime(2026, 7, 20, 13, 0, tzinfo=timezone.utc),
                    "plannedArrivalAt": datetime(2026, 7, 20, 14, 15, tzinfo=timezone.utc),
                }
            ],
            "problemFlightId": "cf-1",
        },
        "disruption": {
            "disruptionType": "cancellation",
            "cancellationNoticeTiming": "<14 days",
            "delayArrivalOutcome": "",
            "gaveUpSeatVoluntarily": "",
            "deniedBoardingReason": "",
            "airlineMotiveKnown": "no",
            "airlineMotive": "",
            "incidentDescription": "The flight was cancelled without proper notice.",
        },
        "boarding_pass": build_upload("boarding-pass.pdf"),
        "identification": build_upload("passport.jpg", content_type="image/jpeg"),
    }

    original_create = case_creation.UploadedDocument.objects.create
    call_count = {"count": 0}

    def fail_on_second_document(*args, **kwargs):
        call_count["count"] += 1
        if call_count["count"] == 2:
            raise RuntimeError("document persistence failed")
        return original_create(*args, **kwargs)

    monkeypatch.setattr(case_creation.UploadedDocument.objects, "create", fail_on_second_document)

    with pytest.raises(RuntimeError, match="document persistence failed"):
        case_creation.create_case(validated_data)

    assert Passenger.objects.count() == 0
    assert Case.objects.count() == 0
    assert FlightLeg.objects.count() == 0
    assert UploadedDocument.objects.count() == 0


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.calculate_compensation")
def test_case_create_persists_compensation(mock_calc, tmp_path, settings) -> None:
    settings.MEDIA_ROOT = tmp_path
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("1868.42"), compensation_eur=400
    )

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(build_payload()),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["compensation"]["distance_km"] == 1868.42
    assert body["compensation"]["compensation_eur"] == 400

    case = Case.objects.get()
    comp = CompensationCalculation.objects.get(case=case)
    assert comp.start_airport_code == "OTP"
    assert comp.final_destination_code == "MAD"
    assert comp.orthodromic_distance_km == Decimal("1868.42")
    assert comp.compensation_amount_eur == 400


@pytest.mark.django_db
def test_case_create_api_rejects_missing_disruption() -> None:
    payload = build_payload()
    del payload["disruption"]

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "disruption" in response.json()
    assert Case.objects.count() == 0


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.calculate_compensation")
def test_case_create_api_persists_disruption(mock_calc, tmp_path, settings) -> None:
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("2000.00"), compensation_eur=400
    )
    settings.MEDIA_ROOT = tmp_path

    payload = build_payload()
    payload["disruption"] = {
        "disruptionType": "delay",
        "cancellationNoticeTiming": "",
        "delayArrivalOutcome": ">3h",
        "gaveUpSeatVoluntarily": "",
        "deniedBoardingReason": "",
        "airlineMotiveKnown": "yes",
        "airlineMotive": "strike",
        "incidentDescription": "Arrived over 3 hours late due to strike.",
    }

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(payload),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    disruption = Disruption.objects.get()
    assert disruption.disruption_type == "DELAY"
    assert disruption.delay_arrival_outcome == ">3h"
    assert disruption.airline_motive_known == "yes"
    assert disruption.airline_motive == "strike"
    assert disruption.incident_description == "Arrived over 3 hours late due to strike."