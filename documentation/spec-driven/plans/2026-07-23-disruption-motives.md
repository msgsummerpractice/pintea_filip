# Disruption Motives Implementation Plan

> **Execution:** Use subagent-driven development to implement this plan task-by-task.

**Goal:** Add two disruption wizard steps to the case-entry form that collect disruption type, conditional fields, airline motive, and incident description, plus persist the data on the backend.

**Architecture:** A new `Disruption` Django model (OneToOne to Case) stores all disruption answers. Two new React wizard steps replace the locked disruption placeholder. The frontend validates step progression locally; the backend requires disruption presence at submission.

**Tech Stack:** Django 5 / DRF, PostgreSQL, React 18, TypeScript, Zod, Vite, Vitest

**Design Spec:** `documentation/spec-driven/specs/2026-07-23-disruption-motives-design.md`

---

### Task 1: Backend Disruption Model + Migration

**Files:**
- Modify: `backend/apps/cases/models.py` (append after `CompensationCalculation` class, ~line 120)
- Create: `backend/apps/cases/migrations/0003_disruption.py` (auto-generated)

**Requirements:**
- Add `DisruptionType` TextChoices enum: CANCELLATION, DELAY, DENIED_BOARDING
- Add `Disruption` model: OneToOne to Case, disruption_type (CharField, choices from enum), answer fields as CharField with blank/default="", incident_description as TextField(max_length=1000), created_at auto_now_add
- Check constraint on disruption_type to enforce enum values
- Generate migration via `python manage.py makemigrations cases`

**Implementation:**

Append to `backend/apps/cases/models.py`:

```python
class DisruptionType(models.TextChoices):
    CANCELLATION = "CANCELLATION", "Cancellation"
    DELAY = "DELAY", "Delay"
    DENIED_BOARDING = "DENIED_BOARDING", "Denied Boarding"


class Disruption(models.Model):
    case = models.OneToOneField(Case, on_delete=models.CASCADE, related_name="disruption")
    disruption_type = models.CharField(max_length=20, choices=DisruptionType.choices)
    cancellation_notice_timing = models.CharField(max_length=30, blank=True, default="")
    delay_arrival_outcome = models.CharField(max_length=30, blank=True, default="")
    gave_up_seat_voluntarily = models.CharField(max_length=5, blank=True, default="")
    denied_boarding_reason = models.CharField(max_length=50, blank=True, default="")
    airline_motive_known = models.CharField(max_length=20, blank=True, default="")
    airline_motive = models.CharField(max_length=50, blank=True, default="")
    incident_description = models.TextField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(disruption_type__in=DisruptionType.values),
                name="cases_disruption_type_valid",
            ),
        ]
```

**Verification:**
```bash
cd backend
python manage.py makemigrations cases
python manage.py check
python manage.py migrate --run-syncdb --check  # dry-run check
```

Expected: Migration `0003_disruption.py` created, `check` passes with no issues.

---

### Task 2: Backend Serializer + Case Creation Integration

**Files:**
- Modify: `backend/apps/cases/api/serializers.py` (add `DisruptionInputSerializer`, add `disruption` field to `CaseCreateRequestSerializer`)
- Modify: `backend/apps/cases/services/case_creation.py` (persist Disruption in transaction)

**Requirements:**
- Add `DisruptionInputSerializer` with: `disruptionType` (ChoiceField required), answer fields (CharField, required=False, allow_blank=True, default=""), `incidentDescription` (CharField, max_length=1000, required)
- Add `disruption = DisruptionInputSerializer()` to `CaseCreateRequestSerializer`
- In `create_case()`, after creating the case, create `Disruption` record from validated disruption data
- Import `Disruption` and `DisruptionType` in `case_creation.py`

**Implementation:**

Add to `backend/apps/cases/api/serializers.py` (before `CaseCreateRequestSerializer`):

```python
class DisruptionInputSerializer(serializers.Serializer):
    disruptionType = serializers.ChoiceField(choices=["cancellation", "delay", "denied_boarding"])
    cancellationNoticeTiming = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    delayArrivalOutcome = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    gaveUpSeatVoluntarily = serializers.CharField(max_length=5, required=False, allow_blank=True, default="")
    deniedBoardingReason = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    airlineMotiveKnown = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    airlineMotive = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    incidentDescription = serializers.CharField(max_length=1000)
```

Add to `CaseCreateRequestSerializer` fields:

```python
disruption = DisruptionInputSerializer()
```

Add to `backend/apps/cases/services/case_creation.py` imports:

```python
from apps.cases.models import Disruption
```

Add inside `create_case()`, after document creation and before compensation calculation:

