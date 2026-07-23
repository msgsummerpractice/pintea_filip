from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import requests
from django.conf import settings


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
        airports = _load_airports_cache()
        if airports:
            return self._search_local(query, airports)
        return self._search_remote(query)

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
            response = requests.get(
                self.base_url,
                params={"page": 1},
                headers=self._build_headers(),
                timeout=10,
            )
            response.raise_for_status()
            payload = response.json().get("data", [])
            if not isinstance(payload, list):
                raise TypeError("AirportGap data payload must be a list.")
        except requests.exceptions.SSLError:
            return self._search_remote_with_curl(query)
        except (requests.RequestException, ValueError, AttributeError, TypeError) as exc:
            raise AirportGapSearchError(UNAVAILABLE_MESSAGE) from exc

        return self._build_options(payload)

    def _search_remote_with_curl(self, query: str) -> list[AirportOption]:
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
            "page=1",
        ]

        for header_name, header_value in self._build_headers().items():
            command.extend(["-H", f"{header_name}: {header_value}"])

        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
            )
            payload = json.loads(completed.stdout.decode("utf-8")).get("data", [])
            if not isinstance(payload, list):
                raise TypeError("AirportGap data payload must be a list.")
        except (subprocess.SubprocessError, json.JSONDecodeError, TypeError) as exc:
            raise AirportGapSearchError(UNAVAILABLE_MESSAGE) from exc

        return self._build_options(payload)

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