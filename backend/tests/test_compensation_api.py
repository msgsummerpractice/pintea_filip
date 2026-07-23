from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.cases.services.compensation import (
    CompensationCalculationError,
    CompensationResult,
    InvalidAirportCodeError,
)


@patch("apps.cases.api.views.calculate_compensation")
def test_compensation_calculate_returns_result(mock_calc) -> None:
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("1868.42"), compensation_eur=400
    )
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "OTP", "to_airport": "CDG"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["distance_km"] == 1868.42
    assert body["compensation_eur"] == 400


def test_compensation_calculate_missing_fields() -> None:
    response = APIClient().post(
        "/api/compensation/calculate",
        data={},
        format="json",
    )
    assert response.status_code == 400
    body = response.json()
    assert "from_airport" in body
    assert "to_airport" in body


def test_compensation_calculate_invalid_format() -> None:
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "123", "to_airport": "!!!"},
        format="json",
    )
    assert response.status_code == 400


@patch("apps.cases.api.views.calculate_compensation")
def test_compensation_calculate_invalid_code_returns_422(mock_calc) -> None:
    mock_calc.side_effect = InvalidAirportCodeError("One or both airport codes are not recognized.")
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "XXX", "to_airport": "YYY"},
        format="json",
    )
    assert response.status_code == 422
    assert "not recognized" in response.json()["detail"]


@patch("apps.cases.api.views.calculate_compensation")
def test_compensation_calculate_service_unavailable(mock_calc) -> None:
    mock_calc.side_effect = CompensationCalculationError("Compensation calculation is temporarily unavailable.")
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "OTP", "to_airport": "CDG"},
        format="json",
    )
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]