```python
disruption_data = validated_data["disruption"]
Disruption.objects.create(
    case=case,
    disruption_type=disruption_data["disruptionType"].upper(),
    cancellation_notice_timing=disruption_data.get("cancellationNoticeTiming", ""),
    delay_arrival_outcome=disruption_data.get("delayArrivalOutcome", ""),
    gave_up_seat_voluntarily=disruption_data.get("gaveUpSeatVoluntarily", ""),
    denied_boarding_reason=disruption_data.get("deniedBoardingReason", ""),
    airline_motive_known=disruption_data.get("airlineMotiveKnown", ""),
    airline_motive=disruption_data.get("airlineMotive", ""),
    incident_description=disruption_data["incidentDescription"],
)
```

**Testing:**

```python
# backend/tests/test_disruption_api.py
import pytest
from django.test import TestCase
from rest_framework.test import APIClient

@pytest.mark.django_db
class TestDisruptionSubmission:
    def test_case_without_disruption_rejected(self, api_client_with_valid_payload):
        """Submission without disruption field returns 400."""
        payload = api_client_with_valid_payload
        del payload["disruption"]
        response = client.post("/api/cases/", ...)
        assert response.status_code == 400

    def test_case_with_valid_disruption_accepted(self, ...):
        """Submission with valid disruption field succeeds."""
        ...
```

**Verification:**
```bash
cd backend
python manage.py check
pytest tests/test_case_creation_api.py -x
```

---

### Task 3: Backend Tests for Disruption

**Files:**
- Create: `backend/tests/test_disruption_model.py`
- Modify: `backend/tests/test_case_creation_api.py` (update existing payloads to include disruption)

**Requirements:**
- Test Disruption model creation with valid data
- Test disruption_type constraint rejects invalid values
- Update all existing case creation test payloads to include a valid `disruption` field (existing tests will fail without it since the field is now required)
- Test that submission without disruption returns 400

**Implementation:**

Create `backend/tests/test_disruption_model.py`:

```python
import pytest
from apps.cases.models import Case, CaseStatus, Disruption, DisruptionType, Passenger


@pytest.mark.django_db
class TestDisruptionModel:
    @pytest.fixture
    def case_with_passenger(self):
        passenger = Passenger.objects.create(
            first_name="Test",
            last_name="User",
            date_of_birth="1990-01-01",
            email="test@example.com",
            phone="+1234567890",
            address="123 Test St",
            postal_code="12345",
        )
        return Case.objects.create(
            passenger=passenger,
            reservation_number="ABC123",
            status=CaseStatus.NEW,
            gdpr_consent_primary=True,
            gdpr_consent_secondary=True,
        )

    def test_create_cancellation_disruption(self, case_with_passenger):
        disruption = Disruption.objects.create(
            case=case_with_passenger,
            disruption_type=DisruptionType.CANCELLATION,
            cancellation_notice_timing="<14 days",
            airline_motive_known="yes",
            airline_motive="technical_problem",
            incident_description="Flight was cancelled without proper notice.",
        )
        assert disruption.disruption_type == "CANCELLATION"
        assert disruption.cancellation_notice_timing == "<14 days"

    def test_create_delay_disruption(self, case_with_passenger):
        disruption = Disruption.objects.create(
            case=case_with_passenger,
            disruption_type=DisruptionType.DELAY,
            delay_arrival_outcome=">3h",
            airline_motive_known="no",
            incident_description="Arrived 5 hours late.",
        )
        assert disruption.delay_arrival_outcome == ">3h"

    def test_create_denied_boarding_disruption(self, case_with_passenger):
        disruption = Disruption.objects.create(
            case=case_with_passenger,
            disruption_type=DisruptionType.DENIED_BOARDING,
            gave_up_seat_voluntarily="no",
            denied_boarding_reason="flight_overbooked",
            incident_description="Was denied boarding despite valid ticket.",
        )
        assert disruption.gave_up_seat_voluntarily == "no"
        assert disruption.denied_boarding_reason == "flight_overbooked"

    def test_incident_description_required(self, case_with_passenger):
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            Disruption.objects.create(
                case=case_with_passenger,
                disruption_type=DisruptionType.CANCELLATION,
                incident_description=None,
            )
```

Update `backend/tests/test_case_creation_api.py`: In every test fixture/helper that builds a case creation payload, add:

```python
"disruption": {
    "disruptionType": "cancellation",
    "cancellationNoticeTiming": "<14 days",
    "delayArrivalOutcome": "",
    "gaveUpSeatVoluntarily": "",
    "deniedBoardingReason": "",
    "airlineMotiveKnown": "no",
    "airlineMotive": "",
    "incidentDescription": "The flight was cancelled."
}
```

Add a new test:

```python
def test_submit_without_disruption_returns_400(self):
    payload = self._build_valid_payload()
    del payload["disruption"]
    # ... submit and assert 400
```

**Verification:**
```bash
cd backend
pytest tests/test_disruption_model.py tests/test_case_creation_api.py -v
```

---

### Task 4: Frontend Types + Empty Draft Update

**Files:**
- Modify: `frontend/src/features/case-entry/types.ts`

