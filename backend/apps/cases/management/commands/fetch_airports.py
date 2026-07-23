"""Download all airports from AirportGap and cache locally as JSON."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from django.core.management.base import BaseCommand

AIRPORTS_CACHE_PATH = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "airports.json"
BASE_URL = "https://airportgap.com/api/airports"
MAX_PAGES = 210


class Command(BaseCommand):
    help = "Fetch all airports from AirportGap API and save to data/airports.json"

    def handle(self, *args, **options):
        curl_executable = shutil.which("curl.exe") or shutil.which("curl")
        if not curl_executable:
            self.stderr.write(self.style.ERROR("curl not found on PATH"))
            return

        all_airports: list[dict] = []
        page = 1

        while page <= MAX_PAGES:
            url = f"{BASE_URL}?page={page}"
            self.stdout.write(f"Fetching page {page}...")

            try:
                result = subprocess.run(
                    [curl_executable, "--silent", "--show-error", "--fail", url],
                    capture_output=True,
                    check=True,
                )
                data = json.loads(result.stdout.decode("utf-8"))
            except (subprocess.SubprocessError, json.JSONDecodeError) as exc:
                self.stderr.write(self.style.ERROR(f"Failed on page {page}: {exc}"))
                break

            airports = data.get("data", [])
            if not airports:
                break

            for item in airports:
                if not isinstance(item, dict):
                    continue
                attrs = item.get("attributes", {})
                if not isinstance(attrs, dict):
                    continue
                iata = attrs.get("iata", "")
                if not iata:
                    continue
                all_airports.append({
                    "code": iata,
                    "name": attrs.get("name", ""),
                    "city": attrs.get("city", ""),
                    "country": attrs.get("country", ""),
                })

            links = data.get("links", {})
            if not links.get("next") or links.get("self") == links.get("last"):
                break

            page += 1
            time.sleep(0.3)

        AIRPORTS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        AIRPORTS_CACHE_PATH.write_text(
            json.dumps(all_airports, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.stdout.write(self.style.SUCCESS(f"Saved {len(all_airports)} airports to {AIRPORTS_CACHE_PATH}"))
