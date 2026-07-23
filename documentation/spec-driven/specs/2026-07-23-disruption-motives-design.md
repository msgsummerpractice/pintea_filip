# Disruption Motives Design Spec

## Document Control

- Date: 2026-07-23
- Epic: Case Register
- Story ID: CASE_03
- Story Title: Collect Disruption Motives
- Depends On: CASE_01 (Case Entry) — models, wizard, project setup; CASE_02 (Compensation Calculation) — model additions

## Purpose

Add disruption information collection to the case-entry wizard. The passenger selects a disruption type and answers type-specific conditional questions, provides an optional airline motive, and describes the incident. A case without disruption information cannot be submitted.

## Acceptance Criteria (from backlog)

1. Dropdown for disruption type: cancellation, delay, denied boarding.
2. Conditional fields shown dynamically based on type:
   - **Cancellation**: "How many days before cancellation has the airline informed?" — options: >14 days, <14 days, on flight day.
   - **Delay**: "How late arrived to final destination?" — options: <3h, >3h, connection flight lost.
   - **Denied Boarding**: "Did you give up your seat voluntarily?" — options: Yes, No. If No → follow-up "Reason behind denial of boarding" — options: Flight overbooked, aggressive behavior with staff, intoxication, unspecified reason.
3. Additional info for delay/cancellation: "Did the airline mention disruption motive?" — options: Yes, No, I don't know. If Yes → "What was the motive communicated by the airline?" — options: Technical problem, meteorological conditions, strike, problems with airport, crew problems, other motives.
4. For all types: incident description text box (max 1000 characters).
5. No validation on motive answer values (stored as-is).
6. A case without disruption information may not be submitted.

## Architecture Overview

Two new wizard steps are inserted after the itinerary step:

```
itinerary → disruptionDetails → disruptionMotive → compliance → flightDetails → passengerDetails → documents → review
```

```
┌──────────────────────┐
│   DisruptionDetails  │  Step 2: type dropdown + type-specific conditional fields
│        Step          │
└──────────────────────┘
           │
           ▼
┌──────────────────────┐
│   DisruptionMotive   │  Step 3: airline motive question + incident description
│        Step          │
└──────────────────────┘
           │
           ▼
┌──────────────────────┐
│       Backend        │  Disruption model persisted in case-creation transaction
│   Disruption model   │
└──────────────────────┘
```

## Frontend

### FE-1 New Wizard Steps

Replace `LockedDisruptionStep` with two active steps in the wizard step array:

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

### FE-2 DisruptionDetails Step

File: `frontend/src/features/case-entry/components/steps/DisruptionDetailsStep.tsx`

UI:
- Dropdown for disruption type (cancellation | delay | denied_boarding)
- When "cancellation" selected: radio group "How many days before cancellation has the airline informed?" with options: `>14 days`, `<14 days`, `on flight day`
- When "delay" selected: radio group "How late arrived to final destination?" with options: `<3h`, `>3h`, `connection flight lost`
- When "denied_boarding" selected: radio group "Did you give up your seat voluntarily?" with options: `Yes`, `No`. When "No" selected: radio group "Reason behind denial of boarding" with options: `Flight overbooked`, `aggressive behavior with staff`, `intoxication`, `unspecified reason`

Validation for step progression:
- Disruption type is required
- At least one type-specific answer is required (cancellation notice timing, delay arrival outcome, or voluntary seat answer)
- For denied boarding with voluntary=No, denial reason is required

### FE-3 DisruptionMotive Step

File: `frontend/src/features/case-entry/components/steps/DisruptionMotiveStep.tsx`

UI:
- For cancellation/delay only: radio group "Did the airline mention disruption motive?" with options: `Yes`, `No`, `I don't know`. When "Yes" selected: radio group "What was the motive communicated by the airline?" with options: `Technical problem`, `meteorological conditions`, `strike`, `problems with airport`, `crew problems`, `other motives`
- For all types: large textarea "Describe in short what has happened" with 1000-character limit and character counter

Validation for step progression:
- Incident description is required (non-empty after trim)
- For cancellation/delay: airline motive known question is required
- If airline motive known is "Yes": motive selection is required

### FE-4 Types

File: `frontend/src/features/case-entry/types.ts`

New types added to the draft:

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

The `CaseEntryDraft` gains two new sections:

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

### FE-5 Schema Validation

File: `frontend/src/features/case-entry/schema.ts`

New schemas:

```typescript
export const disruptionDetailsSchema = z.object({
  disruptionType: z.enum(["cancellation", "delay", "denied_boarding"], {
    required_error: "Select a disruption type.",
  }),
  cancellationNoticeTiming: z.string().nullable(),
  delayArrivalOutcome: z.string().nullable(),
  gaveUpSeatVoluntarily: z.string().nullable(),
  deniedBoardingReason: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (data.disruptionType === "cancellation" && !data.cancellationNoticeTiming) {
    ctx.addIssue({ code: "custom", message: "Select notice timing.", path: ["cancellationNoticeTiming"] });
  }
  if (data.disruptionType === "delay" && !data.delayArrivalOutcome) {
    ctx.addIssue({ code: "custom", message: "Select arrival outcome.", path: ["delayArrivalOutcome"] });
  }
  if (data.disruptionType === "denied_boarding" && !data.gaveUpSeatVoluntarily) {
    ctx.addIssue({ code: "custom", message: "Answer the voluntary seat question.", path: ["gaveUpSeatVoluntarily"] });
  }
  if (data.disruptionType === "denied_boarding" && data.gaveUpSeatVoluntarily === "no" && !data.deniedBoardingReason) {
    ctx.addIssue({ code: "custom", message: "Select the denial reason.", path: ["deniedBoardingReason"] });
  }
});

export const disruptionMotiveSchema = z.object({
  airlineMotiveKnown: z.string().nullable(),
  airlineMotive: z.string().nullable(),
  incidentDescription: z.string().trim().min(1, "Describe the incident.").max(1000, "Maximum 1000 characters."),
}).superRefine((data, ctx) => {
  // airlineMotiveKnown is required only when type is cancellation or delay,
  // but the schema is evaluated independently — this refinement enforces it unconditionally
  // since the step is only shown when the type warrants it, and always requires an answer.
  // The step component will pass the correct context.
});
```