**Requirements:**
- Add disruption-related type aliases and interfaces: `DisruptionType`, `CancellationNoticeTiming`, `DelayArrivalOutcome`, `VoluntarySeatAnswer`, `DenialReason`, `AirlineMotiveKnown`, `AirlineMotive`, `DisruptionDetailsInput`, `DisruptionMotiveInput`
- Update `CASE_ENTRY_WIZARD_STEPS` to include `disruptionDetails` and `disruptionMotive` after `itinerary`
- Update `CaseEntryDraft` to include `disruptionDetails` and `disruptionMotive` sections
- Update `createEmptyCaseEntryDraft()` to initialize the new sections
- Add `disruption` to `CaseEntryPayload`

**Implementation:**

Replace the `CASE_ENTRY_WIZARD_STEPS` constant:

```typescript
export const CASE_ENTRY_WIZARD_STEPS = [
  "itinerary",
  "disruptionDetails",
  "disruptionMotive",
  "compliance",
  "flightDetails",
  "passengerDetails",
  "documents",
  "review",
] as const;
```

Add new types (before `CaseEntryDraft`):

```typescript
export type DisruptionType = "cancellation" | "delay" | "denied_boarding";
export type CancellationNoticeTiming = ">14 days" | "<14 days" | "on flight day";
export type DelayArrivalOutcome = "<3h" | ">3h" | "connection flight lost";
export type VoluntarySeatAnswer = "yes" | "no";
export type DenialReason = "flight_overbooked" | "aggressive_behavior" | "intoxication" | "unspecified_reason";
export type AirlineMotiveKnown = "yes" | "no" | "i_dont_know";
export type AirlineMotive = "technical_problem" | "meteorological_conditions" | "strike" | "problems_with_airport" | "crew_problems" | "other_motives";

export interface DisruptionDetailsInput {
  disruptionType: DisruptionType | null;
  cancellationNoticeTiming: CancellationNoticeTiming | null;
  delayArrivalOutcome: DelayArrivalOutcome | null;
  gaveUpSeatVoluntarily: VoluntarySeatAnswer | null;
  deniedBoardingReason: DenialReason | null;
}

export interface DisruptionMotiveInput {
  airlineMotiveKnown: AirlineMotiveKnown | null;
  airlineMotive: AirlineMotive | null;
  incidentDescription: string;
}
```

Update `CaseEntryDraft`:

```typescript
export interface CaseEntryDraft {
  itinerary: ItineraryInput;
  disruptionDetails: DisruptionDetailsInput;
  disruptionMotive: DisruptionMotiveInput;
  compliance: ConsentState;
  flightDetails: FlightDetailsInput;
  passengerDetails: PassengerDetailsInput;
  documents: DocumentsInput;
  compensationPreview: CompensationPreview | null;
}
```

Update `createEmptyCaseEntryDraft()`:

```typescript
export function createEmptyCaseEntryDraft(): CaseEntryDraft {
  return {
    itinerary: {
      departureAirport: null,
      destinationAirport: null,
      connectingFlights: [],
      problemFlightId: null,
    },
    disruptionDetails: {
      disruptionType: null,
      cancellationNoticeTiming: null,
      delayArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    },
    disruptionMotive: {
      airlineMotiveKnown: null,
      airlineMotive: null,
      incidentDescription: "",
    },
    compliance: {
      gdprConsentPrimary: null,
      gdprConsentSecondary: null,
    },
    flightDetails: {
      flightDate: "",
      flightNumber: "",
      airline: "",
      reservationNumber: "",
      plannedDepartureTime: "",
      plannedArrivalTime: "",
    },
    passengerDetails: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
    },
    documents: {
      boardingPass: { file: null },
      identification: { file: null },
    },
    compensationPreview: null,
  };
}
```

Add `disruption` to `CaseEntryPayload`:

```typescript
export interface CaseEntryPayload {
  reservationNumber: string;
  gdprConsentPrimary: boolean;
  gdprConsentSecondary: boolean;
  passenger: PassengerDetailsInput;
  itinerary: {
    departureAirport: AirportOption;
    destinationAirport: AirportOption;
    primaryFlight: {
      flightDate: string;
      flightNumber: string;
      airline: string;
      plannedDepartureTime: string;
      plannedArrivalTime: string;
    };
    connectingFlights: ConnectingFlightInput[];
    problemFlightId: string | null;
  };
  disruption: {
    disruptionType: DisruptionType;
    cancellationNoticeTiming: CancellationNoticeTiming | null;
    delayArrivalOutcome: DelayArrivalOutcome | null;
    gaveUpSeatVoluntarily: VoluntarySeatAnswer | null;
    deniedBoardingReason: DenialReason | null;
    airlineMotiveKnown: AirlineMotiveKnown | null;
    airlineMotive: AirlineMotive | null;
    incidentDescription: string;
  };
}
```

**Verification:**
```bash
cd frontend
npx tsc --noEmit
```

---

### Task 5: Frontend Schema Validation for Disruption Steps

**Files:**
- Modify: `frontend/src/features/case-entry/schema.ts`

