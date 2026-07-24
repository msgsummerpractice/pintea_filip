from __future__ import annotations

import json
import shutil
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import requests
from django.conf import settings
from django.db import OperationalError
from django.db import ProgrammingError
from django.db import transaction
from django.db.models import Q

from apps.cases.models import Airport


AIRPORTS_CACHE_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "airports.json"


@dataclass(frozen=True, slots=True)
class AirportOption:
    code: str
    name: str
    city: str
    country: str

    @property
    def display_label(self) -> str:
        return f"{self.city} - {self.name} ({self.code})"


class AirportGapSearchError(Exception):
    pass


UNAVAILABLE_MESSAGE = "Airport search is temporarily unavailable."
PAGE_FETCH_RETRY_COUNT = 3
PAGE_FETCH_RETRY_DELAY_SECONDS = 1.0
PAGE_FETCH_DELAY_SECONDS = 0.3


_airports_cache: list[dict] | None = None


def _load_airports_cache() -> list[dict]:
    global _airports_cache
    if _airports_cache is not None:
        return _airports_cache

    if not AIRPORTS_CACHE_PATH.exists():
        return []

    try:
        data = json.loads(AIRPORTS_CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, list):
            _airports_cache = data
            return _airports_cache
    except (json.JSONDecodeError, OSError):
        pass

    return []


