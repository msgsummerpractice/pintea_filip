from __future__ import annotations

import re

from django.contrib.auth import authenticate
from django.contrib.auth import login
from django.contrib.auth import logout
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth import get_user_model
from django.middleware.csrf import get_token
from django.db import DatabaseError
from django.db.models import Case as DbCase
from django.db.models import CharField, Count, Value, When
from rest_framework import parsers
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.api.serializers import CaseCreateRequestSerializer
from apps.cases.api.serializers import ChangePasswordRequestSerializer
from apps.cases.api.serializers import CreateColleagueUserRequestSerializer
from apps.cases.api.serializers import LoginRequestSerializer
from apps.cases.api.serializers import SessionUserSerializer
from apps.cases.api.serializers import UserListItemSerializer
from apps.cases.api.serializers import serialize_session_user
from apps.cases.services.airportgap import AirportGapClient
from apps.cases.services.airportgap import AirportGapSearchError
from apps.cases.services.airportgap import UNAVAILABLE_MESSAGE
from apps.cases.services.case_creation import create_case
from apps.cases.services.colleague_accounts import create_colleague_account
from apps.cases.models import PassengerAuthState
from apps.cases.services.compensation import (
    CompensationCalculationError,
    InvalidAirportCodeError,
    calculate_compensation,
)


class IsSystemAdminUser(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class IsAuthenticatedApiUser(BasePermission):
    message = "Authentication credentials were not provided."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated)


class SessionAuthenticationWithUnauthorizedStatus(SessionAuthentication):
    def authenticate_header(self, request) -> str:
        return "Session"


class LoginView(APIView):
    def post(self, request) -> Response:
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request=request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "Invalid e-mail or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        payload = SessionUserSerializer(serialize_session_user(user)).data
        return Response(payload, status=status.HTTP_200_OK)


class SessionView(APIView):
    authentication_classes = [SessionAuthenticationWithUnauthorizedStatus]
    permission_classes = [IsAuthenticatedApiUser]

    def get(self, request) -> Response:
        payload = SessionUserSerializer(serialize_session_user(request.user)).data
        return Response(payload, status=status.HTTP_200_OK)


class LogoutView(APIView):
    authentication_classes = [SessionAuthenticationWithUnauthorizedStatus]
    permission_classes = [IsAuthenticatedApiUser]

    def post(self, request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    authentication_classes = [SessionAuthenticationWithUnauthorizedStatus]
    permission_classes = [IsAuthenticatedApiUser]

    def post(self, request) -> Response:
        serializer = ChangePasswordRequestSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        current_password = serializer.validated_data["currentPassword"]
        if not request.user.check_password(current_password):
            return Response(
                {"currentPassword": ["Current password is incorrect."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(serializer.validated_data["newPassword"])
        request.user.save(update_fields=["password"])
        PassengerAuthState.objects.update_or_create(
            user=request.user,
            defaults={"must_change_password_on_first_login": False},
        )
        update_session_auth_hash(request, request.user)

        payload = SessionUserSerializer(serialize_session_user(request.user)).data
        return Response(payload, status=status.HTTP_200_OK)


class AdminUserListView(APIView):
    permission_classes = [IsSystemAdminUser]

    def get(self, request) -> Response:
        user_model = get_user_model()
        users = (
            user_model.objects.annotate(
                assigned_case_count=Count("passengers__cases", distinct=True),
                passenger_profile_count=Count("passengers", distinct=True),
                derived_role=DbCase(
                    When(is_superuser=True, then=Value("System Admin")),
                    When(is_staff=True, then=Value("Colleague")),
                    When(passenger_profile_count__gt=0, then=Value("Passenger")),
                    default=Value("Passenger"),
                    output_field=CharField(),
                ),
            )
            .order_by("email", "id")
            .distinct()
        )

        payload = [
            {
                "id": user.id,
                "name": (f"{user.first_name.strip()} {user.last_name.strip()}".strip() or user.email),
                "email": user.email,
                "role": user.derived_role,
                "assigned_case_count": user.assigned_case_count,
                "actions": {"edit": False, "delete": False},
            }
            for user in users
        ]
        serializer = UserListItemSerializer(payload, many=True)
        return Response({"results": serializer.data}, status=status.HTTP_200_OK)


class AdminUserCreateView(APIView):
    permission_classes = [IsSystemAdminUser]

    def post(self, request) -> Response:
        serializer = CreateColleagueUserRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = create_colleague_account(
            first_name=serializer.validated_data["firstName"],
            last_name=serializer.validated_data["lastName"],
            email=serializer.validated_data["email"],
            initial_password=serializer.validated_data["initialPassword"],
        )

        return Response(
            {
                "id": result.user.id,
                "email": result.user.email,
                "role": "Colleague",
                "message": "User account created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class CsrfTokenView(APIView):
    def get(self, request) -> Response:
        get_token(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AirportSearchView(APIView):
    def get(self, request) -> Response:
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response({"results": []}, status=status.HTTP_200_OK)

        try:
            options = AirportGapClient().search(query)
        except AirportGapSearchError:
            return Response(
                {"detail": UNAVAILABLE_MESSAGE},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "results": [
                    {
                        "code": option.code,
                        "name": option.name,
                        "city": option.city,
                        "country": option.country,
                        "display_label": option.display_label,
                    }
                    for option in options
                ]
            },
            status=status.HTTP_200_OK,
        )


class CaseCreateView(APIView):
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request) -> Response:
        try:
            serializer = CaseCreateRequestSerializer.from_multipart(request.data, request.FILES)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        serializer.is_valid(raise_exception=True)

        try:
            case = create_case(serializer.validated_data)
        except CompensationCalculationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except DatabaseError:
            return Response(
                {"detail": "Unable to save case at this time."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        compensation = case.compensation_calculation
        return Response(
            {
                "id": case.case_id,
                "caseId": case.case_id,
                "createdAt": case.created_at.isoformat(),
                "status": case.status,
                "compensation": {
                    "distance_km": float(compensation.orthodromic_distance_km),
                    "compensation_eur": compensation.compensation_amount_eur,
                },
            },
            status=status.HTTP_201_CREATED,
        )


IATA_PATTERN = re.compile(r"^[A-Z]{2,4}$")


class CompensationCalculateView(APIView):
    def post(self, request) -> Response:
        from_airport = request.data.get("from_airport", "").strip().upper()
        to_airport = request.data.get("to_airport", "").strip().upper()

        errors = {}
        if not from_airport:
            errors["from_airport"] = ["This field is required."]
        elif not IATA_PATTERN.match(from_airport):
            errors["from_airport"] = ["Must be a valid IATA airport code (2-4 letters)."]

        if not to_airport:
            errors["to_airport"] = ["This field is required."]
        elif not IATA_PATTERN.match(to_airport):
            errors["to_airport"] = ["Must be a valid IATA airport code (2-4 letters)."]

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = calculate_compensation(from_airport, to_airport)
        except InvalidAirportCodeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except CompensationCalculationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "distance_km": float(result.distance_km),
                "compensation_eur": result.compensation_eur,
            },
            status=status.HTTP_200_OK,
        )