**Requirements:**
- Add `disruptionDetailsSchema` with superRefine for conditional required fields
- Add `disruptionMotiveSchema` (base object schema)
- Add cross-section step schema for `disruptionMotive` that reads `disruptionDetails.disruptionType` to enforce airline motive requirement
- Update `caseEntryDraftSchema` to include both new sections
- Update `caseEntryStepSchemas` map with the two new step entries

**Implementation:**

Add after `itinerarySchema` and before `complianceSchema`:

```typescript
export const disruptionDetailsSchema = z.object({
  disruptionType: z.enum(["cancellation", "delay", "denied_boarding"], {
    required_error: "Select a disruption type.",
    invalid_type_error: "Select a disruption type.",
  }),
  cancellationNoticeTiming: z.string().nullable(),
  delayArrivalOutcome: z.string().nullable(),
  gaveUpSeatVoluntarily: z.string().nullable(),
  deniedBoardingReason: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (data.disruptionType === "cancellation" && !data.cancellationNoticeTiming) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select when you were informed about the cancellation.",
      path: ["cancellationNoticeTiming"],
    });
  }
  if (data.disruptionType === "delay" && !data.delayArrivalOutcome) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select how late you arrived.",
      path: ["delayArrivalOutcome"],
    });
  }
  if (data.disruptionType === "denied_boarding" && !data.gaveUpSeatVoluntarily) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Answer whether you gave up your seat voluntarily.",
      path: ["gaveUpSeatVoluntarily"],
    });
  }
  if (
    data.disruptionType === "denied_boarding"
    && data.gaveUpSeatVoluntarily === "no"
    && !data.deniedBoardingReason
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select the reason for denial of boarding.",
      path: ["deniedBoardingReason"],
    });
  }
});

export const disruptionMotiveSchema = z.object({
  airlineMotiveKnown: z.string().nullable(),
  airlineMotive: z.string().nullable(),
  incidentDescription: z.string().trim().min(1, "Describe the incident.").max(1000, "Maximum 1000 characters."),
});
```

Add cross-section step schema (used in `caseEntryStepSchemas`):

```typescript
const disruptionMotiveStepSchema = z.object({
  disruptionDetails: z.object({ disruptionType: z.string().nullable() }),
  disruptionMotive: disruptionMotiveSchema,
}).superRefine((data, ctx) => {
  const type = data.disruptionDetails.disruptionType;
  if ((type === "cancellation" || type === "delay") && !data.disruptionMotive.airlineMotiveKnown) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Answer whether the airline mentioned a disruption motive.",
      path: ["disruptionMotive", "airlineMotiveKnown"],
    });
  }
  if (
    (type === "cancellation" || type === "delay")
    && data.disruptionMotive.airlineMotiveKnown === "yes"
    && !data.disruptionMotive.airlineMotive
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select the motive communicated by the airline.",
      path: ["disruptionMotive", "airlineMotive"],
    });
  }
});
```

Update `caseEntryDraftSchema`:

```typescript
export const caseEntryDraftSchema = z.object({
  itinerary: itinerarySchema,
  disruptionDetails: disruptionDetailsSchema,
  disruptionMotive: disruptionMotiveSchema,
  compliance: complianceSchema,
  flightDetails: flightDetailsSchema,
  passengerDetails: passengerDetailsSchema,
  documents: documentsSchema,
});
```

Update `caseEntryStepSchemas`:

```typescript
export const caseEntryStepSchemas: Record<CaseEntryWizardStepId, z.ZodTypeAny> = {
  itinerary: z.object({ itinerary: itinerarySchema }),
  disruptionDetails: z.object({ disruptionDetails: disruptionDetailsSchema }),
  disruptionMotive: disruptionMotiveStepSchema,
  compliance: z.object({ compliance: complianceSchema }),
  flightDetails: z.object({ flightDetails: flightDetailsSchema }),
  passengerDetails: z.object({ passengerDetails: passengerDetailsSchema }),
  documents: z.object({ documents: documentsSchema }),
  review: caseEntryDraftSchema,
};
```

**Verification:**
```bash
cd frontend
npx tsc --noEmit
```

---

### Task 6: Frontend DisruptionDetailsStep Component

**Files:**
- Create: `frontend/src/features/case-entry/components/steps/DisruptionDetailsStep.tsx`

**Requirements:**
- Dropdown for disruption type selection
- Conditional radio groups for cancellation (notice timing), delay (arrival outcome), denied boarding (voluntary seat + denial reason)
- Clear irrelevant answers when disruption type changes
- Display validation errors from the schema

**Implementation:**

