from __future__ import annotations

from unittest.mock import Mock
from unittest.mock import patch

import pytest
import requests
from rest_framework.test import APIClient

from apps.cases.models import Airport


def build_upstream_response(payload: dict) -> Mock:
    response = Mock()
    response.raise_for_status = Mock()
    response.json.return_value = payload
    return response


@patch("apps.cases.services.airportgap.requests.get")
def test_airport_search_returns_empty_results_for_short_queries(mock_get: Mock) -> None:
    response = APIClient().get("/api/airports/search", {"q": "b"})

    assert response.status_code == 200
    assert response.json() == {"results": []}
    mock_get.assert_not_called()


@patch("apps.cases.services.airportgap.requests.get")
@pytest.mark.django_db
def test_airport_search_uses_database_records_before_upstream(mock_get: Mock) -> None:
    Airport.objects.create(
        code="OTP",
        name="Henri Coanda International Airport",
        city="Bucharest",
        country="Romania",
    )

    response = APIClient().get("/api/airports/search", {"q": "bu"})

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "code": "OTP",
                "name": "Henri Coanda International Airport",
                "city": "Bucharest",
                "country": "Romania",
                "display_label": "Bucharest - Henri Coanda International Airport (OTP)",
            }
        ]
    }
    mock_get.assert_not_called()


@patch("apps.cases.services.airportgap._load_airports_cache", return_value=[])
@patch("apps.cases.services.airportgap.requests.get")
def test_airport_search_normalizes_upstream_results(mock_get: Mock, mock_cache: Mock, settings) -> None:
    settings.AIRPORTGAP_API_TOKEN = "test-token"
    mock_get.return_value = build_upstream_response(
        {
            "data": [
                {
                    "attributes": {
                        "iata": "OTP",
                        "name": "Henri Coanda International Airport",
                        "city": "Bucharest",
                        "country": "Romania",
                    }
                },
                {
                    "attributes": {
                        "iata": "BBU",
                        "name": "Aurel Vlaicu International Airport",
                        "city": "Bucharest",
                        "country": "Romania",
                    }
                },
            ]
        }
    )

    response = APIClient().get("/api/airports/search", {"q": "bu"})

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "code": "OTP",
                "name": "Henri Coanda International Airport",
                "city": "Bucharest",
                "country": "Romania",
                "display_label": "Bucharest - Henri Coanda International Airport (OTP)",
            },
            {
                "code": "BBU",
                "name": "Aurel Vlaicu International Airport",
                "city": "Bucharest",
                "country": "Romania",
                "display_label": "Bucharest - Aurel Vlaicu International Airport (BBU)",
            },
        ]
    }
    mock_get.assert_called_once_with(
        "https://airportgap.com/api/airports",
        params={"page": 1},
        headers={"Authorization": "Bearer test-token"},
        timeout=10,
    )


@patch("apps.cases.services.airportgap._load_airports_cache", return_value=[])
@patch("apps.cases.services.airportgap.requests.get")
def test_airport_search_returns_controlled_error_when_upstream_fails(mock_get: Mock, mock_cache: Mock) -> None:
    mock_get.side_effect = requests.RequestException("upstream error")

    response = APIClient().get("/api/airports/search", {"q": "bu"})

    assert response.status_code == 503
    assert response.json() == {"detail": "Airport search is temporarily unavailable."}


@patch("apps.cases.services.airportgap._load_airports_cache", return_value=[])
@patch("apps.cases.services.airportgap.requests.get")
def test_airport_search_returns_controlled_error_for_non_list_upstream_data(mock_get: Mock, mock_cache: Mock) -> None:
    mock_get.return_value = build_upstream_response({"data": {"unexpected": "shape"}})

    response = APIClient().get("/api/airports/search", {"q": "bu"})

    assert response.status_code == 503
    assert response.json() == {"detail": "Airport search is temporarily unavailable."}


@patch("apps.cases.services.airportgap._load_airports_cache", return_value=[])
@patch("apps.cases.services.airportgap.requests.get")
def test_airport_search_skips_malformed_upstream_items(mock_get: Mock, mock_cache: Mock, settings) -> None:
    settings.AIRPORTGAP_API_TOKEN = "test-token"
    mock_get.return_value = build_upstream_response(
        {
            "data": [
                "not-a-dict",
                {"attributes": "not-a-dict"},
                {"attributes": {"iata": None, "name": "Missing code"}},
                {
                    "attributes": {
                        "iata": "OTP",
                        "name": 123,
                        "city": {"unexpected": "value"},
                        "country": None,
                    }
                },
            ]
        }
    )

    response = APIClient().get("/api/airports/search", {"q": "bu"})

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "code": "OTP",
                "name": "",
                "city": "",
                "country": "",
                "display_label": " -  (OTP)",
            }
        ]
    }