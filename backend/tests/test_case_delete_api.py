from __future__ import annotations

from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.cases.models import Case
from apps.cases.models import CompensationCalculation
from apps.cases.models import Disruption
from apps.cases.models import DisruptionType
from apps.cases.models import DocumentCategory
from apps.cases.models import FlightLeg
from apps.cases.models import Passenger
from apps.cases.models import UploadedDocument


@pytest.fixture
def admin_user(db):
    return get_user_model().objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="secret",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


def create_case_graph(*, linked_user=False, settings=None, tmp_path=None) -> Case:
    user = None
    if linked_user:
        user = get_user_model().objects.create_user(
            username="passenger@example.com",
            email="passenger@example.com",
            password="secret",
        )

    passenger = Passenger.objects.create(
        user=user,
        first_name="Ada",
        last_name="Lovelace",
        date_of_birth="1990-01-01",
        email="ada@example.com",
        phone="+40123456789",
        address="Main Street 1",
        postal_code="010101",
    )
    case = Case.objects.create(
        passenger=passenger,
        reservation_number="ABCD1234",
        gdpr_consent_primary=True,
        gdpr_consent_secondary=False,
    )
    FlightLeg.objects.create(
        case=case,
        leg_order=1,
        flight_date=date(2026, 7, 20),
        flight_number="RO101",
        airline="AirAssist Air",
        departure_airport_code="OTP",
        departure_airport_name="Henri Coanda International Airport",
        destination_airport_code="MAD",
        destination_airport_name="Adolfo Suarez Madrid-Barajas Airport",
        planned_departure_time="2026-07-20T08:00:00Z",
        planned_arrival_time="2026-07-20T11:30:00Z",
        is_connecting_leg=False,
        is_problem_flight=False,
    )
    FlightLeg.objects.create(
        case=case,
        leg_order=2,
        flight_date=date(2026, 7, 20),
        flight_number="RO201",
        airline="AirAssist Air",
        departure_airport_code="MAD",
        departure_airport_name="Adolfo Suarez Madrid-Barajas Airport",
        destination_airport_code="LIS",
        destination_airport_name="Humberto Delgado Airport",
        planned_departure_time="2026-07-20T13:00:00Z",
        planned_arrival_time="2026-07-20T14:15:00Z",
        is_connecting_leg=True,
        is_problem_flight=True,
    )
    CompensationCalculation.objects.create(
        case=case,
        start_airport_code="OTP",
        final_destination_code="LIS",
        orthodromic_distance_km="3210.50",
        compensation_amount_eur=400,
    )
    Disruption.objects.create(
        case=case,
        disruption_type=DisruptionType.CANCELLATION,
        cancellation_notice_timing="<14 days",
        incident_description="Cancelled without notice.",
    )
    if settings is not None and tmp_path is not None:
        settings.MEDIA_ROOT = tmp_path
        UploadedDocument.objects.create(
            case=case,
            document_category=DocumentCategory.BOARDING_PASS,
            original_file_name="boarding-pass.pdf",
            mime_type="application/pdf",
            file_size_bytes=16,
            file=SimpleUploadedFile("boarding-pass.pdf", b"boarding-pass", content_type="application/pdf"),
        )

    return case


@pytest.mark.django_db
def test_admin_can_list_cases(admin_client):
    case = create_case_graph()

    response = admin_client.get("/api/cases/")

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "id": case.case_id,
                "case_date": case.created_at.date().isoformat(),
                "flight_number": "RO201",
                "flight_date": "2026-07-20",
                "status": case.status,
                "actions": {"delete": True},
            }
        ]
    }


@pytest.mark.django_db
def test_non_admin_cannot_list_cases():
    user = get_user_model().objects.create_user(
        username="viewer@example.com",
        email="viewer@example.com",
        password="secret",
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/cases/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_can_delete_case_and_dependents(admin_client, settings, tmp_path):
    case = create_case_graph(settings=settings, tmp_path=tmp_path)
    stored_document_path = UploadedDocument.objects.get().file.path

    response = admin_client.delete(f"/api/cases/{case.case_id}/")

    assert response.status_code == 200
    assert response.json() == {"id": case.case_id, "message": "Case deleted successfully."}
    assert Case.objects.count() == 0
    assert FlightLeg.objects.count() == 0
    assert CompensationCalculation.objects.count() == 0
    assert Disruption.objects.count() == 0
    assert UploadedDocument.objects.count() == 0
    assert Passenger.objects.count() == 0
    assert not tmp_path.joinpath(stored_document_path).exists()


@pytest.mark.django_db
def test_delete_preserves_linked_passenger_profile(admin_client):
    case = create_case_graph(linked_user=True)
    passenger_id = case.passenger_id

    response = admin_client.delete(f"/api/cases/{case.case_id}/")

    assert response.status_code == 200
    assert Case.objects.count() == 0
    assert Passenger.objects.filter(id=passenger_id).exists() is True


@pytest.mark.django_db
def test_non_admin_cannot_delete_case(settings, tmp_path):
    user = get_user_model().objects.create_user(
        username="viewer@example.com",
        email="viewer@example.com",
        password="secret",
    )
    case = create_case_graph(settings=settings, tmp_path=tmp_path)
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.delete(f"/api/cases/{case.case_id}/")

    assert response.status_code == 403
    assert Case.objects.filter(case_id=case.case_id).exists() is True