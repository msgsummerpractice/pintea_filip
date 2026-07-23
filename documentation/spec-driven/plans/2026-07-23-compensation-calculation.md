# Compensation Calculation Implementation Plan

> **Execution:** Use subagent-driven development to implement this plan task-by-task.

**Goal:** Add live compensation calculation based on orthodromic distance to the case-entry wizard and persist the result with the case.

**Architecture:** A new `CompensationCalculation` model stores distance/amount per case. A backend service calls the AirportGap distance API and applies EU-regulation thresholds. A preview endpoint lets the frontend show live results on the Itinerary step; the authoritative calculation is re-done and persisted at case submission.

**Tech Stack:** Django 5 / DRF, PostgreSQL, React 18, TypeScript, Vite, Vitest

**Design Spec:** `documentation/spec-driven/specs/2026-07-23-compensation-calculation-design.md`

---

### Task 1: CompensationCalculation Model + Migration

**Files:**
- Modify: `backend/apps/cases/models.py`
- Create: `backend/apps/cases/migrations/0002_compensationcalculation.py` (auto-generated)

**Requirements:**
- Add `CompensationCalculation` model with fields: `case` (OneToOne → Case), `start_airport_code`, `final_destination_code`, `orthodromic_distance_km`, `compensation_amount_eur`, `calculated_at`
- Check constraint ensuring `compensation_amount_eur` is one of 250, 400, 600

**Implementation:**

Add to the end of `backend/apps/cases/models.py`:

```python
class CompensationCalculation(models.Model):
    case = models.OneToOneField(
        Case,
        on_delete=models.CASCADE,
        related_name="compensation_calculation",
    )
    start_airport_code = models.CharField(max_length=10)
    final_destination_code = models.CharField(max_length=10)
    orthodromic_distance_km = models.DecimalField(max_digits=10, decimal_places=2)
    compensation_amount_eur = models.PositiveSmallIntegerField()
    calculated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(compensation_amount_eur__in=[250, 400, 600]),
                name="cases_compensation_amount_valid",
            ),
        ]
```

Then run:
```
python manage.py makemigrations cases
```

**Verification:**
```
cd backend
python manage.py makemigrations cases --check --dry-run
python manage.py migrate
python manage.py check
```

---

### Task 2: Compensation Service

**Files:**
- Create: `backend/apps/cases/services/compensation.py`

**Requirements:**
- Call `POST https://airportgap.com/api/airports/distance` with form data `from=<code>&to=<code>`
- Parse JSON:API response to extract `data.attributes.kilometers`
- Apply thresholds: <1500 → 250, 1500–3500 → 400, >3500 → 600
- Handle SSL errors with curl fallback (matching existing pattern in `airportgap.py`)
- Raise `CompensationCalculationError` on network/parsing failures
- Raise `InvalidAirportCodeError` on 422 from upstream

**Implementation:**

```python
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
```

**Testing:**

Create `backend/tests/test_compensation_service.py`:

```python
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
    assert result == CompensationResult(distance_km=Decimal("1200.50"), compensation_eur=250)


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
```

**Verification:**
```
cd backend
python -m pytest tests/test_compensation_service.py -v
```

---

### Task 3: Compensation Preview API Endpoint

**Files:**
- Modify: `backend/apps/cases/api/views.py` (add `CompensationCalculateView`)
- Modify: `backend/apps/cases/api/urls.py` (add route)

**Requirements:**
- `POST /api/compensation/calculate` accepting JSON `{ "from_airport": "...", "to_airport": "..." }`
- Validate both fields required, 2–4 uppercase letters
- Return `{ "distance_km": ..., "compensation_eur": ... }` on success
- Return 422 on invalid airport code, 503 on API unavailability

**Implementation:**

Add to `backend/apps/cases/api/views.py`:

```python
import re

from apps.cases.services.compensation import (
    CompensationCalculationError,
    InvalidAirportCodeError,
    calculate_compensation,
)

IATA_PATTERN = re.compile(r"^[A-Z]{2,4}$")


class CompensationCalculateView(APIView):
    def post(self, request) -> Response:
        from_airport = request.data.get("from_airport", "").strip().upper()
        to_airport = request.data.get("to_airport", "").strip().upper()

        errors = {}
        if not from_airport:
            errors["from_airport"] = ["This field is required."]
        elif not IATA_PATTERN.match(from_airport):
            errors["from_airport"] = ["Must be a valid IATA airport code (2-4 letters)."]

        if not to_airport:
            errors["to_airport"] = ["This field is required."]
        elif not IATA_PATTERN.match(to_airport):
            errors["to_airport"] = ["Must be a valid IATA airport code (2-4 letters)."]

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = calculate_compensation(from_airport, to_airport)
        except InvalidAirportCodeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except CompensationCalculationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "distance_km": float(result.distance_km),
                "compensation_eur": result.compensation_eur,
            },
            status=status.HTTP_200_OK,
        )
```

Add to `backend/apps/cases/api/urls.py`:

```python
from apps.cases.api.views import CompensationCalculateView

# Add to urlpatterns:
path("compensation/calculate", CompensationCalculateView.as_view(), name="compensation-calculate"),
```

**Testing:**

Create `backend/tests/test_compensation_api.py`:

```python
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.cases.services.compensation import (
    CompensationCalculationError,
    CompensationResult,
    InvalidAirportCodeError,
)


@patch("apps.cases.api.views.calculate_compensation")
def test_compensation_calculate_returns_result(mock_calc) -> None:
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("1868.42"), compensation_eur=400
    )
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "OTP", "to_airport": "CDG"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["distance_km"] == 1868.42
    assert body["compensation_eur"] == 400


def test_compensation_calculate_missing_fields() -> None:
    response = APIClient().post(
        "/api/compensation/calculate",
        data={},
        format="json",
    )
    assert response.status_code == 400
    body = response.json()
    assert "from_airport" in body
    assert "to_airport" in body


def test_compensation_calculate_invalid_format() -> None:
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "123", "to_airport": "!!!"},
        format="json",
    )
    assert response.status_code == 400


@patch("apps.cases.api.views.calculate_compensation")
def test_compensation_calculate_invalid_code_returns_422(mock_calc) -> None:
    mock_calc.side_effect = InvalidAirportCodeError("One or both airport codes are not recognized.")
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "XXX", "to_airport": "YYY"},
        format="json",
    )
    assert response.status_code == 422
    assert "not recognized" in response.json()["detail"]


@patch("apps.cases.api.views.calculate_compensation")
def test_compensation_calculate_service_unavailable(mock_calc) -> None:
    mock_calc.side_effect = CompensationCalculationError("Compensation calculation is temporarily unavailable.")
    response = APIClient().post(
        "/api/compensation/calculate",
        data={"from_airport": "OTP", "to_airport": "CDG"},
        format="json",
    )
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]
```

**Verification:**
```
cd backend
python -m pytest tests/test_compensation_api.py -v
```

---

### Task 4: Case Creation — Persist Compensation

**Files:**
- Modify: `backend/apps/cases/services/case_creation.py`
- Modify: `backend/apps/cases/api/views.py` (update CaseCreateView response)

**Requirements:**
- Within the existing `create_case` transaction, call `calculate_compensation` and create a `CompensationCalculation` record
- Update the `CaseCreateView` response to include `compensation: { distance_km, compensation_eur }`
- If the distance API fails, the transaction rolls back and the client gets a 503

**Implementation:**

In `backend/apps/cases/services/case_creation.py`, add at the top:

```python
from apps.cases.models import CompensationCalculation
from apps.cases.services.compensation import calculate_compensation
```

At the end of the `with transaction.atomic():` block (after the UploadedDocument creates), add:

```python
        compensation_result = calculate_compensation(
            itinerary_data["departureAirport"]["code"],
            itinerary_data["destinationAirport"]["code"],
        )
        CompensationCalculation.objects.create(
            case=case,
            start_airport_code=itinerary_data["departureAirport"]["code"],
            final_destination_code=itinerary_data["destinationAirport"]["code"],
            orthodromic_distance_km=compensation_result.distance_km,
            compensation_amount_eur=compensation_result.compensation_eur,
        )
```