```tsx
import type { DisruptionDetailsInput, DisruptionType } from "../../types";

interface DisruptionDetailsStepProps {
  disruptionDetails: DisruptionDetailsInput;
  errors: Record<string, string[]>;
  onChange: <K extends keyof DisruptionDetailsInput>(field: K, value: DisruptionDetailsInput[K]) => void;
  onTypeChange: (type: DisruptionType | null) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function DisruptionDetailsStep({
  disruptionDetails,
  errors,
  onChange,
  onTypeChange,
}: DisruptionDetailsStepProps) {
  function handleTypeChange(value: string) {
    const newType = value === "" ? null : (value as DisruptionType);
    onTypeChange(newType);
  }

  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>What happened to your flight?</strong>
        <p>Select the type of disruption you experienced and answer the follow-up questions.</p>
      </section>

      <div className="form-grid">
        <label className="field">
          <span>Type of disruption</span>
          <select
            className="text-input"
            onChange={(e) => handleTypeChange(e.target.value)}
            value={disruptionDetails.disruptionType ?? ""}
          >
            <option value="">Select disruption type</option>
            <option value="cancellation">Cancellation</option>
            <option value="delay">Delay</option>
            <option value="denied_boarding">Denied Boarding</option>
          </select>
          {getError(errors, "disruptionDetails.disruptionType") && (
            <p className="field-error">{getError(errors, "disruptionDetails.disruptionType")}</p>
          )}
        </label>

        {disruptionDetails.disruptionType === "cancellation" && (
          <fieldset className="field">
            <legend>How many days before cancellation has the airline informed?</legend>
            {([">14 days", "<14 days", "on flight day"] as const).map((option) => (
              <label key={option} className="radio-option">
                <input
                  checked={disruptionDetails.cancellationNoticeTiming === option}
                  name="cancellationNoticeTiming"
                  onChange={() => onChange("cancellationNoticeTiming", option)}
                  type="radio"
                />
                <span>{option}</span>
              </label>
            ))}
            {getError(errors, "disruptionDetails.cancellationNoticeTiming") && (
              <p className="field-error">{getError(errors, "disruptionDetails.cancellationNoticeTiming")}</p>
            )}
          </fieldset>
        )}

        {disruptionDetails.disruptionType === "delay" && (
          <fieldset className="field">
            <legend>How late arrived to final destination?</legend>
            {(["<3h", ">3h", "connection flight lost"] as const).map((option) => (
              <label key={option} className="radio-option">
                <input
                  checked={disruptionDetails.delayArrivalOutcome === option}
                  name="delayArrivalOutcome"
                  onChange={() => onChange("delayArrivalOutcome", option)}
                  type="radio"
                />
                <span>{option}</span>
              </label>
            ))}
            {getError(errors, "disruptionDetails.delayArrivalOutcome") && (
              <p className="field-error">{getError(errors, "disruptionDetails.delayArrivalOutcome")}</p>
            )}
          </fieldset>
        )}

        {disruptionDetails.disruptionType === "denied_boarding" && (
          <>
            <fieldset className="field">
              <legend>Did you give up your seat voluntarily?</legend>
              {(["yes", "no"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionDetails.gaveUpSeatVoluntarily === option}
                    name="gaveUpSeatVoluntarily"
                    onChange={() => onChange("gaveUpSeatVoluntarily", option)}
                    type="radio"
                  />
                  <span>{option === "yes" ? "Yes" : "No"}</span>
                </label>
              ))}
              {getError(errors, "disruptionDetails.gaveUpSeatVoluntarily") && (
                <p className="field-error">{getError(errors, "disruptionDetails.gaveUpSeatVoluntarily")}</p>
              )}
            </fieldset>

            {disruptionDetails.gaveUpSeatVoluntarily === "no" && (
              <fieldset className="field">
                <legend>Reason behind denial of boarding</legend>
                {([
                  ["flight_overbooked", "Flight overbooked"],
                  ["aggressive_behavior", "Aggressive behavior with staff"],
                  ["intoxication", "Intoxication"],
                  ["unspecified_reason", "Unspecified reason"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="radio-option">
                    <input
                      checked={disruptionDetails.deniedBoardingReason === value}
                      name="deniedBoardingReason"
                      onChange={() => onChange("deniedBoardingReason", value)}
                      type="radio"
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {getError(errors, "disruptionDetails.deniedBoardingReason") && (
                  <p className="field-error">{getError(errors, "disruptionDetails.deniedBoardingReason")}</p>
                )}
              </fieldset>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

**Verification:**
```bash
cd frontend
npx tsc --noEmit
```

---

### Task 7: Frontend DisruptionMotiveStep Component

**Files:**
- Create: `frontend/src/features/case-entry/components/steps/DisruptionMotiveStep.tsx`

**Requirements:**
- For cancellation/delay: radio group "Did the airline mention disruption motive?" (yes/no/I don't know)
- If "yes": radio group for motive selection
- For all types: textarea for incident description with 1000-char limit and counter
- Display validation errors

**Implementation:**

```tsx
import type { AirlineMotive, AirlineMotiveKnown, DisruptionMotiveInput, DisruptionType } from "../../types";

