from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

from apps.cases.api.serializers import normalize_login_email


class EmailOrUsernameModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        user_model = get_user_model()
        login_identifier = username or kwargs.get(user_model.USERNAME_FIELD) or kwargs.get("email")
        if login_identifier is None or password is None:
            return None

        normalized_identifier = normalize_login_email(user_model.objects.normalize_email(login_identifier))
        users = list(user_model.objects.filter(email=normalized_identifier))
        if len(users) == 1:
            user = users[0]
            if user.check_password(password) and self.user_can_authenticate(user):
                return user

        return super().authenticate(request, username=normalized_identifier, password=password, **kwargs)