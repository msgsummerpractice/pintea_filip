from datetime import date
from datetime import datetime
from datetime import timezone

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db import models

from apps.cases.models import Case
from apps.cases.models import CaseStatus
from apps.cases.models import DocumentCategory
from apps.cases.models import FlightLeg
from apps.cases.models import Passenger
from apps.cases.models import PassengerAuthState
from apps.cases.models import UploadedDocument


User = get_user_model()


def test_case_status_values() -> None:
    assert {choice for choice, _label in CaseStatus.choices} == {
        "NEW",
        "VALID",
        "ASSIGNED",
        "INVALID",
    }


def test_case_default_status_and_vocabulary_constraints_are_configured() -> None:
    assert Case._meta.get_field("status").default == CaseStatus.NEW
    assert Case._meta.get_field("assigned_colleague").default == ""

    constraints = {constraint.name: constraint for constraint in Case._meta.constraints}
    status_constraint = constraints["cases_case_status_valid"]
    assert isinstance(status_constraint, models.CheckConstraint)

    document_constraints = {constraint.name: constraint for constraint in UploadedDocument._meta.constraints}
    document_constraint = document_constraints["cases_uploaded_document_category_valid"]
    assert isinstance(document_constraint, models.CheckConstraint)


@pytest.mark.django_db
def test_case_generates_business_identifier_and_empty_colleague_assignment(passenger: Passenger) -> None:
    created_case = Case.objects.create(
        passenger=passenger,
        reservation_number="ABC123",
        status=CaseStatus.NEW,
        gdpr_consent_primary=True,
        gdpr_consent_secondary=True,
    )

    assert created_case.case_id.startswith("CASE-")
    assert len(created_case.case_id) == 17
    assert created_case.assigned_colleague == ""


def test_flight_leg_constraints_support_ordering_and_single_problem_flight() -> None:
    constraints = {constraint.name: constraint for constraint in FlightLeg._meta.constraints}

    minimum_order_constraint = constraints["cases_flight_leg_order_gte_1"]
    assert isinstance(minimum_order_constraint, models.CheckConstraint)

    connecting_flag_constraint = constraints["cases_flight_leg_connecting_flag_matches_order"]
    assert isinstance(connecting_flag_constraint, models.CheckConstraint)

    leg_order_constraint = constraints["cases_flight_leg_order_unique"]
    assert isinstance(leg_order_constraint, models.UniqueConstraint)
    assert leg_order_constraint.fields == ("case", "leg_order")

    problem_flight_constraint = constraints["cases_single_problem_flight_per_case"]
    assert isinstance(problem_flight_constraint, models.UniqueConstraint)
    assert problem_flight_constraint.fields == ("case",)
    assert problem_flight_constraint.condition is not None


@pytest.fixture
def passenger() -> Passenger:
    return Passenger.objects.create(
        first_name="Ada",
        last_name="Lovelace",
        date_of_birth=date(1990, 12, 10),
        email="ada@example.com",
        phone="+40123456789",
        address="1 Analytical Engine Street",
        postal_code="010101",
    )


@pytest.mark.django_db
def test_passenger_can_link_to_auth_user() -> None:
    user = User.objects.create_user(
        username="ada@example.com",
        email="ada@example.com",
        password="secret",
    )

    passenger = Passenger.objects.create(
        user=user,
        first_name="Ada",
        last_name="Lovelace",
        date_of_birth=date(1990, 12, 10),
        email="ada@example.com",
        phone="+40123456789",
        address="1 Analytical Engine Street",
        postal_code="010101",
    )

    assert passenger.user_id == user.id
    assert list(user.passengers.values_list("pk", flat=True)) == [passenger.pk]


@pytest.mark.django_db
def test_multiple_passengers_can_link_to_same_auth_user() -> None:
    user = User.objects.create_user(
        username="ada@example.com",
        email="ada@example.com",
        password="secret",
    )

    first_passenger = Passenger.objects.create(
        user=user,
        first_name="Ada",
        last_name="Lovelace",
        date_of_birth=date(1990, 12, 10),
        email="ada@example.com",
        phone="+40123456789",
        address="1 Analytical Engine Street",
        postal_code="010101",
    )
    second_passenger = Passenger.objects.create(
        user=user,
        first_name="Ada",
        last_name="Lovelace",
        date_of_birth=date(1990, 12, 10),
        email="ada@example.com",
        phone="+40999999999",
        address="2 Analytical Engine Street",
        postal_code="020202",
    )

    assert list(user.passengers.order_by("pk").values_list("pk", flat=True)) == [
        first_passenger.pk,
        second_passenger.pk,
    ]


@pytest.mark.django_db
def test_passenger_auth_state_defaults_to_forced_password_change() -> None:
    user = User.objects.create_user(
        username="grace@example.com",
        email="grace@example.com",
        password="secret",
    )

    state = PassengerAuthState.objects.create(user=user)

    assert state.must_change_password_on_first_login is True
    assert user.passenger_auth_state.pk == state.pk


@pytest.fixture
def case(passenger: Passenger) -> Case:
    return Case.objects.create(
        passenger=passenger,
        reservation_number="ABC123",
        status=CaseStatus.NEW,
        gdpr_consent_primary=True,
        gdpr_consent_secondary=True,
    )


def create_flight_leg(case: Case, leg_order: int, is_problem_flight: bool = False) -> FlightLeg:
    return FlightLeg.objects.create(
        case=case,
        leg_order=leg_order,
        flight_date=date(2026, 7, 20),
        flight_number=f"RO{leg_order:03d}",
        airline="AirAssist Air",
        departure_airport_code="OTP",
        departure_airport_name="Henri Coanda International Airport",
        destination_airport_code="MAD",
        destination_airport_name="Adolfo Suarez Madrid-Barajas Airport",
        planned_departure_time=datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc),
        planned_arrival_time=datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc),
        is_connecting_leg=leg_order > 1,
        is_problem_flight=is_problem_flight,
    )


@pytest.mark.django_db
def test_case_related_models_persist_and_link_correctly(case: Case) -> None:
    first_leg = create_flight_leg(case, leg_order=1, is_problem_flight=False)
    second_leg = create_flight_leg(case, leg_order=2, is_problem_flight=True)
    document = UploadedDocument.objects.create(
        case=case,
        document_category=DocumentCategory.BOARDING_PASS,
        original_file_name="boarding-pass.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        file="case-documents/2026/07/23/boarding-pass.pdf",
    )

    case.refresh_from_db()

    assert case.passenger.email == "ada@example.com"
    assert list(case.flight_legs.values_list("leg_order", flat=True)) == [1, 2]
    assert case.flight_legs.get(is_problem_flight=True).pk == second_leg.pk
    assert case.documents.get().pk == document.pk
    assert first_leg.is_connecting_leg is False
    assert second_leg.is_connecting_leg is True


@pytest.mark.django_db
def test_flight_leg_order_must_be_unique_per_case(case: Case) -> None:
    create_flight_leg(case, leg_order=1)

    with pytest.raises(IntegrityError):
        create_flight_leg(case, leg_order=1)


@pytest.mark.django_db
def test_only_one_problem_flight_is_allowed_per_case(case: Case) -> None:
    create_flight_leg(case, leg_order=1, is_problem_flight=True)

    with pytest.raises(IntegrityError):
        create_flight_leg(case, leg_order=2, is_problem_flight=True)