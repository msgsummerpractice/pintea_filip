from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import DatabaseError
from django.db import transaction
from django.utils.crypto import get_random_string

from apps.cases.models import Passenger
from apps.cases.models import PassengerAuthState
from apps.cases.api.serializers import normalize_login_email


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PassengerAccountResult:
    user: Any
    created: bool
    passenger: Passenger


def send_initial_password_email(*, email: str, raw_password: str) -> None:
    print(
        "Passenger temporary password generated for "
        f"{email}: {raw_password}"
    )

    try:
        send_mail(
            subject="Your AirAssist account credentials",
            message=(
                f"You can log in with {email}.\n"
                f"Temporary password: {raw_password}\n"
                "You must change this password on first login."
            ),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "webmaster@localhost"),
            recipient_list=[email],
        )
    except Exception:
        # Email is a post-commit side effect; failures must not invalidate the saved case.
        logger.exception("Failed to send initial password email for passenger account.")


def provision_passenger_account(*, passenger: Passenger) -> PassengerAccountResult:
    user_model = get_user_model()
    normalized_email = normalize_login_email(user_model.objects.normalize_email(passenger.email))
    matching_users = list(user_model.objects.filter(email=normalized_email))
    if len(matching_users) > 1:
        raise DatabaseError("Multiple user accounts share the same email address.")

    user = matching_users[0] if matching_users else None
    created = user is None

    if created:
        raw_password = get_random_string(20)
        user = user_model.objects.create_user(
            username=normalized_email,
            email=normalized_email,
            password=raw_password,
            first_name=passenger.first_name,
            last_name=passenger.last_name,
        )

    if created:
        PassengerAuthState.objects.create(
            user=user,
            must_change_password_on_first_login=True,
        )
        transaction.on_commit(lambda: send_initial_password_email(email=user.email, raw_password=raw_password))

    passenger.user = user
    passenger.email = normalized_email
    passenger.save(update_fields=["user", "email"])

    return PassengerAccountResult(user=user, created=created, passenger=passenger)