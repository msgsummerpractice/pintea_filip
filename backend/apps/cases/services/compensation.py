from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from decimal import Decimal

import requests
from django.conf import settings


class CompensationCalculationError(Exception):
    pass


class InvalidAirportCodeError(Exception):
    pass


UNAVAILABLE_MESSAGE = "Compensation calculation is temporarily unavailable."
INVALID_CODE_MESSAGE = "One or both airport codes are not recognized."

DISTANCE_API_URL = "https://airportgap.com/api/airports/distance"


@dataclass(frozen=True, slots=True)
class CompensationResult:
    distance_km: Decimal
    compensation_eur: int


def _determine_compensation(distance_km: Decimal) -> int:
    if distance_km < 1500:
        return 250
    if distance_km <= 3500:
        return 400
    return 600


def _build_headers() -> dict[str, str]:
    token = getattr(settings, "AIRPORTGAP_API_TOKEN", "").strip()
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _parse_distance_response(body: dict) -> Decimal:
    try:
        km = body["data"]["attributes"]["kilometers"]
        return Decimal(str(km))
    except (KeyError, TypeError, ValueError) as exc:
        raise CompensationCalculationError(UNAVAILABLE_MESSAGE) from exc


def _call_distance_api(from_code: str, to_code: str) -> dict:
    try:
        response = requests.post(
            DISTANCE_API_URL,
            data={"from": from_code, "to": to_code},
            headers=_build_headers(),
            timeout=10,
        )
    except requests.exceptions.SSLError:
        return _call_distance_api_with_curl(from_code, to_code)
    except requests.RequestException as exc:
        raise CompensationCalculationError(UNAVAILABLE_MESSAGE) from exc

    if response.status_code == 422:
        raise InvalidAirportCodeError(INVALID_CODE_MESSAGE)

    if not response.ok:
        raise CompensationCalculationError(UNAVAILABLE_MESSAGE)

    try:
        return response.json()
    except (ValueError, AttributeError) as exc:
        raise CompensationCalculationError(UNAVAILABLE_MESSAGE) from exc


def _call_distance_api_with_curl(from_code: str, to_code: str) -> dict:
    curl_executable = shutil.which("curl.exe") or shutil.which("curl")
    if not curl_executable:
        raise CompensationCalculationError(UNAVAILABLE_MESSAGE)

    command = [
        curl_executable,
        "--silent",
        "--show-error",
        "--fail",
        "-X", "POST",
        "-d", f"from={from_code}&to={to_code}",
        DISTANCE_API_URL,
    ]

    for header_name, header_value in _build_headers().items():
        command.extend(["-H", f"{header_name}: {header_value}"])

    try:
        completed = subprocess.run(command, check=True, capture_output=True)
        return json.loads(completed.stdout.decode("utf-8"))
    except (subprocess.SubprocessError, json.JSONDecodeError) as exc:
        raise CompensationCalculationError(UNAVAILABLE_MESSAGE) from exc


def calculate_compensation(from_code: str, to_code: str) -> CompensationResult:
    body = _call_distance_api(from_code, to_code)
    distance_km = _parse_distance_response(body)
    compensation_eur = _determine_compensation(distance_km)
    return CompensationResult(distance_km=distance_km, compensation_eur=compensation_eur)
