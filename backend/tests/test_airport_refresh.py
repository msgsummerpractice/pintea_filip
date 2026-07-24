from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import Mock
from unittest.mock import patch

import pytest
import requests
from django.core.management import call_command

from apps.cases.models import Airport
from apps.cases.services.airportgap import refresh_airports


def build_upstream_response(payload: dict) -> Mock:
    response = Mock()
    response.raise_for_status = Mock()
    response.json.return_value = payload
    return response


@pytest.mark.django_db
@patch("apps.cases.services.airportgap.AIRPORTS_CACHE_PATH", new_callable=lambda: Path("unused.json"))
@patch("apps.cases.services.airportgap.requests.get")
def test_refresh_airports_replaces_table_and_cache(mock_get: Mock, mock_cache_path: Path, tmp_path: Path) -> None:
    mock_cache_path.parent.mkdir(parents=True, exist_ok=True)
    mock_cache_path.write_text("[]", encoding="utf-8")
    mock_get.side_effect = [
        build_upstream_response(
            {
                "data": [
                    {
                        "attributes": {
                            "iata": "OTP",
                            "name": "Henri Coanda International Airport",
                            "city": "Bucharest",
                            "country": "Romania",
                        }
                    }
                ],
                "links": {"self": "page=1", "last": "page=2", "next": "page=2"},
            }
        ),
        build_upstream_response(
            {
                "data": [
                    {
                        "attributes": {
                            "iata": "CLJ",
                            "name": "Cluj International Airport",
                            "city": "Cluj-Napoca",
                            "country": "Romania",
                        }
                    }
                ],
                "links": {"self": "page=2", "last": "page=2", "next": None},
            }
        ),
    ]
    Airport.objects.create(code="OLD", name="Old", city="Old", country="Old")

    count = refresh_airports(max_retries=0, retry_delay_seconds=0)

    assert count == 2
    assert list(Airport.objects.values_list("code", flat=True)) == ["OTP", "CLJ"]
    assert json.loads(mock_cache_path.read_text(encoding="utf-8")) == [
        {
            "code": "OTP",
            "name": "Henri Coanda International Airport",
            "city": "Bucharest",
            "country": "Romania",
        },
        {
            "code": "CLJ",
            "name": "Cluj International Airport",
            "city": "Cluj-Napoca",
            "country": "Romania",
        },
    ]


@pytest.mark.django_db
@patch("apps.cases.services.airportgap.AIRPORTS_CACHE_PATH", new_callable=lambda: Path("unused.json"))
@patch("apps.cases.services.airportgap.time.sleep")
@patch("apps.cases.services.airportgap.requests.get")
def test_refresh_airports_retries_after_upstream_failure(mock_get: Mock, mock_sleep: Mock, mock_cache_path: Path) -> None:
    mock_cache_path.parent.mkdir(parents=True, exist_ok=True)
    mock_get.side_effect = [
        requests.RequestException("temporary failure"),
        build_upstream_response(
            {
                "data": [
                    {
                        "attributes": {
                            "iata": "OTP",
                            "name": "Henri Coanda International Airport",
                            "city": "Bucharest",
                            "country": "Romania",
                        }
                    }
                ],
                "links": {"self": "page=1", "last": "page=1", "next": None},
            }
        ),
    ]

    count = refresh_airports(max_retries=1, retry_delay_seconds=0)

    assert count == 1
    assert Airport.objects.values_list("code", flat=True).get() == "OTP"
    mock_sleep.assert_called_once_with(1.0)


@pytest.mark.django_db
@patch("apps.cases.services.airportgap.AIRPORTS_CACHE_PATH", new_callable=lambda: Path("unused.json"))
@patch("apps.cases.services.airportgap.time.sleep")
@patch("apps.cases.services.airportgap.AirportGapClient._fetch_page_with_curl")
@patch("apps.cases.services.airportgap.requests.get")
def test_refresh_airports_restarts_with_curl_after_ssl_failure(
    mock_get: Mock,
    mock_fetch_page_with_curl: Mock,
    mock_sleep: Mock,
    mock_cache_path: Path,
) -> None:
    mock_cache_path.parent.mkdir(parents=True, exist_ok=True)
    mock_get.side_effect = requests.exceptions.SSLError("cert failure")
    mock_fetch_page_with_curl.side_effect = [
        (
            [
                {
                    "attributes": {
                        "iata": "OTP",
                        "name": "Henri Coanda International Airport",
                        "city": "Bucharest",
                        "country": "Romania",
                    }
                }
            ],
            False,
        )
    ]

    count = refresh_airports(max_retries=0, retry_delay_seconds=0)

    assert count == 1
    assert Airport.objects.values_list("code", flat=True).get() == "OTP"
    mock_fetch_page_with_curl.assert_called_once_with(1)
    mock_sleep.assert_not_called()


@pytest.mark.django_db
@patch("apps.cases.services.airportgap.AIRPORTS_CACHE_PATH", new_callable=lambda: Path("unused.json"))
@patch("apps.cases.services.airportgap.time.sleep")
@patch("apps.cases.services.airportgap.AirportGapClient._fetch_page")
def test_refresh_airports_retries_transient_page_failure(
    mock_fetch_page: Mock,
    mock_sleep: Mock,
    mock_cache_path: Path,
) -> None:
    mock_cache_path.parent.mkdir(parents=True, exist_ok=True)
    mock_fetch_page.side_effect = [
        requests.RequestException("temporary page failure"),
        (
            [
                {
                    "attributes": {
                        "iata": "OTP",
                        "name": "Henri Coanda International Airport",
                        "city": "Bucharest",
                        "country": "Romania",
                    }
                }
            ],
            False,
        ),
    ]

    count = refresh_airports(max_retries=0, retry_delay_seconds=0)

    assert count == 1
    assert Airport.objects.values_list("code", flat=True).get() == "OTP"
    mock_sleep.assert_called_once_with(1.0)


@patch("apps.cases.management.commands.fetch_airports.refresh_airports", return_value=2)
@patch("apps.cases.management.commands.fetch_airports.time.sleep", side_effect=KeyboardInterrupt)
def test_fetch_airports_repeat_mode_runs_as_timed_job(mock_sleep: Mock, mock_refresh: Mock) -> None:
    try:
        call_command("fetch_airports", repeat=True, interval_seconds=5, max_retries=0)
    except KeyboardInterrupt:
        pass

    mock_refresh.assert_called_once_with(max_retries=0)
    mock_sleep.assert_called_once_with(5)