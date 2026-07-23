from __future__ import annotations

from django.db import models
from django.db.models import Q


class CaseStatus(models.TextChoices):
    NEW = "NEW", "New"
    VALID = "VALID", "Valid"
    ASSIGNED = "ASSIGNED", "Assigned"
    INVALID = "INVALID", "Invalid"


class Passenger(models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    email = models.EmailField()
    phone = models.CharField(max_length=32)
    address = models.CharField(max_length=255)
    postal_code = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Case(models.Model):
    passenger = models.ForeignKey(Passenger, on_delete=models.PROTECT, related_name="cases")
    reservation_number = models.CharField(max_length=50)
    status = models.CharField(max_length=16, choices=CaseStatus.choices, default=CaseStatus.NEW)
    gdpr_consent_primary = models.BooleanField()
    gdpr_consent_secondary = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=CaseStatus.values),
                name="cases_case_status_valid",
            ),
        ]


class FlightLeg(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="flight_legs")
    leg_order = models.PositiveSmallIntegerField()
    flight_date = models.DateField()
    flight_number = models.CharField(max_length=20)
    airline = models.CharField(max_length=100)
    departure_airport_code = models.CharField(max_length=10)
    departure_airport_name = models.CharField(max_length=255)
    destination_airport_code = models.CharField(max_length=10)
    destination_airport_name = models.CharField(max_length=255)
    planned_departure_time = models.DateTimeField()
    planned_arrival_time = models.DateTimeField()
    is_connecting_leg = models.BooleanField(default=False)
    is_problem_flight = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(leg_order__gte=1),
                name="cases_flight_leg_order_gte_1",
            ),
            models.CheckConstraint(
                condition=Q(leg_order=1, is_connecting_leg=False)
                | Q(leg_order__gt=1, is_connecting_leg=True),
                name="cases_flight_leg_connecting_flag_matches_order",
            ),
            models.UniqueConstraint(fields=["case", "leg_order"], name="cases_flight_leg_order_unique"),
            models.UniqueConstraint(
                fields=["case"],
                condition=Q(is_problem_flight=True),
                name="cases_single_problem_flight_per_case",
            ),
        ]
        ordering = ["leg_order", "id"]


class DocumentCategory(models.TextChoices):
    BOARDING_PASS = "BOARDING_PASS", "Boarding Pass"
    IDENTIFICATION = "IDENTIFICATION", "Identification"


class UploadedDocument(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="documents")
    document_category = models.CharField(max_length=32, choices=DocumentCategory.choices)
    original_file_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    file_size_bytes = models.PositiveIntegerField()
    file = models.FileField(upload_to="case-documents/%Y/%m/%d")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(document_category__in=DocumentCategory.values),
                name="cases_uploaded_document_category_valid",
            ),
        ]