Change the return to return the case (already does).

In `backend/apps/cases/api/views.py`, update `CaseCreateView.post` response:

```python
    def post(self, request) -> Response:
        try:
            serializer = CaseCreateRequestSerializer.from_multipart(request.data, request.FILES)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        serializer.is_valid(raise_exception=True)

        from apps.cases.services.compensation import CompensationCalculationError

        try:
            case = create_case(serializer.validated_data)
        except CompensationCalculationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        compensation = case.compensation_calculation
        return Response(
            {
                "id": case.pk,
                "status": case.status,
                "compensation": {
                    "distance_km": float(compensation.orthodromic_distance_km),
                    "compensation_eur": compensation.compensation_amount_eur,
                },
            },
            status=status.HTTP_201_CREATED,
        )
```

**Testing:**

Extend `backend/tests/test_case_creation_api.py` — add a new test:

```python
from apps.cases.models import CompensationCalculation
from apps.cases.services.compensation import CompensationResult


@pytest.mark.django_db
@patch("apps.cases.services.case_creation.calculate_compensation")
def test_case_create_persists_compensation(mock_calc, tmp_path, settings) -> None:
    settings.MEDIA_ROOT = tmp_path
    mock_calc.return_value = CompensationResult(
        distance_km=Decimal("1868.42"), compensation_eur=400
    )

    response = APIClient().post(
        "/api/cases/",
        data={
            "payload": json.dumps(build_payload()),
            "boarding_pass": build_upload("boarding-pass.pdf"),
            "identification": build_upload("passport.jpg", content_type="image/jpeg"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["compensation"]["distance_km"] == 1868.42
    assert body["compensation"]["compensation_eur"] == 400

    case = Case.objects.get()
    comp = CompensationCalculation.objects.get(case=case)
    assert comp.start_airport_code == "OTP"
    assert comp.final_destination_code == "MAD"
    assert comp.orthodromic_distance_km == Decimal("1868.42")
    assert comp.compensation_amount_eur == 400
```

Also add imports to the test file top:
```python
from decimal import Decimal
from unittest.mock import patch
```

**Verification:**
```
cd backend
python -m pytest tests/test_case_creation_api.py -v
```

---

### Task 5: Frontend — Compensation API + Types

**Files:**
- Modify: `frontend/src/features/case-entry/types.ts`
- Modify: `frontend/src/features/case-entry/api.ts`

**Requirements:**
- Add `CompensationPreview` interface
- Add `compensationPreview` to `CaseEntryDraft` (nullable)
- Add `calculateCompensation` API function
- Update `CaseEntrySubmitResponse` to include optional `compensation`
- Update `createEmptyCaseEntryDraft()` to initialize `compensationPreview: null`

**Implementation:**

In `frontend/src/features/case-entry/types.ts`, add interface after `AirportOption`:

```typescript
export interface CompensationPreview {
  distanceKm: number;
  compensationEur: number;
}
```

Add `compensationPreview` field to `CaseEntryDraft`:
```typescript
export interface CaseEntryDraft {
  itinerary: ItineraryInput;
  compliance: ConsentState;
  flightDetails: FlightDetailsInput;
  passengerDetails: PassengerDetailsInput;
  documents: DocumentsInput;
  compensationPreview: CompensationPreview | null;
}
```

Update `createEmptyCaseEntryDraft()` to include:
```typescript
    compensationPreview: null,
```

Update `CaseEntrySubmitResponse`:
```typescript
export interface CaseEntrySubmitResponse {
  id?: number | string;
  status?: string;
  message?: string;
  publicCaseReference?: string | null;
  compensation?: {
    distance_km: number;
    compensation_eur: number;
  };
  [key: string]: unknown;
}
```

In `frontend/src/features/case-entry/api.ts`, add the function:

