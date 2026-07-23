# Compensation Calculation Design Spec

## Document Control

- Date: 2026-07-23
- Epic: Case Register
- Story ID: CASE_02
- Story Title: Calculate Compensation Level
- Depends On: CASE_01 (Case Entry) — models, wizard, airport search

## Purpose

Add orthodromic-distance-based compensation calculation to the case-entry flow. The system calls the AirportGap distance API to determine the distance between starting and final-destination airports, applies EU-regulation thresholds, displays the result live on the Itinerary step, and persists the calculation when the case is submitted.

## Acceptance Criteria (from backlog)

1. The system calculates the orthodromic distance between the starting and final destination (connecting flights are not considered).
2. The system determines the compensation level based on the calculated distance:
   - < 1500 km → 250 €
   - 1500–3500 km → 400 €
   - > 3500 km → 600 €
3. The calculated compensation level is displayed to the user and added as information to the case.

## Architecture Overview

```
┌──────────────┐       POST /compensation/calculate       ┌──────────────────┐
│   Frontend   │ ──────────────────────────────────────── ▶│  Django Backend  │
│  (Itinerary  │◀──── { distance_km, compensation_eur } ──│                  │
│    Step)     │                                           │  compensation.py │
└──────────────┘                                           └────────┬─────────┘
                                                                    │
                                                    POST /airports/distance
                                                                    │
                                                           ┌────────▼─────────┐
                                                           │   AirportGap API │
                                                           └──────────────────┘
```

At submission time the backend re-calculates and persists a `CompensationCalculation` record within the case-creation transaction.

## Backend

### BR-1 New Model: CompensationCalculation

File: `apps/cases/models.py`

| Field | Type | Notes |
|-------|------|-------|
| case | OneToOneField(Case) | related_name="compensation_calculation" |
| start_airport_code | CharField(max_length=10) | IATA of departure |
| final_destination_code | CharField(max_length=10) | IATA of final destination |
| orthodromic_distance_km | DecimalField(max_digits=10, decimal_places=2) | From AirportGap |
| compensation_amount_eur | PositiveSmallIntegerField | 250, 400, or 600 |
| calculated_at | DateTimeField(auto_now_add=True) | |

Migration adds this table.

### BR-2 Compensation Service

File: `apps/cases/services/compensation.py`

```python
@dataclass(frozen=True, slots=True)
class CompensationResult:
    distance_km: Decimal
    compensation_eur: int
```

Function: `calculate_compensation(from_code: str, to_code: str) -> CompensationResult`

Steps:
1. Call `POST https://airportgap.com/api/airports/distance` with form data `from=<from_code>&to=<to_code>`
2. Parse JSON:API response → extract `data.attributes.kilometers`
3. Apply thresholds:
   - distance < 1500 → 250
   - 1500 ≤ distance ≤ 3500 → 400
   - distance > 3500 → 600
4. Return `CompensationResult`

Error handling:
- `requests.exceptions.SSLError` → fallback to curl (same pattern as `AirportGapClient._search_remote_with_curl`)
- Other request failures → raise `CompensationCalculationError`
- 422 from AirportGap (invalid IATA code) → raise `InvalidAirportCodeError`

Auth: Uses `settings.AIRPORTGAP_API_TOKEN` in Bearer header (same token as search).

### BR-3 Preview Endpoint

URL: `POST /api/compensation/calculate`
View: `CompensationCalculateView`

Request body (JSON):
```json
{
  "from_airport": "BUH",
  "to_airport": "CDG"
}
```

Validation:
- Both fields required
- Each must be 2–4 uppercase letters (IATA format)

Response 200:
```json
{
  "distance_km": 1868.42,
  "compensation_eur": 400
}
```

Response 400 (validation):
```json
{
  "from_airport": ["This field is required."]
}
```

Response 422 (invalid airport code):
```json
{
  "detail": "One or both airport codes are not recognized."
}
```

Response 503 (AirportGap unavailable):
```json
{
  "detail": "Compensation calculation is temporarily unavailable."
}
```

### BR-4 Case Creation Integration