interface DisruptionMotiveStepProps {
  disruptionType: DisruptionType | null;
  disruptionMotive: DisruptionMotiveInput;
  errors: Record<string, string[]>;
  onChange: <K extends keyof DisruptionMotiveInput>(field: K, value: DisruptionMotiveInput[K]) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

const AIRLINE_MOTIVE_OPTIONS: Array<{ value: AirlineMotive; label: string }> = [
  { value: "technical_problem", label: "Technical problem" },
  { value: "meteorological_conditions", label: "Meteorological conditions" },
  { value: "strike", label: "Strike" },
  { value: "problems_with_airport", label: "Problems with airport" },
  { value: "crew_problems", label: "Crew problems" },
  { value: "other_motives", label: "Other motives" },
];

export function DisruptionMotiveStep({
  disruptionType,
  disruptionMotive,
  errors,
  onChange,
}: DisruptionMotiveStepProps) {
  const showMotiveQuestion = disruptionType === "cancellation" || disruptionType === "delay";
  const charCount = disruptionMotive.incidentDescription.length;

  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Additional disruption details</strong>
        <p>Help us understand the circumstances around your disrupted flight.</p>
      </section>

      <div className="form-grid">
        {showMotiveQuestion && (
          <>
            <fieldset className="field">
              <legend>Did the airline mention disruption motive?</legend>
              {(["yes", "no", "i_dont_know"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionMotive.airlineMotiveKnown === option}
                    name="airlineMotiveKnown"
                    onChange={() => onChange("airlineMotiveKnown", option as AirlineMotiveKnown)}
                    type="radio"
                  />
                  <span>
                    {option === "yes" ? "Yes" : option === "no" ? "No" : "I don't know"}
                  </span>
                </label>
              ))}
              {getError(errors, "disruptionMotive.airlineMotiveKnown") && (
                <p className="field-error">{getError(errors, "disruptionMotive.airlineMotiveKnown")}</p>
              )}
            </fieldset>

            {disruptionMotive.airlineMotiveKnown === "yes" && (
              <fieldset className="field">
                <legend>What was the motive communicated by the airline?</legend>
                {AIRLINE_MOTIVE_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="radio-option">
                    <input
                      checked={disruptionMotive.airlineMotive === value}
                      name="airlineMotive"
                      onChange={() => onChange("airlineMotive", value)}
                      type="radio"
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {getError(errors, "disruptionMotive.airlineMotive") && (
                  <p className="field-error">{getError(errors, "disruptionMotive.airlineMotive")}</p>
                )}
              </fieldset>
            )}
          </>
        )}

        <label className="field">
          <span>Describe in short what has happened</span>
          <textarea
            className="text-input textarea-large"
            maxLength={1000}
            onChange={(e) => onChange("incidentDescription", e.target.value)}
            rows={6}
            value={disruptionMotive.incidentDescription}
          />
          <span className="char-counter">{charCount} / 1000</span>
          {getError(errors, "disruptionMotive.incidentDescription") && (
            <p className="field-error">{getError(errors, "disruptionMotive.incidentDescription")}</p>
          )}
        </label>
      </div>
    </div>
  );
}
```

**Verification:**
```bash
cd frontend
npx tsc --noEmit
```

---

### Task 8: Frontend Wizard Integration (CaseEntryPage + Hook)

**Files:**
- Modify: `frontend/src/features/case-entry/components/CaseEntryPage.tsx`
- Modify: `frontend/src/features/case-entry/hooks/useCaseEntryWizard.ts` (update `hasStepInteraction`)
- Delete: `frontend/src/features/case-entry/components/steps/LockedDisruptionStep.tsx`

**Requirements:**
- Remove `LockedDisruptionStep` import and all locked-step logic
- Import new `DisruptionDetailsStep` and `DisruptionMotiveStep`
- Add `disruptionDetails` and `disruptionMotive` to `activeStepMeta`
- Add cases to `renderActiveStep()` switch for both new steps
- Handle disruption type change by clearing irrelevant fields
- Update `hasStepInteraction` for the two new steps
- Remove `lockedSteps` array and `lockedPreviewStepId` state
- Renumber step labels to reflect new 8-step flow

**Implementation:**

Remove from imports:
```tsx
import { LockedDisruptionStep } from "./steps/LockedDisruptionStep";
```

Add imports:
```tsx
import { DisruptionDetailsStep } from "./steps/DisruptionDetailsStep";
import { DisruptionMotiveStep } from "./steps/DisruptionMotiveStep";
```

Update `activeStepMeta` to include new steps and renumber:
```typescript
const activeStepMeta: Record<CaseEntryWizardStepId, ActiveStepMeta> = {
  itinerary: {
    label: "Step 1",
    title: "Build the itinerary",
    description: "Capture the airports, the affected route, and any connecting flights tied to the disruption.",
  },
  disruptionDetails: {
    label: "Step 2",
    title: "Describe the disruption",
    description: "Select the type of disruption and answer the follow-up questions about what happened.",
  },
  disruptionMotive: {
    label: "Step 3",
    title: "Disruption motive",
    description: "Provide details about the airline's stated reason and describe the incident.",
  },
  compliance: {
    label: "Step 4",
    title: "Confirm consent",
    description: "Record the passenger's GDPR permissions before personal and document details are collected.",
  },
  flightDetails: {
    label: "Step 5",
    title: "Add primary flight details",
    description: "Enter the main reservation and scheduled timing that anchors the compensation case.",
  },
  passengerDetails: {
    label: "Step 6",
    title: "Capture passenger details",
    description: "Store the contact identity used for airline outreach and case tracking.",
  },
  documents: {
    label: "Step 7",
    title: "Upload proof documents",
    description: "Attach the boarding pass and the identification document required by intake review.",
  },
  review: {
    label: "Step 8",
    title: "Review and submit",
    description: "Confirm the collected information and submit.",
  },
};
```

Remove `lockedSteps` array, `LockedStepMeta` interface, `isLockedStepId` function, `lockedPreviewStepId` state, `canPreviewLockedSteps`, `visibleStepId`, `visibleLockedStep`, `clearLockedPreview` function, and all locked-step rendering logic.

Add switch cases in `renderActiveStep()`:
```tsx
case "disruptionDetails":
  return (
    <DisruptionDetailsStep
      disruptionDetails={wizard.draft.disruptionDetails}
      errors={currentStepErrors}
      onChange={(field, value) =>
        wizard.setStepData("disruptionDetails", (current) => ({
          ...current,
          [field]: value,
        }))
      }
      onTypeChange={(newType) =>
        wizard.setStepData("disruptionDetails", () => ({
          disruptionType: newType,
          cancellationNoticeTiming: null,
          delayArrivalOutcome: null,
          gaveUpSeatVoluntarily: null,
          deniedBoardingReason: null,
        }))
      }
    />
  );
