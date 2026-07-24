from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.cases.models import Case
from apps.cases.models import Passenger


@pytest.fixture
def admin_user(db):
    return get_user_model().objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="secret",
        is_staff=True,
        is_superuser=True,
        first_name="Ada",
        last_name="Admin",
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


def create_passenger_user(email: str, *, first_name: str = "", last_name: str = ""):
    return get_user_model().objects.create_user(
        username=email,
        email=email,
        password="secret",
        first_name=first_name,
        last_name=last_name,
    )


def create_passenger_for_user(user, *, email: str) -> Passenger:
    return Passenger.objects.create(
        user=user,
        first_name=user.first_name or "Fallback",
        last_name=user.last_name or "User",
        date_of_birth="1990-01-01",
        email=email,
        phone="+40123456789",
        address="Main Street 1",
        postal_code="010101",
    )


@pytest.mark.django_db
def test_admin_can_list_all_users(admin_client, admin_user):
    passenger_user = create_passenger_user(
        "passenger@example.com",
        first_name="Paula",
        last_name="Passenger",
    )
    colleague_user = get_user_model().objects.create_user(
        username="colleague@example.com",
        email="colleague@example.com",
        password="secret",
        is_staff=True,
        first_name="Cora",
        last_name="Colleague",
    )
    passenger = create_passenger_for_user(passenger_user, email="passenger@example.com")
    Case.objects.create(
        passenger=passenger,
        reservation_number="ABC123",
        gdpr_consent_primary=True,
        gdpr_consent_secondary=False,
    )

    response = admin_client.get("/api/users/")

    assert response.status_code == 200
    results = {entry["email"]: entry for entry in response.json()["results"]}
    assert results["admin@example.com"]["role"] == "System Admin"
    assert results["colleague@example.com"]["role"] == "Colleague"
    assert results["passenger@example.com"]["role"] == "Passenger"
    assert results["passenger@example.com"]["assigned_case_count"] == 1
    assert results["colleague@example.com"]["assigned_case_count"] == 0
    assert results["admin@example.com"]["name"] == "Ada Admin"
    assert colleague_user.email in results


@pytest.mark.django_db
def test_non_admin_is_denied_access():
    user = create_passenger_user("viewer@example.com")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/users/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_name_falls_back_to_email_for_blank_names(admin_client):
    create_passenger_user("blank@example.com")

    response = admin_client.get("/api/users/")

    row = next(entry for entry in response.json()["results"] if entry["email"] == "blank@example.com")
    assert row["name"] == "blank@example.com"
    assert row["role"] == "Passenger"
    assert row["actions"] == {"edit": False, "delete": False}


@pytest.mark.django_db
def test_assigned_case_count_ignores_free_text_assignee(admin_client):
    passenger_user = create_passenger_user("counted@example.com", first_name="Casey", last_name="Counted")
    passenger = create_passenger_for_user(passenger_user, email="counted@example.com")
    Case.objects.create(
        passenger=passenger,
        reservation_number="COUNT1",
        gdpr_consent_primary=True,
        gdpr_consent_secondary=False,
        assigned_colleague="admin@example.com",
    )

    response = admin_client.get("/api/users/")

    admin_row = next(entry for entry in response.json()["results"] if entry["email"] == "admin@example.com")
    passenger_row = next(entry for entry in response.json()["results"] if entry["email"] == "counted@example.com")
    assert admin_row["assigned_case_count"] == 0
    assert passenger_row["assigned_case_count"] == 1


@pytest.mark.django_db
def test_assigned_case_count_ignores_unlinked_passenger_cases(admin_client):
    create_passenger_user("linked@example.com", first_name="Linked", last_name="User")
    unlinked_passenger = Passenger.objects.create(
        first_name="Una",
        last_name="Linked",
        date_of_birth="1990-01-01",
        email="unlinked@example.com",
        phone="+40123456780",
        address="Other Street 2",
        postal_code="020202",
    )
    Case.objects.create(
        passenger=unlinked_passenger,
        reservation_number="UNLINK1",
        gdpr_consent_primary=True,
        gdpr_consent_secondary=False,
    )

    response = admin_client.get("/api/users/")

    linked_row = next(entry for entry in response.json()["results"] if entry["email"] == "linked@example.com")
    admin_row = next(entry for entry in response.json()["results"] if entry["email"] == "admin@example.com")
    assert linked_row["assigned_case_count"] == 0
    assert admin_row["assigned_case_count"] == 0