from __future__ import annotations

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
        case = create_case(serializer.validated_data)
        return Response({"id": case.pk, "status": case.status}, status=status.HTTP_201_CREATED)