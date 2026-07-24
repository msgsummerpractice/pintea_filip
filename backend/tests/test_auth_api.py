from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.cases.models import PassengerAuthState


User = get_user_model()


def create_user(*, email: str, password: str, first_name: str, last_name: str, is_staff: bool = False, is_superuser: bool = False):
    return User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        is_staff=is_staff,
        is_superuser=is_superuser,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("is_staff", "is_superuser", "expected_role"),
    [
        (False, False, "Passenger"),
        (True, False, "Colleague"),
        (True, True, "System Admin"),
    ],
)
def test_login_returns_session_payload_by_role(is_staff, is_superuser, expected_role):
    user = create_user(
        email=f"{expected_role.lower().replace(' ', '')}@example.com",
        password="StrongPass123!",
        first_name="Robin",
        last_name=expected_role.split()[0],
        is_staff=is_staff,
        is_superuser=is_superuser,
    )
    client = APIClient()

    response = client.post(
        "/api/auth/login/",
        {"email": user.email.upper(), "password": "StrongPass123!"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": user.id,
        "email": user.email,
        "name": f"Robin {expected_role.split()[0]}",
        "role": expected_role,
        "mustChangePasswordOnFirstLogin": False,
    }


@pytest.mark.django_db
def test_login_returns_forced_change_flag_from_auth_state():
    user = create_user(
        email="forced@example.com",
        password="StrongPass123!",
        first_name="Fiona",
        last_name="Forced",
    )
    PassengerAuthState.objects.create(user=user, must_change_password_on_first_login=True)
    client = APIClient()

    response = client.post(
        "/api/auth/login/",
        {"email": "  FORCED@example.com  ", "password": "StrongPass123!"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["mustChangePasswordOnFirstLogin"] is True


@pytest.mark.django_db
def test_login_rejects_invalid_credentials():
    create_user(
        email="passenger@example.com",
        password="StrongPass123!",
        first_name="Paula",
        last_name="Passenger",
    )
    client = APIClient()

    response = client.post(
        "/api/auth/login/",
        {"email": "passenger@example.com", "password": "WrongPass123!"},
        format="json",
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid e-mail or password."}


@pytest.mark.django_db
def test_session_requires_authenticated_user():
    client = APIClient()

    response = client.get("/api/auth/session/")

    assert response.status_code == 401


@pytest.mark.django_db
def test_session_returns_authenticated_user_payload():
    user = create_user(
        email="session@example.com",
        password="StrongPass123!",
        first_name="Sasha",
        last_name="Session",
        is_staff=True,
    )
    PassengerAuthState.objects.create(user=user, must_change_password_on_first_login=True)
    client = APIClient()
    client.force_login(user)

    response = client.get("/api/auth/session/")

    assert response.status_code == 200
    assert response.json() == {
        "id": user.id,
        "email": "session@example.com",
        "name": "Sasha Session",
        "role": "Colleague",
        "mustChangePasswordOnFirstLogin": True,
    }


@pytest.mark.django_db
def test_logout_clears_session():
    user = create_user(
        email="logout@example.com",
        password="StrongPass123!",
        first_name="Lena",
        last_name="Logout",
    )
    client = APIClient()
    client.force_login(user)

    response = client.post("/api/auth/logout/", format="json")

    assert response.status_code == 204
    follow_up = client.get("/api/auth/session/")
    assert follow_up.status_code == 401


@pytest.mark.django_db
def test_change_password_requires_authenticated_user():
    client = APIClient()

    response = client.post(
        "/api/auth/change-password/",
        {
            "currentPassword": "StrongPass123!",
            "newPassword": "EvenStronger123!",
            "confirmNewPassword": "EvenStronger123!",
        },
        format="json",
    )

    assert response.status_code == 401


@pytest.mark.django_db
def test_change_password_clears_forced_change_flag_and_keeps_session():
    user = create_user(
        email="change@example.com",
        password="StrongPass123!",
        first_name="Chloe",
        last_name="Change",
    )
    PassengerAuthState.objects.create(user=user, must_change_password_on_first_login=True)
    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/auth/change-password/",
        {
            "currentPassword": "StrongPass123!",
            "newPassword": "EvenStronger123!",
            "confirmNewPassword": "EvenStronger123!",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["mustChangePasswordOnFirstLogin"] is False
    user.refresh_from_db()
    assert user.check_password("EvenStronger123!") is True
    assert PassengerAuthState.objects.get(user=user).must_change_password_on_first_login is False

    session_response = client.get("/api/auth/session/")
    assert session_response.status_code == 200
    assert session_response.json()["email"] == "change@example.com"


@pytest.mark.django_db
def test_change_password_rejects_incorrect_current_password():
    user = create_user(
        email="wrongcurrent@example.com",
        password="StrongPass123!",
        first_name="Wendy",
        last_name="Wrong",
    )
    PassengerAuthState.objects.create(user=user, must_change_password_on_first_login=True)
    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/auth/change-password/",
        {
            "currentPassword": "BadPass123!",
            "newPassword": "EvenStronger123!",
            "confirmNewPassword": "EvenStronger123!",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"currentPassword": ["Current password is incorrect."]}
    assert PassengerAuthState.objects.get(user=user).must_change_password_on_first_login is True


@pytest.mark.django_db
def test_change_password_rejects_confirmation_mismatch():
    user = create_user(
        email="mismatch@example.com",
        password="StrongPass123!",
        first_name="Mina",
        last_name="Mismatch",
    )
    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/auth/change-password/",
        {
            "currentPassword": "StrongPass123!",
            "newPassword": "EvenStronger123!",
            "confirmNewPassword": "Different123!",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"confirmNewPassword": ["Passwords do not match."]}


@pytest.mark.django_db
def test_change_password_applies_django_password_validation():
    user = create_user(
        email="validation@example.com",
        password="StrongPass123!",
        first_name="Vera",
        last_name="Validation",
    )
    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/auth/change-password/",
        {
            "currentPassword": "StrongPass123!",
            "newPassword": "short",
            "confirmNewPassword": "short",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "newPassword" in response.json()