Note: The `disruptionMotive` step validation requires cross-section context. The step schema reads `disruptionDetails.disruptionType` from the full draft to determine whether `airlineMotiveKnown` is required (only for cancellation/delay). If `airlineMotiveKnown` is "yes", `airlineMotive` is required.

Implementation approach: The step schema for `disruptionMotive` validates against a combined object `{ disruptionDetails, disruptionMotive }` so the refinement can access the type. This follows the same pattern the existing `review` step uses (validating the full draft).

The step schema map adds:
```typescript
disruptionDetails: z.object({ disruptionDetails: disruptionDetailsSchema }),
disruptionMotive: z.object({ disruptionDetails: z.object({ disruptionType: z.string() }), disruptionMotive: disruptionMotiveSchema }).superRefine(...)
```

### FE-6 Payload Addition

The `CaseEntryPayload` gains a `disruption` field:

```typescript
disruption: {
  disruptionType: DisruptionType;
  cancellationNoticeTiming: CancellationNoticeTiming | null;
  delayArrivalOutcome: DelayArrivalOutcome | null;
  gaveUpSeatVoluntarily: VoluntarySeatAnswer | null;
  deniedBoardingReason: DenialReason | null;
  airlineMotiveKnown: AirlineMotiveKnown | null;
  airlineMotive: AirlineMotive | null;
  incidentDescription: string;
}
```

### FE-7 Remove LockedDisruptionStep

Delete `frontend/src/features/case-entry/components/steps/LockedDisruptionStep.tsx` and any imports/references.

## Backend

### BE-1 New Model: Disruption

File: `backend/apps/cases/models.py`

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
```

Design notes:
- Answer fields use CharField with blank=True (no strict value validation per AC).
- `disruption_type` is constrained to the enum.
- `incident_description` is TextField with max_length=1000.

### BE-2 Serializer: DisruptionInputSerializer

File: `backend/apps/cases/api/serializers.py`

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

Key design: No value validation on the answer fields beyond max_length (per AC: "No Validation Required" on motive answers). Only `disruptionType` is choice-validated, and `incidentDescription` is required.

### BE-3 Update CaseCreateRequestSerializer

Add `disruption = DisruptionInputSerializer()` as a required field. This enforces that disruption data is always present at submission time.

### BE-4 Update case_creation.py

Within the `transaction.atomic()` block, after creating the case, persist the `Disruption` record:

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

### BE-5 Migration

A new migration file `0003_disruption.py` creates the `Disruption` table.

## Database

### DB-1 Disruption Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | BigAutoField | PK |
| case_id | FK → Case | OneToOne, CASCADE |
| disruption_type | CharField(20) | NOT NULL, CHECK in enum |
| cancellation_notice_timing | CharField(30) | blank, default="" |
| delay_arrival_outcome | CharField(30) | blank, default="" |
| gave_up_seat_voluntarily | CharField(5) | blank, default="" |
| denied_boarding_reason | CharField(50) | blank, default="" |
| airline_motive_known | CharField(20) | blank, default="" |
| airline_motive | CharField(50) | blank, default="" |
| incident_description | TextField | NOT NULL, max 1000 chars |
| created_at | DateTimeField | auto_now_add |

## Testing Strategy

### Frontend Tests

- `DisruptionDetailsStep.test.tsx`: renders type dropdown, shows conditional fields per type, validates required selections
- `DisruptionMotiveStep.test.tsx`: shows motive question for cancellation/delay only, requires incident description, shows motive options when "Yes" selected
- `schema.test.ts`: new disruption schema validation cases
- `useCaseEntryWizard.test.ts`: updated for new step order, step navigation with disruption steps

### Backend Tests

- `test_disruption_model.py`: model creation, required fields, type constraint
- `test_case_creation_api.py`: existing tests updated to include disruption payload, new tests for missing disruption rejection
- `test_disruption_serializer.py`: validates disruptionType is required, incidentDescription is required, other fields optional

## Conditional Field Logic Summary

| Disruption Type | Shown in DisruptionDetails | Shown in DisruptionMotive |
|-----------------|---------------------------|--------------------------|
| Cancellation | Notice timing (required) | Airline motive known (required) + incident (required) |
| Delay | Arrival outcome (required) | Airline motive known (required) + incident (required) |
| Denied Boarding | Voluntary seat (required), denial reason if No (required) | Incident only (required) |

## Out of Scope

- Eligibility evaluation logic (CASE_04)
- Compensation recalculation based on disruption
- Case status transitions based on disruption answers
- Any validation of answer values beyond presence checks
