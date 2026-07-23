from __future__ import annotations

from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
import requests

from apps.cases.services.compensation import (
    CompensationCalculationError,
    CompensationResult,
    InvalidAirportCodeError,
    calculate_compensation,
)


def _build_distance_response(km: float) -> dict:
    return {
        "data": {
            "attributes": {
                "from_airport": {"iata": "OTP"},
                "to_airport": {"iata": "CDG"},
                "kilometers": km,
                "miles": km * 0.621371,
                "nautical_miles": km * 0.539957,
            },
            "id": "OTP-CDG",
            "type": "airport_distance",
        }
    }


def _mock_post_success(km: float) -> Mock:
    response = Mock()
    response.status_code = 200
    response.ok = True
    response.json.return_value = _build_distance_response(km)
    return response


def _mock_post_error(status_code: int) -> Mock:
    response = Mock()
    response.status_code = status_code
    response.ok = False
    return response


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_below_1500km(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_success(1200.50)
    result = calculate_compensation("OTP", "VIE")
    assert result == CompensationResult(distance_km=Decimal("1200.5"), compensation_eur=250)


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_at_1500km(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_success(1500.0)
    result = calculate_compensation("OTP", "CDG")
    assert result == CompensationResult(distance_km=Decimal("1500.0"), compensation_eur=400)


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_between_1500_and_3500km(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_success(2500.0)
    result = calculate_compensation("OTP", "CDG")
    assert result == CompensationResult(distance_km=Decimal("2500.0"), compensation_eur=400)


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_at_3500km(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_success(3500.0)
    result = calculate_compensation("OTP", "JFK")
    assert result == CompensationResult(distance_km=Decimal("3500.0"), compensation_eur=400)


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_above_3500km(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_success(3501.0)
    result = calculate_compensation("OTP", "JFK")
    assert result == CompensationResult(distance_km=Decimal("3501.0"), compensation_eur=600)


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_raises_on_422(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_error(422)
    with pytest.raises(InvalidAirportCodeError):
        calculate_compensation("XXX", "YYY")


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_raises_on_server_error(mock_post: Mock) -> None:
    mock_post.return_value = _mock_post_error(500)
    with pytest.raises(CompensationCalculationError):
        calculate_compensation("OTP", "CDG")


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_raises_on_timeout(mock_post: Mock) -> None:
    mock_post.side_effect = requests.exceptions.Timeout("timeout")
    with pytest.raises(CompensationCalculationError):
        calculate_compensation("OTP", "CDG")


@patch("apps.cases.services.compensation.requests.post")
def test_calculate_compensation_ssl_error_falls_back_to_curl(mock_post: Mock) -> None:
    mock_post.side_effect = requests.exceptions.SSLError("ssl error")
    with patch("apps.cases.services.compensation._call_distance_api_with_curl") as mock_curl:
        mock_curl.return_value = _build_distance_response(2000.0)
        result = calculate_compensation("OTP", "CDG")
        assert result.compensation_eur == 400
        mock_curl.assert_called_once_with("OTP", "CDG")
