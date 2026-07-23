# Case Entry Implementation Plan

> **Execution:** Use subagent-driven development to implement this plan task-by-task.

**Goal:** Build the initial React, Django, and PostgreSQL project foundation and deliver a public staged case-entry wizard that creates a new compensation case with status `NEW`.

**Architecture:** The solution is split into a React frontend in `frontend/` and a Django REST backend in `backend/`, with PostgreSQL configured as a developer-managed local service on the user's machine. The frontend owns the animated gated wizard and client-side validation, while the backend owns authoritative validation, airport lookup proxying, multipart upload handling, and transactional persistence.

**Tech Stack:** React 19 + TypeScript + Vite, React Router, React Hook Form, Zod, Framer Motion, Django 5, Django REST Framework, psycopg, PostgreSQL 16, pytest, Vitest, Testing Library

**Design Spec:** `documentation/spec-driven/specs/2026-07-23-case-entry-design.md`

---

## Planned File Structure

### Root

- Create: `.env.example` for shared environment variable examples
- Modify: `README.md` with setup and verification commands

### Backend

- Create: `backend/manage.py`
- Create: `backend/pyproject.toml`
- Create: `backend/pytest.ini`
- Create: `backend/.env.example`
- Create: `backend/config/__init__.py`
- Create: `backend/config/settings.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/asgi.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/config/api_urls.py`
- Create: `backend/apps/cases/__init__.py`
- Create: `backend/apps/cases/apps.py`
- Create: `backend/apps/cases/models.py`
- Create: `backend/apps/cases/migrations/__init__.py`
- Create: `backend/apps/cases/services/__init__.py`
- Create: `backend/apps/cases/services/airportgap.py`
- Create: `backend/apps/cases/services/case_creation.py`
- Create: `backend/apps/cases/api/__init__.py`
- Create: `backend/apps/cases/api/serializers.py`
- Create: `backend/apps/cases/api/views.py`
- Create: `backend/apps/cases/api/urls.py`
- Create: `backend/apps/cases/tests/test_airport_search_api.py`
- Create: `backend/apps/cases/tests/test_case_creation_api.py`
- Create: `backend/apps/cases/tests/factories.py`

### Frontend

- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/app/styles/tokens.css`
- Create: `frontend/src/app/styles/global.css`
- Create: `frontend/src/lib/http.ts`
- Create: `frontend/src/features/case-entry/types.ts`
- Create: `frontend/src/features/case-entry/schema.ts`
- Create: `frontend/src/features/case-entry/api.ts`
- Create: `frontend/src/features/case-entry/hooks/useCaseEntryWizard.ts`
- Create: `frontend/src/features/case-entry/components/CaseEntryPage.tsx`
- Create: `frontend/src/features/case-entry/components/ProgressStepper.tsx`
- Create: `frontend/src/features/case-entry/components/StepFrame.tsx`
- Create: `frontend/src/features/case-entry/components/AirportAutocomplete.tsx`
- Create: `frontend/src/features/case-entry/components/ConnectingFlightsEditor.tsx`
- Create: `frontend/src/features/case-entry/components/steps/ItineraryStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/ComplianceStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/FlightDetailsStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/PassengerDetailsStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/DocumentsStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/ReviewSubmitStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/LockedDisruptionStep.tsx`
- Create: `frontend/src/features/case-entry/__tests__/CaseEntryPage.test.tsx`
- Create: `frontend/src/features/case-entry/__tests__/ConnectingFlightsEditor.test.tsx`
- Create: `frontend/src/test/setup.ts`

## Task Breakdown

### Task 1: Scaffold Root Workspace and Local Infrastructure

**Files:**
- Create: `.env.example`
- Modify: `README.md`

**Requirements:**
- Document the required local PostgreSQL service configuration for one-machine development.
- Document the split frontend/backend workspace.
- Document base commands needed for setup, running, and tests.

**Implementation:**

```env
# .env.example
POSTGRES_DB=airassist
POSTGRES_USER=airassist
POSTGRES_PASSWORD=airassist
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=true
AIRPORTGAP_API_TOKEN=
VITE_API_BASE_URL=http://localhost:8000/api
```

```md
# README.md
## Development