In `create_case` (within the existing transaction):
1. Extract `start_airport_code` from `validated_data["itinerary"]["departureAirport"]["code"]`
2. Extract `final_destination_code` from `validated_data["itinerary"]["destinationAirport"]["code"]`
3. Call `calculate_compensation(start_code, final_code)`
4. Create `CompensationCalculation` record linked to the case

If the distance API fails during submission, the transaction rolls back and the client receives a 503 error. This is acceptable because compensation is mandatory for case creation per the acceptance criteria.

### BR-5 Case Create Response Change

Current response: `{ "id": 1, "status": "NEW" }`

New response: `{ "id": 1, "status": "NEW", "compensation": { "distance_km": 1868.42, "compensation_eur": 400 } }`

## Frontend

### FR-1 Compensation Preview API Function

File: `features/case-entry/api.ts`

```typescript
export interface CompensationPreview {
  distanceKm: number;
  compensationEur: number;
}

export async function calculateCompensation(
  fromAirport: string,
  toAirport: string,
): Promise<CompensationPreview> {
  const response = await requestJson<{ distance_km: number; compensation_eur: number }>(
    "/compensation/calculate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_airport: fromAirport, to_airport: toAirport }),
    },
  );
  return { distanceKm: response.distance_km, compensationEur: response.compensation_eur };
}
```

### FR-2 Draft State Extension

File: `features/case-entry/types.ts`

Add to `CaseEntryDraft`:
```typescript
compensationPreview: CompensationPreview | null;
```

Initialize as `null` in `createEmptyCaseEntryDraft()`.

### FR-3 Itinerary Step — Live Calculation

File: `features/case-entry/components/steps/ItineraryStep.tsx`

Behavior:
- When both `departureAirport` and `destinationAirport` are non-null and different from previous values, trigger `calculateCompensation` after a 300ms debounce
- While loading: show a subtle loading indicator below the airport selectors
- On success: display an info card with:
  - "Distance: 1,868 km"
  - "Estimated compensation: €400"
- On error: show a non-blocking warning ("Could not calculate compensation. You can still proceed.")
- When either airport is cleared: hide the info card and reset preview to null
- Store result in `draft.compensationPreview`

### FR-4 Review Step — Compensation Summary

File: `features/case-entry/components/steps/ReviewSubmitStep.tsx`

- If `draft.compensationPreview` is non-null, display the distance and compensation in the review summary
- Label: "Compensation Estimate" with distance and amount

### FR-5 Submit Response Handling

Update `CaseEntrySubmitResponse` type to include:
```typescript
compensation?: {
  distance_km: number;
  compensation_eur: number;
};
```

## Testing

### Backend Tests

- `test_compensation_service.py`:
  - Mock AirportGap API → verify threshold logic for each band boundary (1499, 1500, 3500, 3501)
  - Mock SSL error → verify curl fallback
  - Mock 422 → verify InvalidAirportCodeError
  - Mock timeout → verify CompensationCalculationError

- `test_compensation_api.py`:
  - POST with valid codes → 200 with distance and amount
  - POST with missing field → 400
  - POST with invalid format → 400
  - Mock API failure → 503

- `test_case_creation_api.py` (extend existing):
  - Verify case creation now returns compensation data
  - Verify CompensationCalculation record exists after create

### Frontend Tests

- `api.test.ts` (extend):
  - `calculateCompensation` returns correct mapped response
  - Handles error responses

- `ItineraryStep.test.tsx`:
  - Selecting both airports triggers calculation
  - Clearing an airport hides the result
  - API error shows non-blocking warning

## Migration

One new migration adding the `CompensationCalculation` table.

## URL Registration

Add to `apps/cases/api/urls.py`:
```python
path("compensation/calculate", CompensationCalculateView.as_view(), name="compensation-calculate"),
```

## Out of Scope

- Caching distance results between requests (acceptable for MVP)
- Offline/local distance calculation fallback
- Editing compensation after submission
- Compensation for connecting-flight-only distances
- Eligibility evaluation (CASE_03+)