```typescript
export interface CompensationCalculateResponse {
  distance_km: number;
  compensation_eur: number;
}

export async function calculateCompensation(
  fromAirport: string,
  toAirport: string,
): Promise<CompensationPreview> {
  const response = await requestJson<CompensationCalculateResponse>(
    "/compensation/calculate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_airport: fromAirport, to_airport: toAirport }),
    },
  );
  return {
    distanceKm: response.distance_km,
    compensationEur: response.compensation_eur,
  };
}
```

Import `CompensationPreview` from `./types` in api.ts.

**Testing:**

Extend `frontend/src/features/case-entry/__tests__/api.test.ts`:

```typescript
describe("calculateCompensation", () => {
  it("returns mapped compensation preview", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ distance_km: 1868.42, compensation_eur: 400 }),
    );

    const result = await calculateCompensation("OTP", "CDG");

    expect(result).toEqual({ distanceKm: 1868.42, compensationEur: 400 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/compensation/calculate"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
```

**Verification:**
```
cd frontend
npx vitest run src/features/case-entry/__tests__/api.test.ts
```

---

### Task 6: Frontend — Itinerary Step Live Compensation Display

**Files:**
- Modify: `frontend/src/features/case-entry/components/steps/ItineraryStep.tsx`
- Modify: `frontend/src/features/case-entry/hooks/useCaseEntryWizard.ts`

**Requirements:**
- When both departure and destination airports are selected, call `calculateCompensation` after 300ms debounce
- Display an info card below the airport selectors showing distance and compensation
- Show loading state while fetching
- Show non-blocking error on failure (user can still proceed)
- When either airport is cleared, hide card and reset preview to null
- Store result in `draft.compensationPreview`

**Implementation:**

Add compensation state management to `useCaseEntryWizard.ts`. Add a new exported function `setCompensationPreview`:

```typescript
import type { CompensationPreview } from "../types";

// Inside the hook, add:
function setCompensationPreview(preview: CompensationPreview | null) {
  setDraftState((currentDraft) => ({
    ...currentDraft,
    compensationPreview: preview,
  }));
}
```

Return `setCompensationPreview` from the hook.

Update `ItineraryStep.tsx` to accept and use compensation state:

```typescript
import { useEffect, useRef, useState } from "react";
import { calculateCompensation } from "../../api";
import type { AirportOption, CompensationPreview, ConnectingFlightInput, ItineraryInput } from "../../types";
import { AirportAutocomplete } from "../AirportAutocomplete";
import { ConnectingFlightsEditor } from "../ConnectingFlightsEditor";

interface ItineraryStepProps {
  itinerary: ItineraryInput;
  compensationPreview: CompensationPreview | null;
  errors: Record<string, string[]>;
  onDepartureAirportChange: (airport: AirportOption | null) => void;
  onDestinationAirportChange: (airport: AirportOption | null) => void;
  onCompensationPreviewChange: (preview: CompensationPreview | null) => void;
  onAddConnectingFlight: () => void;
  onUpdateConnectingFlight: (
    flightId: string,
    updater: ConnectingFlightInput | ((currentFlight: ConnectingFlightInput) => ConnectingFlightInput),
  ) => void;
  onRemoveConnectingFlight: (flightId: string) => void;
  onProblemFlightChange: (flightId: string | null) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function ItineraryStep({
  compensationPreview,
  errors,
  itinerary,
  onAddConnectingFlight,
  onCompensationPreviewChange,
  onDepartureAirportChange,
  onDestinationAirportChange,
  onProblemFlightChange,
  onRemoveConnectingFlight,
  onUpdateConnectingFlight,
}: ItineraryStepProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const departureCode = itinerary.departureAirport?.code ?? null;
  const destinationCode = itinerary.destinationAirport?.code ?? null;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!departureCode || !destinationCode) {
      onCompensationPreviewChange(null);
      setCalcError(null);
      return;
    }

    setIsCalculating(true);
    setCalcError(null);

    debounceRef.current = setTimeout(() => {
      calculateCompensation(departureCode, destinationCode)
        .then((result) => {
          onCompensationPreviewChange(result);
          setCalcError(null);
        })
        .catch(() => {
          onCompensationPreviewChange(null);
          setCalcError("Could not calculate compensation. You can still proceed.");
        })
        .finally(() => setIsCalculating(false));
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [departureCode, destinationCode]);

  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Map the passenger's route first.</strong>
        <p>
          The intake stays locked until the base itinerary is consistent. Connections can be
          added only when they matter to the disruption chain.
        </p>
      </section>

      <div className="form-grid">
        <AirportAutocomplete
          error={getError(errors, "itinerary.departureAirport")}
          label="Departure airport"
          onSelect={onDepartureAirportChange}
          value={itinerary.departureAirport}
        />
        <AirportAutocomplete
          error={getError(errors, "itinerary.destinationAirport")}
          label="Destination airport"
          onSelect={onDestinationAirportChange}
          value={itinerary.destinationAirport}
        />
      </div>

      {isCalculating && (
        <div className="compensation-info-card compensation-loading">
          Calculating compensation…
        </div>
      )}

      {!isCalculating && compensationPreview && (
        <div className="compensation-info-card">
          <span className="compensation-distance">
            Distance: {compensationPreview.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km
          </span>
          <span className="compensation-amount">
            Estimated compensation: €{compensationPreview.compensationEur}
          </span>
        </div>
      )}

      {!isCalculating && calcError && (
        <div className="compensation-info-card compensation-warning">
          {calcError}
        </div>
      )}

      <ConnectingFlightsEditor
        errors={errors}
        itinerary={itinerary}
        onAdd={onAddConnectingFlight}
        onProblemFlightChange={onProblemFlightChange}
        onRemove={onRemoveConnectingFlight}
        onUpdate={(flightId, field, value) =>
          onUpdateConnectingFlight(flightId, (currentFlight) => ({
            ...currentFlight,
            [field]: value,
          }))
        }
      />
    </div>
  );
}
```

**Testing:**

The component test verifies the debounced calculation trigger and display. Create/extend `frontend/src/features/case-entry/__tests__/ItineraryStep.test.tsx` — testing that both airports triggers calculation and displays result (mock `calculateCompensation`).

**Verification:**
```
cd frontend
npx vitest run src/features/case-entry/__tests__/
```

---

### Task 7: Frontend — Review Step Compensation Display

**Files:**
- Modify: `frontend/src/features/case-entry/components/steps/ReviewSubmitStep.tsx`

**Requirements:**
- If `draft.compensationPreview` is non-null, show a summary card with distance and compensation
- Label: "Compensation Estimate"

**Implementation:**

Add a new summary card inside the `summary-grid` section:

```tsx
{draft.compensationPreview && (
  <article className="summary-card">
    <p className="section-card-label">Compensation Estimate</p>
    <h3>€{draft.compensationPreview.compensationEur}</h3>
    <p>
      {draft.compensationPreview.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km orthodromic distance
    </p>
  </article>
)}
```

This goes after the existing Reservation summary card.

**Verification:**
```
cd frontend
npx vitest run src/features/case-entry/__tests__/
npm run build
```

---

### Task 8: Wire ItineraryStep Props Through CaseEntryPage

**Files:**
- Modify: `frontend/src/features/case-entry/components/CaseEntryPage.tsx`

**Requirements:**
- Pass `compensationPreview` and `onCompensationPreviewChange` props to `ItineraryStep`
- The `CaseEntryPage` uses the hook's `setCompensationPreview` function

**Implementation:**

Read the current `CaseEntryPage.tsx` and identify where `ItineraryStep` is rendered. Add the new props:

```tsx
<ItineraryStep
  itinerary={draft.itinerary}
  compensationPreview={draft.compensationPreview}
  errors={validationErrors}
  onCompensationPreviewChange={setCompensationPreview}
  onDepartureAirportChange={...}
  onDestinationAirportChange={...}
  ...
/>
```

**Verification:**
```
cd frontend
npx tsc --noEmit
npm run build
```

---