1. Install PostgreSQL 16 locally and create a database named `airassist` with a local user that matches `.env.example`
2. Confirm PostgreSQL is listening on `localhost:5432`
3. Start backend: `cd backend && uv sync && uv run python manage.py migrate && uv run python manage.py runserver`
4. Start frontend: `cd frontend && npm install && npm run dev`
```

**Testing:**

```text
Verify that the README documents local PostgreSQL setup on the developer's machine and that the commands match the actual project structure.
```

**Verification:**
- Confirm `README.md` documents local PostgreSQL installation, database creation, and connection expectations.
- Confirm `README.md` includes backend, frontend, and test commands.

### Task 2: Create Django Project Foundation and Environment Configuration

**Files:**
- Create: `backend/manage.py`
- Create: `backend/pyproject.toml`
- Create: `backend/pytest.ini`
- Create: `backend/.env.example`
- Create: `backend/config/__init__.py`
- Create: `backend/config/settings.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/api_urls.py`
- Create: `backend/config/asgi.py`
- Create: `backend/config/wsgi.py`

**Requirements:**
- Set up Django, DRF, CORS support, and PostgreSQL configuration.
- Enable media uploads for local development.
- Register the future `cases` app and API routing.

**Implementation:**

```toml
# backend/pyproject.toml
[project]
name = "airassist-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "django>=5.1,<5.2",
  "djangorestframework>=3.15,<3.16",
  "django-cors-headers>=4.4,<4.5",
  "psycopg[binary]>=3.2,<3.3",
  "python-dotenv>=1.0,<2.0",
  "requests>=2.32,<3.0"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3,<9.0",
  "pytest-django>=4.9,<5.0"
]
```

```python
# backend/config/settings.py
INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "apps.cases",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="airassist"),
        "USER": env("POSTGRES_USER", default="airassist"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="airassist"),
        "HOST": env("POSTGRES_HOST", default="localhost"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
```

```python
# backend/config/api_urls.py
from django.urls import include, path

urlpatterns = [
  path("", include("apps.cases.api.urls")),
]
```

**Testing:**

```python
from django.conf import settings


def test_cors_origin_is_configured() -> None:
  assert "http://localhost:5173" in settings.CORS_ALLOWED_ORIGINS
```

**Verification:**
- Run `cd backend && uv sync`.
- Run `cd backend && uv run python manage.py check` and expect no system check errors.

### Task 3: Implement Case Domain Models and Initial Migration

**Files:**
- Create: `backend/apps/cases/__init__.py`
- Create: `backend/apps/cases/apps.py`
- Create: `backend/apps/cases/models.py`
- Create: `backend/apps/cases/migrations/__init__.py`
- Modify: `backend/config/settings.py`

**Requirements:**
- Model case, passenger, flight leg, and document entities.
- Support status vocabulary with `NEW`, `VALID`, `ASSIGNED`, and `INVALID`.
- Represent connecting flights and problem-flight selection.

**Implementation:**

```python
# backend/apps/cases/models.py
from django.db import models


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
```

**Testing:**

```python
from apps.cases.models import CaseStatus


def test_case_status_values() -> None:
    assert {choice for choice, _label in CaseStatus.choices} == {
        "NEW",
        "VALID",
        "ASSIGNED",
        "INVALID",
    }
```

**Verification:**
- Run `cd backend && uv run python manage.py makemigrations cases`.
- Run `cd backend && uv run python manage.py migrate`.

### Task 4: Implement Airport Search Service and Public Search API

**Files:**
- Create: `backend/apps/cases/services/airportgap.py`
- Create: `backend/apps/cases/api/views.py`
- Create: `backend/apps/cases/api/urls.py`
- Create: `backend/apps/cases/tests/test_airport_search_api.py`
- Modify: `backend/config/api_urls.py`

**Requirements:**
- Proxy airport search through the backend.
- Normalize AirportGap results for the frontend.
- Fail safely when the upstream API is unavailable.

**Implementation:**

```python
# backend/apps/cases/services/airportgap.py
from dataclasses import dataclass

import requests
from django.conf import settings


@dataclass(slots=True)
class AirportOption:
    code: str
    name: str
    city: str
    country: str

    @property
    def display_label(self) -> str:
        return f"{self.city} - {self.name} ({self.code})"


class AirportGapClient:
    base_url = "https://airportgap.com/api/airports"

    def search(self, query: str) -> list[AirportOption]:
        response = requests.get(
            self.base_url,
            params={"q": query},
            headers={"Authorization": f"Bearer {settings.AIRPORTGAP_API_TOKEN}"},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json().get("data", [])
        return [
            AirportOption(
                code=item["attributes"]["iata"],
                name=item["attributes"]["name"],
                city=item["attributes"].get("city", ""),
                country=item["attributes"].get("country", ""),
            )
            for item in payload
            if item["attributes"].get("iata")
        ]
```

```python
# backend/apps/cases/api/views.py
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.services.airportgap import AirportGapClient
from apps.cases.api.serializers import CaseEntrySerializer
from apps.cases.services.case_creation import create_case


class AirportSearchView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response({"results": []})

        options = AirportGapClient().search(query)
        return Response(
            {
                "results": [
                    {
                        "code": option.code,
                        "name": option.name,
                        "city": option.city,
                        "country": option.country,
                        "display_label": option.display_label,
                    }
                    for option in options
                ]
            },
            status=status.HTTP_200_OK,
        )


      class CaseCreateView(APIView):
        def post(self, request):
          serializer = CaseEntrySerializer.from_multipart(request.data, request.FILES)
          serializer.is_valid(raise_exception=True)
          case = create_case(serializer.validated_data)
          return Response(
            {
              "case_id": case.pk,
              "status": case.status,
              "created_at": case.created_at.isoformat(),
              "confirmation_message": "Case created successfully.",
            },
            status=status.HTTP_201_CREATED,
          )
```

**Testing:**

```python
from unittest.mock import patch

from rest_framework.test import APIClient


@patch("apps.cases.api.views.AirportGapClient.search")
def test_airport_search_returns_normalized_payload(search_mock) -> None:
    search_mock.return_value = []
    response = APIClient().get("/api/airports/search", {"q": "bu"})
    assert response.status_code == 200
    assert response.json() == {"results": []}
```

**Verification:**
- Run `cd backend && uv run pytest apps/cases/tests/test_airport_search_api.py`.
- Call `GET /api/airports/search?q=bu` and confirm JSON contains `results` entries.

### Task 5: Implement Case Creation Serializer, Validation, and Transactional Service

**Files:**
- Create: `backend/apps/cases/api/serializers.py`
- Create: `backend/apps/cases/services/case_creation.py`
- Modify: `backend/apps/cases/api/views.py`
- Modify: `backend/apps/cases/api/urls.py`
- Modify: `backend/apps/cases/models.py`

**Requirements:**
- Accept multipart form data with nested JSON and two files.
- Enforce required fields, regex validation, connection rules, and GDPR consent.
- Persist passenger, case, flight legs, and documents atomically.

**Implementation:**

```python
# backend/apps/cases/api/serializers.py
import json
import re
from datetime import date

from rest_framework import serializers

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9()\-\s]{7,20}$")
ALLOWED_UPLOAD_TYPES = {"application/pdf", "image/jpeg"}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024


class AirportSelectionSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)
    name = serializers.CharField(max_length=255)


