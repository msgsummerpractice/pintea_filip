# Save Case Design Spec

## Document Control

- Date: 2026-07-23
- Epic: Case Register
- Story Title: Save Case
- Delivery Scope: Backend persistence and API contract for case creation

## Purpose

Define the backend behavior for creating and saving a passenger compensation case from submitted intake data.

## Scope Summary

This delivery must:

- create a case when the passenger submits valid intake data
- generate a unique case identifier and persist the case creation date
- persist passenger, flight, disruption, document, and compensation data transactionally
- add an initially empty colleague assignment field on the case record
- return a stable success payload the frontend can use for confirmation
- return a user-safe error response when persistence fails

This delivery must not:

- assign a colleague automatically
- implement staff assignment workflows
- create passenger accounts or send emails

## Functional Requirements

### FR-1 Case Persistence

- The backend accepts the existing multipart case submission contract.
- A successful request creates exactly one case and its related graph.
- The created case includes all submitted passenger, itinerary, disruption, and document details.

### FR-2 Unique Case Identifier

- Each created case must receive a generated business case ID.
- The case ID must be unique and immutable.
- The API response must expose the generated case ID.

### FR-3 Creation Metadata

- The backend persists the case creation timestamp.
- The API response must expose the created timestamp in ISO 8601 format.

### FR-4 Colleague Assignment Placeholder

- Each created case stores a colleague assignment field.
- The field starts empty until a later workflow assigns a colleague.

### FR-5 Transaction Safety

- Passenger, case, flight, document, disruption, and compensation records must be created in a single transaction.
- If any persistence step fails, no partial records may remain in the database.

### FR-6 Failure Response

- Validation failures continue to return structured `400` responses.
- Database persistence failures return a non-validation error response with a user-safe message.

## Data Design

### Case

- Keep the existing internal relational model intact.
- Add `case_id` as a unique business identifier.
- Add `assigned_colleague` as an empty-string placeholder field.
- Continue using `created_at` for the case creation date.

### Related Records

- Reuse the existing `Passenger`, `FlightLeg`, `UploadedDocument`, `Disruption`, and `CompensationCalculation` tables and relations.

## API Contract

### POST /api/cases/

Successful response additions:

- `id`: generated business case ID for backward-compatible consumers
- `caseId`: generated business case ID
- `createdAt`: ISO 8601 creation timestamp
- `status`: initial workflow status

Validation failures remain unchanged.

Persistence failure response:

- status `500`
- body `{ "detail": "Unable to save case at this time." }`

## Testing Strategy

- Extend the focused case creation API tests to assert generated case ID, created timestamp, and empty colleague assignment.
- Add a focused API test covering database save failure rollback and error messaging.
- Extend model tests to cover default case metadata behavior.