case "disruptionMotive":
  return (
    <DisruptionMotiveStep
      disruptionType={wizard.draft.disruptionDetails.disruptionType}
      disruptionMotive={wizard.draft.disruptionMotive}
      errors={currentStepErrors}
      onChange={(field, value) =>
        wizard.setStepData("disruptionMotive", (current) => ({
          ...current,
          [field]: value,
        }))
      }
    />
  );
```

Update `hasStepInteraction` in `CaseEntryPage.tsx`:
```typescript
case "disruptionDetails":
  return draft.disruptionDetails.disruptionType !== null;
case "disruptionMotive":
  return (
    draft.disruptionMotive.airlineMotiveKnown !== null
    || draft.disruptionMotive.incidentDescription.trim().length > 0
  );
```

**Verification:**
```bash
cd frontend
npx tsc --noEmit
npm run dev  # visual check
```

---

### Task 9: Frontend API Payload Integration

**Files:**
- Modify: `frontend/src/features/case-entry/api.ts`

**Requirements:**
- Update `buildCaseEntryPayload()` to include `disruption` field composed from `draft.disruptionDetails` and `draft.disruptionMotive`

**Implementation:**

Update `buildCaseEntryPayload` to add disruption:

```typescript
export function buildCaseEntryPayload(draft: ValidatedCaseEntryDraft): CaseEntryPayload {
  return {
    reservationNumber: draft.flightDetails.reservationNumber,
    gdprConsentPrimary: draft.compliance.gdprConsentPrimary,
    gdprConsentSecondary: draft.compliance.gdprConsentSecondary,
    passenger: { ...draft.passengerDetails },
    itinerary: {
      departureAirport: draft.itinerary.departureAirport,
      destinationAirport: draft.itinerary.destinationAirport,
      primaryFlight: {
        flightDate: draft.flightDetails.flightDate,
        flightNumber: draft.flightDetails.flightNumber,
        airline: draft.flightDetails.airline,
        plannedDepartureTime: draft.flightDetails.plannedDepartureTime,
        plannedArrivalTime: draft.flightDetails.plannedArrivalTime,
      },
      connectingFlights: draft.itinerary.connectingFlights,
      problemFlightId: draft.itinerary.problemFlightId,
    },
    disruption: {
      disruptionType: draft.disruptionDetails.disruptionType,
      cancellationNoticeTiming: draft.disruptionDetails.cancellationNoticeTiming,
      delayArrivalOutcome: draft.disruptionDetails.delayArrivalOutcome,
      gaveUpSeatVoluntarily: draft.disruptionDetails.gaveUpSeatVoluntarily,
      deniedBoardingReason: draft.disruptionDetails.deniedBoardingReason,
      airlineMotiveKnown: draft.disruptionMotive.airlineMotiveKnown,
      airlineMotive: draft.disruptionMotive.airlineMotive,
      incidentDescription: draft.disruptionMotive.incidentDescription,
    },
  };
}
```

**Verification:**
```bash
cd frontend
npx tsc --noEmit
```

---

### Task 10: Frontend Tests

**Files:**
- Modify: `frontend/src/features/case-entry/__tests__/schema.test.ts` (add disruption schema tests)
- Modify: `frontend/src/features/case-entry/__tests__/useCaseEntryWizard.test.ts` (update step count/order)
- Modify: `frontend/src/features/case-entry/__tests__/CaseEntryPage.test.tsx` (update for new steps)
- Modify: `frontend/src/features/case-entry/__tests__/api.test.ts` (update draft to include disruption)

**Requirements:**
- Test disruption details schema: type required, conditional fields enforced per type
- Test disruption motive step schema: incident required, airlineMotiveKnown required for cancellation/delay, airlineMotive required when "yes"
- Update all existing tests that create empty drafts (they now have disruption sections)
- Update step count expectations from 6 to 8
- Test wizard navigation through disruption steps

**Implementation:**

Add to `schema.test.ts`:

```typescript
describe("disruptionDetailsSchema", () => {
  it("requires disruption type", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: null,
      cancellationNoticeTiming: null,
      delayArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });
    expect(result.success).toBe(false);
  });

  it("requires cancellation notice timing when type is cancellation", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "cancellation",
      cancellationNoticeTiming: null,
      delayArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });
    expect(result.success).toBe(false);
  });

  it("passes with valid cancellation data", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "cancellation",
      cancellationNoticeTiming: "<14 days",
      delayArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });
    expect(result.success).toBe(true);
  });

  it("requires denial reason when voluntarily is no", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "denied_boarding",
      cancellationNoticeTiming: null,
      delayArrivalOutcome: null,
      gaveUpSeatVoluntarily: "no",
      deniedBoardingReason: null,
    });
    expect(result.success).toBe(false);
  });
});
```

Update all places that reference `CASE_ENTRY_WIZARD_STEPS.length` or step counts from 6 to 8.

Update all `createEmptyCaseEntryDraft()` usage — the function already returns the new shape so no payload changes needed in tests, but assertions about step order need updating.

**Verification:**
```bash
cd frontend
npx vitest run
```

---

### Task 11: End-to-End Integration Test

**Files:**
- Modify: `backend/tests/test_case_creation_api.py`

**Requirements:**
- Full integration test: submit a case with disruption data, verify Disruption record is created in DB
- Test each disruption type variant (cancellation, delay, denied_boarding)
- Verify incident_description is persisted

**Implementation:**

Add to `test_case_creation_api.py`:

```python
@pytest.mark.django_db
class TestCaseCreationWithDisruption:
    def test_cancellation_disruption_persisted(self, client, valid_case_payload):
        valid_case_payload["disruption"] = {
            "disruptionType": "cancellation",
            "cancellationNoticeTiming": "<14 days",
            "delayArrivalOutcome": "",
            "gaveUpSeatVoluntarily": "",
            "deniedBoardingReason": "",
            "airlineMotiveKnown": "yes",
            "airlineMotive": "technical_problem",
            "incidentDescription": "Flight was cancelled due to technical issues.",
        }
        response = self._submit(client, valid_case_payload)
        assert response.status_code == 201
        case_id = response.json()["id"]
        disruption = Disruption.objects.get(case_id=case_id)
        assert disruption.disruption_type == "CANCELLATION"
        assert disruption.cancellation_notice_timing == "<14 days"
        assert disruption.airline_motive == "technical_problem"
        assert disruption.incident_description == "Flight was cancelled due to technical issues."

    def test_delay_disruption_persisted(self, client, valid_case_payload):
        valid_case_payload["disruption"] = {
            "disruptionType": "delay",
            "cancellationNoticeTiming": "",
            "delayArrivalOutcome": ">3h",
            "gaveUpSeatVoluntarily": "",
            "deniedBoardingReason": "",
            "airlineMotiveKnown": "no",
            "airlineMotive": "",
            "incidentDescription": "Arrived 4 hours late.",
        }
        response = self._submit(client, valid_case_payload)
        assert response.status_code == 201
        case_id = response.json()["id"]
        disruption = Disruption.objects.get(case_id=case_id)
        assert disruption.disruption_type == "DELAY"
        assert disruption.delay_arrival_outcome == ">3h"

    def test_denied_boarding_disruption_persisted(self, client, valid_case_payload):
        valid_case_payload["disruption"] = {
            "disruptionType": "denied_boarding",
            "cancellationNoticeTiming": "",
            "delayArrivalOutcome": "",
            "gaveUpSeatVoluntarily": "no",
            "deniedBoardingReason": "flight_overbooked",
            "airlineMotiveKnown": "",
            "airlineMotive": "",
            "incidentDescription": "Was denied boarding.",
        }
        response = self._submit(client, valid_case_payload)
        assert response.status_code == 201
        case_id = response.json()["id"]
        disruption = Disruption.objects.get(case_id=case_id)
        assert disruption.disruption_type == "DENIED_BOARDING"
        assert disruption.denied_boarding_reason == "flight_overbooked"
```

**Verification:**
```bash
cd backend
pytest tests/ -v --tb=short
```