class FlightLegInputSerializer(serializers.Serializer):
    flight_date = serializers.DateField()
    flight_number = serializers.CharField(max_length=20)
    airline = serializers.CharField(max_length=100)
    departure_airport = AirportSelectionSerializer()
    destination_airport = AirportSelectionSerializer()
    planned_departure_time = serializers.DateTimeField()
    planned_arrival_time = serializers.DateTimeField()
    is_problem_flight = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if attrs["planned_arrival_time"] <= attrs["planned_departure_time"]:
            raise serializers.ValidationError("Planned arrival time must be after planned departure time.")
        return attrs


class CaseEntrySerializer(serializers.Serializer):
    reservation_number = serializers.CharField(max_length=50)
    primary_flight = FlightLegInputSerializer()
    connecting_flights = FlightLegInputSerializer(many=True, required=False)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    date_of_birth = serializers.DateField()
    email = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=32)
    address = serializers.CharField(max_length=255)
    postal_code = serializers.CharField(max_length=32)
    gdpr_consent_primary = serializers.BooleanField()
    gdpr_consent_secondary = serializers.BooleanField()
    boarding_pass = serializers.FileField()
    identification_document = serializers.FileField()

    def validate_date_of_birth(self, value: date) -> date:
        if value >= date.today():
            raise serializers.ValidationError("Date of birth must be earlier than today.")
        return value

    def validate_email(self, value: str) -> str:
        if not EMAIL_RE.match(value):
            raise serializers.ValidationError("Enter a valid email address.")
        return value

    def validate_phone(self, value: str) -> str:
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid phone number.")
        return value

    def validate(self, attrs):
        flights = attrs.get("connecting_flights", [])
        if len(flights) > 4:
            raise serializers.ValidationError({"connecting_flights": "You can add up to 4 connecting flights."})
        if flights and sum(1 for flight in flights if flight.get("is_problem_flight")) != 1:
            raise serializers.ValidationError({"connecting_flights": "Exactly one connecting flight must be marked as the problem flight."})
        if not attrs["gdpr_consent_primary"]:
            raise serializers.ValidationError({"gdpr_consent_primary": "Consent is required to submit."})
        for field_name in ("boarding_pass", "identification_document"):
            upload = attrs[field_name]
            if upload.size > MAX_UPLOAD_SIZE:
                raise serializers.ValidationError({field_name: "File must be 5 MB or smaller."})
            if upload.content_type not in ALLOWED_UPLOAD_TYPES:
                raise serializers.ValidationError({field_name: "Only PDF and JPEG files are allowed."})
        return attrs

    @classmethod
    def from_multipart(cls, data, files):
        payload = json.loads(data["payload"])
        payload["boarding_pass"] = files["boarding_pass"]
        payload["identification_document"] = files["identification_document"]
        return cls(data=payload)
```

```python
# backend/apps/cases/services/case_creation.py
from django.db import transaction