def _write_airports_cache(airports: list[dict]) -> None:
    global _airports_cache
    AIRPORTS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    AIRPORTS_CACHE_PATH.write_text(
        json.dumps(airports, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _airports_cache = airports


def _normalize_retryable_error(exc: Exception) -> AirportGapSearchError:
    if isinstance(exc, AirportGapSearchError):
        return exc
    return AirportGapSearchError(UNAVAILABLE_MESSAGE)


class AirportGapClient:
    base_url = "https://airportgap.com/api/airports"

    @staticmethod
    def _normalize_text(value: object) -> str:
        return value if isinstance(value, str) else ""

    @staticmethod
    def _build_headers() -> dict[str, str]:
        token = settings.AIRPORTGAP_API_TOKEN.strip()
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}

    def search(self, query: str) -> list[AirportOption]:
        database_results = self._search_database(query)
        if database_results is not None:
            return database_results

        airports = _load_airports_cache()
        if airports:
            return self._search_local(query, airports)
        return self._search_remote(query)

    def _search_database(self, query: str) -> list[AirportOption] | None:
        try:
            queryset = Airport.objects.only("code", "name", "city", "country")
            if not queryset.exists():
                return None

            matches = queryset.filter(
                Q(code__icontains=query)
                | Q(name__icontains=query)
                | Q(city__icontains=query)
                | Q(country__icontains=query)
            )[:30]
        except (OperationalError, ProgrammingError, RuntimeError):
            return None

        return [
            AirportOption(
                code=airport.code,
                name=airport.name,
                city=airport.city,
                country=airport.country,
            )
            for airport in matches
        ]

    def _search_local(self, query: str, airports: list[dict]) -> list[AirportOption]:
        query_lower = query.lower()
        results: list[AirportOption] = []

        for airport in airports:
            code = airport.get("code", "")
            name = airport.get("name", "")
            city = airport.get("city", "")
            country = airport.get("country", "")

            searchable = f"{code} {name} {city} {country}".lower()
            if query_lower in searchable:
                results.append(
                    AirportOption(
                        code=code,
                        name=name,
                        city=city,
                        country=country,
                    )
                )

            if len(results) >= 30:
                break

        return results

    def _search_remote(self, query: str) -> list[AirportOption]:
        try:
            payload, _has_next = self._fetch_page(1)
        except requests.exceptions.SSLError:
            return self._search_remote_with_curl(query)
        except (requests.RequestException, ValueError, AttributeError, TypeError) as exc:
            raise AirportGapSearchError(UNAVAILABLE_MESSAGE) from exc

        return self._build_options(payload)

    def _fetch_page(self, page: int) -> tuple[list[object], bool]:
        response = requests.get(
            self.base_url,
            params={"page": page},
            headers=self._build_headers(),
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data", [])
        if not isinstance(data, list):
            raise TypeError("AirportGap data payload must be a list.")

        links = payload.get("links", {})
        has_next = isinstance(links, dict) and bool(links.get("next")) and links.get("self") != links.get("last")
        return data, has_next

    def _search_remote_with_curl(self, query: str) -> list[AirportOption]:
        payload, _has_next = self._fetch_page_with_curl(1)
        return self._build_options(payload)

    def _fetch_page_with_curl(self, page: int) -> tuple[list[object], bool]:
        curl_executable = shutil.which("curl.exe") or shutil.which("curl")
        if not curl_executable:
            raise AirportGapSearchError(UNAVAILABLE_MESSAGE)

        command = [
            curl_executable,
            "--silent",
            "--show-error",
            "--fail",
            "--get",
            self.base_url,
            "--data-urlencode",
            f"page={page}",
        ]

        for header_name, header_value in self._build_headers().items():
            command.extend(["-H", f"{header_name}: {header_value}"])

        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
            )
            document = json.loads(completed.stdout.decode("utf-8"))
            payload = document.get("data", [])
            if not isinstance(payload, list):
                raise TypeError("AirportGap data payload must be a list.")
        except (subprocess.SubprocessError, json.JSONDecodeError, TypeError) as exc:
            raise AirportGapSearchError(UNAVAILABLE_MESSAGE) from exc

        links = document.get("links", {})
        has_next = isinstance(links, dict) and bool(links.get("next")) and links.get("self") != links.get("last")
        return payload, has_next

    def _build_options(self, payload: list[object]) -> list[AirportOption]:
        options: list[AirportOption] = []
        for item in payload:
            if not isinstance(item, dict):
                continue

            attributes = item.get("attributes", {})
            if not isinstance(attributes, dict):
                continue

            code = attributes.get("iata")
            if not isinstance(code, str) or not code:
                continue

            options.append(
                AirportOption(
                    code=code,
                    name=self._normalize_text(attributes.get("name")),
                    city=self._normalize_text(attributes.get("city")),
                    country=self._normalize_text(attributes.get("country")),
                )
            )

        return options


def fetch_all_airports() -> list[dict[str, str]]:
    client = AirportGapClient()
    try:
        return _fetch_all_airports_by_page(client._fetch_page, client, propagate_ssl_errors=True)
    except requests.exceptions.SSLError:
        return _fetch_all_airports_by_page(client._fetch_page_with_curl, client)
    except (requests.RequestException, ValueError, AttributeError, TypeError, subprocess.SubprocessError) as exc:
        raise AirportGapSearchError(UNAVAILABLE_MESSAGE) from exc


def _fetch_all_airports_by_page(
    fetch_page: Callable[[int], tuple[list[object], bool]],
    client: AirportGapClient,
    *,
    propagate_ssl_errors: bool = False,
) -> list[dict[str, str]]:
    page = 1
    airports: list[dict[str, str]] = []

    while True:
        page_attempt = 0
        while True:
            try:
                payload, has_next = fetch_page(page)
                break
            except (AirportGapSearchError, requests.RequestException, ValueError, AttributeError, TypeError, subprocess.SubprocessError) as exc:
                if propagate_ssl_errors and isinstance(exc, requests.exceptions.SSLError):
                    raise
                if page_attempt >= PAGE_FETCH_RETRY_COUNT:
                    raise _normalize_retryable_error(exc) from exc
                page_attempt += 1
                time.sleep(PAGE_FETCH_RETRY_DELAY_SECONDS * page_attempt)

        for option in client._build_options(payload):
            airports.append(
                {
                    "code": option.code,
                    "name": option.name,
                    "city": option.city,
                    "country": option.country,
                }
            )

        if not has_next:
            return airports

        page += 1
        time.sleep(PAGE_FETCH_DELAY_SECONDS)


def refresh_airports(*, max_retries: int | None = None, retry_delay_seconds: float = 1.0) -> int:
    retries = settings.AIRPORT_REFRESH_MAX_RETRIES if max_retries is None else max_retries
    attempt = 0

    while True:
        try:
            airports = fetch_all_airports()
            break
        except AirportGapSearchError as exc:
            if attempt >= retries:
                raise _normalize_retryable_error(exc) from exc
            attempt += 1
            time.sleep(retry_delay_seconds * attempt)

    with transaction.atomic():
        Airport.objects.all().delete()
        Airport.objects.bulk_create(
            [Airport(**airport) for airport in airports],
            batch_size=500,
        )

    _write_airports_cache(airports)
    return len(airports)