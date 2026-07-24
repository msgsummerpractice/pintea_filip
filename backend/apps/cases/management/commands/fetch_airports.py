"""Refresh airport reference data from AirportGap into the database and local cache."""

from __future__ import annotations

import time

from django.core.management.base import BaseCommand
from django.core.management.base import CommandError

from apps.cases.services.airportgap import AirportGapSearchError
from apps.cases.services.airportgap import refresh_airports


DEFAULT_INTERVAL_SECONDS = 24 * 60 * 60


class Command(BaseCommand):
    help = "Refresh airport reference data from AirportGap API into the Airport table and cache file."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--repeat",
            action="store_true",
            help="Keep running as a timed job instead of refreshing once.",
        )
        parser.add_argument(
            "--interval-seconds",
            type=int,
            default=DEFAULT_INTERVAL_SECONDS,
            help="Delay between refresh runs when --repeat is enabled.",
        )
        parser.add_argument(
            "--max-retries",
            type=int,
            default=None,
            help="Override the configured retry count for upstream refresh failures.",
        )

    def handle(self, *args, **options):
        repeat = options["repeat"]
        interval_seconds = max(1, options["interval_seconds"])
        max_retries = options["max_retries"]

        while True:
            try:
                count = refresh_airports(max_retries=max_retries)
            except AirportGapSearchError as exc:
                message = f"Airport refresh failed: {exc}"
                if not repeat:
                    raise CommandError(message) from exc
                self.stderr.write(self.style.ERROR(message))
            else:
                self.stdout.write(self.style.SUCCESS(f"Refreshed {count} airports."))

            if not repeat:
                break

            time.sleep(interval_seconds)