from apps.cases.models import Case, CaseStatus, DocumentCategory, FlightLeg, Passenger, UploadedDocument


def create_case(validated_data: dict) -> Case:
    with transaction.atomic():
        passenger = Passenger.objects.create(
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            date_of_birth=validated_data["date_of_birth"],
            email=validated_data["email"],
            phone=validated_data["phone"],
            address=validated_data["address"],
            postal_code=validated_data["postal_code"],
        )

        case = Case.objects.create(
            passenger=passenger,
            reservation_number=validated_data["reservation_number"],
            status=CaseStatus.NEW,
            gdpr_consent_primary=validated_data["gdpr_consent_primary"],
            gdpr_consent_secondary=validated_data["gdpr_consent_secondary"],
        )

        legs = [validated_data["primary_flight"], *validated_data.get("connecting_flights", [])]
        for index, leg in enumerate(legs, start=1):
            FlightLeg.objects.create(
                case=case,
                leg_order=index,
                flight_date=leg["flight_date"],
                flight_number=leg["flight_number"],
                airline=leg["airline"],
                departure_airport_code=leg["departure_airport"]["code"],
                departure_airport_name=leg["departure_airport"]["name"],
                destination_airport_code=leg["destination_airport"]["code"],
                destination_airport_name=leg["destination_airport"]["name"],
                planned_departure_time=leg["planned_departure_time"],
                planned_arrival_time=leg["planned_arrival_time"],
                is_connecting_leg=index > 1,
                is_problem_flight=leg.get("is_problem_flight", False),
            )

        UploadedDocument.objects.create(
            case=case,
            document_category=DocumentCategory.BOARDING_PASS,
            original_file_name=validated_data["boarding_pass"].name,
            mime_type=validated_data["boarding_pass"].content_type,
            file_size_bytes=validated_data["boarding_pass"].size,
            file=validated_data["boarding_pass"],
        )
        UploadedDocument.objects.create(
            case=case,
            document_category=DocumentCategory.IDENTIFICATION,
            original_file_name=validated_data["identification_document"].name,
            mime_type=validated_data["identification_document"].content_type,
            file_size_bytes=validated_data["identification_document"].size,
            file=validated_data["identification_document"],
        )

        return case
```

    ```python
    # backend/apps/cases/api/urls.py
    from django.urls import path

    from apps.cases.api.views import AirportSearchView, CaseCreateView

    urlpatterns = [
      path("airports/search", AirportSearchView.as_view(), name="airport-search"),
      path("cases/", CaseCreateView.as_view(), name="case-create"),
    ]
    ```

**Testing:**

```python
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient


