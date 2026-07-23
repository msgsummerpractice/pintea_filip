from __future__ import annotations

import re

from django.db import DatabaseError
from rest_framework import parsers
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.api.serializers import CaseCreateRequestSerializer
from apps.cases.services.airportgap import AirportGapClient
from apps.cases.services.airportgap import AirportGapSearchError
from apps.cases.services.airportgap import UNAVAILABLE_MESSAGE
from apps.cases.services.case_creation import create_case
from apps.cases.services.compensation import (
    CompensationCalculationError,
    InvalidAirportCodeError,
    calculate_compensation,
)


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