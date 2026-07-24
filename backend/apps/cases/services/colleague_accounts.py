from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import IntegrityError
from django.db import transaction
from rest_framework import serializers

from apps.cases.models import PassengerAuthState
from apps.cases.api.serializers import normalize_login_email


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ColleagueAccountResult:
    user: Any


def send_colleague_credentials_email(*, email: str, raw_password: str) -> None:
    try:
        send_mail(
            subject="Your AirAssist colleague account",
            message=(
                f"You can log in with {email}.\n"
                f"Temporary password: {raw_password}\n"
                "You must change this password on first login."
            ),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "webmaster@localhost"),
            recipient_list=[email],
        )
    except Exception:
        logger.exception("Failed to send initial password email for colleague account.")


def create_colleague_account(
    *,
    first_name: str,
    last_name: str,
    email: str,
    initial_password: str,
) -> ColleagueAccountResult:
    user_model = get_user_model()
    normalized_email = normalize_login_email(user_model.objects.normalize_email(email))
    username_field_name = user_model.USERNAME_FIELD

    with transaction.atomic():
        try:
            user = user_model.objects.create_user(
                username=normalized_email,
                email=normalized_email,
                password=initial_password,
                first_name=first_name,
                last_name=last_name,
                is_staff=True,
                is_superuser=False,
                is_active=True,
            )
        except IntegrityError as exc:
            if user_model.objects.filter(**{username_field_name: normalized_email}).exists():
                raise serializers.ValidationError(
                    {"email": ["A user with this e-mail already exists."]}
                ) from exc
            raise
        PassengerAuthState.objects.update_or_create(
            user=user,
            defaults={"must_change_password_on_first_login": True},
        )
        transaction.on_commit(
            lambda: send_colleague_credentials_email(
                email=user.email,
                raw_password=initial_password,
            )
        )

    return ColleagueAccountResult(user=user)