def test_case_creation_rejects_missing_consent() -> None:
    client = APIClient()
    response = client.post(
        "/api/cases/",
        {
            "payload": "{\"reservation_number\":\"ABC123\",\"gdpr_consent_primary\":false}",
            "boarding_pass": SimpleUploadedFile("bp.pdf", b"pdf", content_type="application/pdf"),
            "identification_document": SimpleUploadedFile("id.jpg", b"jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )
    assert response.status_code == 400
```

**Verification:**
- Run `cd backend && uv run pytest apps/cases/tests/test_case_creation_api.py`.
- Confirm a valid request returns HTTP 201 and creates one case, one passenger, flight legs, and two documents.

### Task 6: Add Backend API Tests for Happy Path and Validation Failures

**Files:**
- Create: `backend/apps/cases/tests/factories.py`
- Create: `backend/apps/cases/tests/test_case_creation_api.py`
- Modify: `backend/apps/cases/tests/test_airport_search_api.py`

**Requirements:**
- Cover success and all critical validation branches from the spec.
- Verify transactional rollback on failure.
- Verify the case status defaults to `NEW`.

**Implementation:**

```python
# backend/apps/cases/tests/test_case_creation_api.py
from unittest.mock import patch
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.cases.models import Case, FlightLeg, Passenger, UploadedDocument


def build_upload(name: str, content_type: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"x" * 32, content_type=content_type)


@pytest.mark.django_db
def test_case_creation_happy_path() -> None:
  payload = {
    "reservation_number": "ABC123",
    "primary_flight": {
      "flight_date": "2026-08-01",
      "flight_number": "RO123",
      "airline": "Tarom",
      "departure_airport": {"code": "OTP", "name": "Henri Coanda International Airport"},
      "destination_airport": {"code": "LHR", "name": "London Heathrow Airport"},
      "planned_departure_time": "2026-08-01T08:30:00Z",
      "planned_arrival_time": "2026-08-01T10:30:00Z",
      "is_problem_flight": False
    },
    "connecting_flights": [
      {
        "flight_date": "2026-08-01",
        "flight_number": "RO456",
        "airline": "Tarom",
        "departure_airport": {"code": "LHR", "name": "London Heathrow Airport"},
        "destination_airport": {"code": "DUB", "name": "Dublin Airport"},
        "planned_departure_time": "2026-08-01T12:00:00Z",
        "planned_arrival_time": "2026-08-01T13:20:00Z",
        "is_problem_flight": True
      }
    ],
    "first_name": "Ana",
    "last_name": "Popescu",
    "date_of_birth": "1990-03-15",
    "email": "ana.popescu@example.com",
    "phone": "+40712345678",
    "address": "1 Aviatorilor Blvd",
    "postal_code": "010101",
    "gdpr_consent_primary": True,
    "gdpr_consent_secondary": True
  }
    response = APIClient().post(
        "/api/cases/",
        {
      "payload": json.dumps(payload),
            "boarding_pass": build_upload("bp.pdf", "application/pdf"),
            "identification_document": build_upload("id.jpg", "image/jpeg"),
        },
        format="multipart",
    )
    assert response.status_code == 201
    assert Case.objects.get().status == "NEW"
    assert Passenger.objects.count() == 1
    assert FlightLeg.objects.count() >= 1
    assert UploadedDocument.objects.count() == 2


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.UploadedDocument.objects.create")
def test_case_creation_rolls_back_on_document_failure(create_mock) -> None:
    create_mock.side_effect = RuntimeError("storage failed")
  payload = {
    "reservation_number": "ABC123",
    "primary_flight": {
      "flight_date": "2026-08-01",
      "flight_number": "RO123",
      "airline": "Tarom",
      "departure_airport": {"code": "OTP", "name": "Henri Coanda International Airport"},
      "destination_airport": {"code": "LHR", "name": "London Heathrow Airport"},
      "planned_departure_time": "2026-08-01T08:30:00Z",
      "planned_arrival_time": "2026-08-01T10:30:00Z",
      "is_problem_flight": False
    },
    "connecting_flights": [],
    "first_name": "Ana",
    "last_name": "Popescu",
    "date_of_birth": "1990-03-15",
    "email": "ana.popescu@example.com",
    "phone": "+40712345678",
    "address": "1 Aviatorilor Blvd",
    "postal_code": "010101",
    "gdpr_consent_primary": True,
    "gdpr_consent_secondary": True
  }
    client = APIClient()
  response = client.post(
    "/api/cases/",
    {
      "payload": json.dumps(payload),
      "boarding_pass": build_upload("bp.pdf", "application/pdf"),
      "identification_document": build_upload("id.jpg", "image/jpeg"),
    },
    format="multipart",
  )
    assert response.status_code == 500
    assert Case.objects.count() == 0
```

**Testing:**

```text
Add explicit tests named `test_case_creation_rejects_invalid_email`, `test_case_creation_rejects_invalid_phone`, `test_case_creation_rejects_more_than_four_connecting_flights`, `test_case_creation_rejects_missing_problem_flight`, `test_case_creation_rejects_invalid_file_type`, `test_case_creation_rejects_oversize_upload`, and `test_case_creation_rejects_present_day_birth_date` using the same happy-path payload with one invalid field changed per test.
```

**Verification:**
- Run `cd backend && uv run pytest apps/cases/tests -q`.
- Expect all backend tests to pass.

### Task 7: Scaffold React App Shell, Theme Tokens, and Routing

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/app/styles/tokens.css`
- Create: `frontend/src/app/styles/global.css`

**Requirements:**
- Initialize a React + TypeScript app.
- Establish the blue/green visual system.
- Configure a route for the case-entry page.

**Implementation:**

```json
{
  "name": "airassist-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "framer-motion": "^12.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.53.0",
    "react-router-dom": "^7.0.0",
    "zod": "^3.24.0",
    "@hookform/resolvers": "^3.10.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^25.0.0"
  }
}
```

```css
/* frontend/src/app/styles/tokens.css */
:root {
  --bg: #f4fbfa;
  --surface: rgba(255, 255, 255, 0.88);
  --surface-strong: #ffffff;
  --text: #12313b;
  --muted: #5f7b82;
  --accent-blue: #1784d6;
  --accent-green: #1fbf8f;
  --accent-blue-deep: #0b5da0;
  --border: rgba(18, 49, 59, 0.12);
  --shadow: 0 24px 60px rgba(23, 132, 214, 0.14);
  --radius-xl: 28px;
}
```

```tsx
// frontend/src/app/router.tsx
import { createBrowserRouter } from "react-router-dom";
import { CaseEntryPage } from "../features/case-entry/components/CaseEntryPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <CaseEntryPage />,
  },
]);
```

**Testing:**

```tsx
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";

import { router } from "../router";

test("renders case entry route", () => {
  render(<RouterProvider router={router} />);
  expect(screen.getByText(/start your compensation case/i)).toBeInTheDocument();
});
```

**Verification:**
- Run `cd frontend && npm install`.
- Run `cd frontend && npm run build` and expect a successful production build.

### Task 8: Build Wizard State, Shared Types, and Validation Schema

**Files:**
- Create: `frontend/src/lib/http.ts`
- Create: `frontend/src/features/case-entry/types.ts`
- Create: `frontend/src/features/case-entry/schema.ts`
- Create: `frontend/src/features/case-entry/api.ts`
- Create: `frontend/src/features/case-entry/hooks/useCaseEntryWizard.ts`

**Requirements:**
- Define strong client-side types for the case-entry payload.
- Mirror backend validation rules in Zod.
- Centralize wizard stage state, gated progression, and submit orchestration.

**Implementation:**

```ts
// frontend/src/features/case-entry/types.ts
export type AirportOption = {
  code: string;
  name: string;
  city: string;
  country: string;
  displayLabel: string;
};

export type FlightLegFormValue = {
  flightDate: string;
  flightNumber: string;
  airline: string;
  departureAirport: AirportOption | null;
  destinationAirport: AirportOption | null;
  plannedDepartureTime: string;
  plannedArrivalTime: string;
  isProblemFlight: boolean;
};
```

```ts
// frontend/src/features/case-entry/schema.ts
import { z } from "zod";

const airportSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(1),
  city: z.string(),
  country: z.string(),
  displayLabel: z.string().min(1),
});

const flightLegSchema = z.object({
  flightDate: z.string().min(1),
  flightNumber: z.string().min(1),
  airline: z.string().min(1),
  departureAirport: airportSchema,
  destinationAirport: airportSchema,
  plannedDepartureTime: z.string().min(1),
  plannedArrivalTime: z.string().min(1),
  isProblemFlight: z.boolean(),
});

export const caseEntrySchema = z.object({
  reservationNumber: z.string().min(1),
  primaryFlight: flightLegSchema,
  connectingFlights: z.array(flightLegSchema).max(4),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9()\-\s]{7,20}$/),
  address: z.string().min(1),
  postalCode: z.string().min(1),
  gdprConsentPrimary: z.literal(true),
  gdprConsentSecondary: z.boolean(),
  boardingPass: z.instanceof(File),
  identificationDocument: z.instanceof(File),
}).superRefine((value, ctx) => {
  if (value.connectingFlights.length > 0) {
    const problemFlights = value.connectingFlights.filter((flight) => flight.isProblemFlight);
    if (problemFlights.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["connectingFlights"], message: "Select exactly one problem connecting flight." });
    }
  }
});
```

```ts
// frontend/src/features/case-entry/hooks/useCaseEntryWizard.ts
import { useState } from "react";

const activeSteps = ["itinerary", "compliance", "flight-details", "passenger-details", "documents", "review"] as const;

export function useCaseEntryWizard() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  function goNext(isCurrentStepValid: boolean) {
    if (!isCurrentStepValid) {
      return;
    }
    setCompletedSteps((value) => Array.from(new Set([...value, currentStepIndex])));
    setCurrentStepIndex((value) => Math.min(value + 1, activeSteps.length - 1));
  }

  function goBack() {
    setCurrentStepIndex((value) => Math.max(value - 1, 0));
  }

  return {
    activeSteps,
    currentStepIndex,
    completedSteps,
    currentStep: activeSteps[currentStepIndex],
    goNext,
    goBack,
  };
}
```

**Testing:**

```ts
import { caseEntrySchema } from "../schema";

test("schema rejects more than four connecting flights", () => {
  const flight = {
    flightDate: "2026-08-01",
    flightNumber: "RO123",
    airline: "Tarom",
    departureAirport: { code: "OTP", name: "Henri Coanda International Airport", city: "Bucharest", country: "Romania", displayLabel: "Bucharest - Henri Coanda International Airport (OTP)" },
    destinationAirport: { code: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom", displayLabel: "London - London Heathrow Airport (LHR)" },
    plannedDepartureTime: "2026-08-01T08:30",
    plannedArrivalTime: "2026-08-01T10:30",
    isProblemFlight: false,
  };
  const result = caseEntrySchema.safeParse({
    reservationNumber: "ABC123",
    primaryFlight: flight,
    connectingFlights: Array.from({ length: 5 }, (_value, index) => ({ ...flight, flightNumber: `RO${index + 200}` })),
    firstName: "Ana",
    lastName: "Popescu",
    dateOfBirth: "1990-03-15",
    email: "ana.popescu@example.com",
    phone: "+40712345678",
    address: "1 Aviatorilor Blvd",
    postalCode: "010101",
    gdprConsentPrimary: true,
    gdprConsentSecondary: true,
    boardingPass: new File(["pdf"], "boarding-pass.pdf", { type: "application/pdf" }),
    identificationDocument: new File(["jpg"], "passport.jpg", { type: "image/jpeg" }),
  });
  expect(result.success).toBe(false);
});
```

**Verification:**
- Run `cd frontend && npm run test -- --runInBand`.
- Confirm schema tests cover stage-gating prerequisites.

### Task 9: Implement Animated Wizard UI, Progress Bar, and Dynamic Fields

**Files:**
- Create: `frontend/src/features/case-entry/components/CaseEntryPage.tsx`
- Create: `frontend/src/features/case-entry/components/ProgressStepper.tsx`
- Create: `frontend/src/features/case-entry/components/StepFrame.tsx`
- Create: `frontend/src/features/case-entry/components/AirportAutocomplete.tsx`
- Create: `frontend/src/features/case-entry/components/ConnectingFlightsEditor.tsx`
- Create: `frontend/src/features/case-entry/components/steps/ItineraryStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/ComplianceStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/FlightDetailsStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/PassengerDetailsStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/DocumentsStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/ReviewSubmitStep.tsx`
- Create: `frontend/src/features/case-entry/components/steps/LockedDisruptionStep.tsx`

**Requirements:**
- Render the wizard with a progress bar and animated stage transitions.
- Disable forward navigation until the current stage validates.
- Provide airport autocomplete, connecting-flight management, and upload controls.
- Preserve the visual presence of disruption steps while keeping them non-editable in Story 1.

**Implementation:**

```tsx
// frontend/src/features/case-entry/components/ProgressStepper.tsx
type ProgressStepperProps = {
  steps: Array<{ id: string; label: string; status: "complete" | "current" | "upcoming" | "locked" }>;
};

export function ProgressStepper({ steps }: ProgressStepperProps) {
  return (
    <ol className="progress-stepper" aria-label="Case entry progress">
      {steps.map((step, index) => (
        <li key={step.id} data-status={step.status}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// frontend/src/features/case-entry/components/steps/LockedDisruptionStep.tsx
import { motion } from "framer-motion";

export function LockedDisruptionStep({ title }: { title: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <h2>{title}</h2>
      <p>This step belongs to CASE_03 and is intentionally locked in Story 1.</p>
    </motion.section>
  );
}
```

```tsx
// frontend/src/features/case-entry/components/ConnectingFlightsEditor.tsx
import { useFieldArray, useFormContext } from "react-hook-form";

export function ConnectingFlightsEditor() {
  const { control, register, watch } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: "connectingFlights" });
  const selectedFlights = watch("connectingFlights");

  return (
    <section>
      {fields.map((field, index) => (
        <article key={field.id}>
          <input {...register(`connectingFlights.${index}.flightNumber`)} aria-label={`Connecting flight number ${index + 1}`} />
          <input type="radio" {...register("problemFlightIndex")} value={index} aria-label={`Problem flight ${index + 1}`} checked={Boolean(selectedFlights?.[index]?.isProblemFlight)} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </article>
      ))}
      <button
        type="button"
        onClick={() => append({ flightDate: "", flightNumber: "", airline: "", departureAirport: null, destinationAirport: null, plannedDepartureTime: "", plannedArrivalTime: "", isProblemFlight: false })}
        disabled={fields.length >= 4}
      >
        Add connecting flight
      </button>
    </section>
  );
}
```

```tsx
// frontend/src/features/case-entry/components/CaseEntryPage.tsx
export function CaseEntryPage() {
  return (
    <main className="case-entry-shell">
      <section className="hero-panel">
        <p className="eyebrow">Passenger intake</p>
        <h1>Start your compensation case</h1>
        <p>Move step by step. Each section unlocks after the previous one is valid.</p>
      </section>
      <ProgressStepper steps={steps} />
      <StepFrame>{activeStepContent}</StepFrame>
    </main>
  );
}
```

**Testing:**

```tsx
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { CaseEntryPage } from "../CaseEntryPage";

test("next button is disabled until current step is valid", async () => {
  render(
    <MemoryRouter>
      <CaseEntryPage />
    </MemoryRouter>,
  );
  const nextButton = screen.getByRole("button", { name: /next/i });
  expect(nextButton).toBeDisabled();
  await userEvent.type(screen.getByLabelText(/reservation number/i), "ABC123");
  await userEvent.type(screen.getByLabelText(/flight number/i), "RO123");
  await userEvent.type(screen.getByLabelText(/airline/i), "Tarom");
  expect(nextButton).toBeEnabled();
});
```

**Verification:**
- Run `cd frontend && npm run test`.
- Run `cd frontend && npm run dev` and manually confirm animated transitions, progress bar behavior, and blue/green styling.

### Task 10: Wire Frontend Submission to Backend and Add End-to-End Feature Tests

**Files:**
- Modify: `frontend/src/features/case-entry/api.ts`
- Modify: `frontend/src/features/case-entry/components/CaseEntryPage.tsx`
- Create: `frontend/src/features/case-entry/__tests__/CaseEntryPage.test.tsx`
- Create: `frontend/src/features/case-entry/__tests__/ConnectingFlightsEditor.test.tsx`
- Create: `frontend/src/test/setup.ts`
- Modify: `README.md`

**Requirements:**
- Serialize the wizard state into the backend multipart payload.
- Display submit success and structured server validation errors.
- Test the full client behavior around gating, dynamic flights, and submit payload shaping.

**Implementation:**

```ts
// frontend/src/features/case-entry/api.ts
import { http } from "../../lib/http";

export async function submitCaseEntry(formValue: CaseEntryFormValue) {
  const payload = new FormData();
  payload.append(
    "payload",
    JSON.stringify({
      reservation_number: formValue.reservationNumber,
      primary_flight: mapFlight(formValue.primaryFlight),
      connecting_flights: formValue.connectingFlights.map(mapFlight),
      first_name: formValue.firstName,
      last_name: formValue.lastName,
      date_of_birth: formValue.dateOfBirth,
      email: formValue.email,
      phone: formValue.phone,
      address: formValue.address,
      postal_code: formValue.postalCode,
      gdpr_consent_primary: formValue.gdprConsentPrimary,
      gdpr_consent_secondary: formValue.gdprConsentSecondary,
    }),
  );
  payload.append("boarding_pass", formValue.boardingPass);
  payload.append("identification_document", formValue.identificationDocument);
  return http.post("/cases/", payload);
}
```

```tsx
// frontend/src/features/case-entry/__tests__/ConnectingFlightsEditor.test.tsx
test("limits connecting flights to four", async () => {
  render(<CaseEntryPage />);
  const addButton = screen.getByRole("button", { name: /add connecting flight/i });
  await userEvent.click(addButton);
  await userEvent.click(addButton);
  await userEvent.click(addButton);
  await userEvent.click(addButton);
  expect(addButton).toBeDisabled();
});
```

```tsx
// frontend/src/features/case-entry/__tests__/CaseEntryPage.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { CaseEntryPage } from "../components/CaseEntryPage";
import * as caseEntryApi from "../api";

test("submits a valid payload and shows confirmation", async () => {
  vi.spyOn(caseEntryApi, "submitCaseEntry").mockResolvedValue({
    case_id: 101,
    status: "NEW",
    created_at: "2026-07-23T10:00:00Z",
    confirmation_message: "Case created successfully.",
  });

  render(<CaseEntryPage />);
  const file = new File(["pdf"], "boarding-pass.pdf", { type: "application/pdf" });
  const image = new File(["jpg"], "passport.jpg", { type: "image/jpeg" });

  await userEvent.type(screen.getByLabelText(/reservation number/i), "ABC123");
  await userEvent.type(screen.getByLabelText(/flight number/i), "RO123");
  await userEvent.type(screen.getByLabelText(/airline/i), "Tarom");
  await userEvent.click(screen.getByRole("button", { name: /next/i }));
  await userEvent.click(screen.getByLabelText(/i agree to the gdpr policy/i));
  await userEvent.click(screen.getByLabelText(/i agree to data processing/i));
  await userEvent.click(screen.getByRole("button", { name: /next/i }));
  await userEvent.type(screen.getByLabelText(/first name/i), "Ana");
  await userEvent.type(screen.getByLabelText(/last name/i), "Popescu");
  await userEvent.upload(screen.getByLabelText(/boarding pass/i), file);
  await userEvent.upload(screen.getByLabelText(/id or passport/i), image);
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));

  await waitFor(() => {
    expect(screen.getByText(/case created successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/new/i)).toBeInTheDocument();
  });
});
```

**Testing:**

```text
Mock the backend for frontend tests and verify field-level server error mapping for a rejected submit.
```

**Verification:**
- Run `cd frontend && npm run test`.
- Run the full stack locally and submit a valid case through the UI.

## Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9
10. Task 10

## Spec Coverage Check

- Public access: Tasks 2, 7, 9
- Dynamic staged wizard with gated progression: Tasks 8, 9, 10
- Airport lookup integration: Tasks 4, 8, 9
- Connecting flights with max four and problem-flight validation: Tasks 5, 8, 9, 10
- Passenger details capture: Tasks 5, 8, 9, 10
- GDPR consent enforcement: Tasks 5, 8, 9, 10
- Boarding pass and ID/passport upload validation: Tasks 5, 6, 8, 9, 10
- Initial case status `NEW`: Tasks 3, 5, 6
- Blue/green modern animated UI and progress bar: Tasks 7, 9
- Story 1 boundary excluding eligibility/account/email logic: Tasks 3, 5, 9

## Self-Review Notes

- No placeholder markers such as `TODO` or `TBD` remain in the plan.
- Types and naming are consistent between frontend payload mapping and backend serializer fields.
- The plan preserves the CASE_03 exclusion while keeping the disruption steps visually represented.