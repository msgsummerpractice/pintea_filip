# Case Entry Design Spec

## Document Control

- Date: 2026-07-23
- Epic: Case Register
- Story Title: Case Entry
- Story Identifier: Not provided in the source prompt; this spec uses epic and title as the canonical reference.
- Delivery Scope: Project setup plus Story 1 implementation only

## Purpose

Define the first deliverable for the compensation case-management platform: a new React frontend, Django backend, and PostgreSQL database that support public case intake for passengers through a dynamic staged form.

This story creates a new compensation case with status `NEW`. It does not implement automatic eligibility checks, compensation calculation, passenger account creation, or email automation.

## Source Hierarchy

- Authoritative functional source: `project-overview/Python Training Backlog 2026(AI Hackathon Backlog).csv`
- Supporting context: attached PDFs and case-flow materials
- Baseline reference: `project-overview/compensation-case-foundation.md`
- Conflict resolution used in this spec: backlog acceptance criteria override supporting PDF wording

## Scope Summary

This delivery must:

- create the project foundation for React, Django, and PostgreSQL
- expose a public case entry experience for passengers
- implement a dynamic multi-step wizard with progress tracking
- validate all required form fields before allowing stage progression or submission
- integrate airport lookup using the AirportGap API
- support up to four connecting flights
- require one problem flight selection when connecting flights exist
- upload and validate boarding pass and ID/passport documents
- enforce GDPR consent before submission
- persist a new case transactionally with status `NEW`

This delivery must not:

- implement disruption details business logic from CASE_03
- implement disruption motives business logic from CASE_03
- calculate compensation
- determine eligibility
- create passenger accounts
- send emails
- implement colleague workflows or manual review flows

## Product Decision Summary

- Architecture: React SPA + Django REST API + PostgreSQL
- Local development model: run directly on the developer's machine with a locally installed PostgreSQL instance
- Intake style: staged wizard with hard validation gates between stages
- Visual direction: modern, animated, responsive UI with blue/green accent styling
- Submission result: create case only, initial status `NEW`
- Upload types: `pdf`, `jpg`, `jpeg`

## User Story

As a passenger, I want to fill out a form that contains personal and flight information in order to create a new compensation case.

## Acceptance Criteria Interpretation

The backlog states that each case entry form contains six distinct parts:

1. flight itinerary
2. disruption details
3. disruption motives
4. email and compliance request
5. flight details
6. passenger details

This story does not implement parts 2 and 3 because they belong to CASE_03. To preserve the intended product structure while keeping scope correct, the UI will still show six steps in the progress system, but steps 2 and 3 will be visibly marked as unavailable in this story and will not collect or submit data.

The active data-entry stages for this story are therefore:

1. Flight itinerary
2. Email and compliance request
3. Flight details
4. Passenger details
5. Documents
6. Review and submit

The visible progress bar will still acknowledge the broader six-part product structure, but Story 1 submission only includes its own implemented inputs.

## Functional Requirements

### FR-1 Public Access

- A public user can open the case entry form without authentication.

### FR-2 Dynamic Wizard

- The form is a stage-based wizard.
- Users cannot continue to the next active stage until the current stage is valid.
- The current stage, completed stages, and remaining stages are visible in a progress bar.
- Users may navigate backward without losing entered data.
- Stage transitions use lightweight animation.

### FR-3 Flight Itinerary Capture

- The form must capture:
  - flight date
  - flight number
  - airline
  - reservation number
  - departing airport
  - destination airport
  - up to four connecting flights
  - planned departure time
  - planned arrival time
- Airport inputs must be sourced from airport lookup results rather than arbitrary free text.
- Each connecting flight must store:
  - flight number
  - flight date
  - airline
- If one or more connecting flights are added, the user must select which one is the problem flight.

### FR-4 Passenger Details Capture

- The form must capture:
  - first name
  - last name
  - date of birth
  - email
  - phone
  - address
  - postal code

### FR-5 GDPR Capture

- The form must present two GDPR fields with agree/disagree choices according to the story text.
- Submission is allowed only when the required consent state is affirmative.
- If the product later distinguishes informational acknowledgment from actionable consent, that can be added without changing the case aggregate root.

### FR-6 Document Upload

- The user must upload both:
  - boarding pass
  - ID or passport
- Each file must be limited to 5 MB maximum.
- Allowed formats are `pdf`, `jpg`, and `jpeg`.
- Invalid type or size must block stage completion and final submission.

### FR-7 Case Creation

- On successful submit, the system creates a new case record.
- The initial case status is `NEW`.
- The system also persists passenger data, itinerary flight legs, problem-flight marker, GDPR consent values, and uploaded document metadata.
- Persistence is transactional; failures must not leave partial records.

### FR-8 Airport Lookup Integration

- The backend exposes a safe API for airport search.
- The backend integrates with AirportGap.
- The frontend consumes the backend endpoint for typeahead lookup.
- The system stores canonical airport identifiers and display labels returned from lookup.

## Validation Rules

### VR-1 Required Fields

- All fields in this story are mandatory.

### VR-2 Date Rules

- Date of birth must be earlier than the current date.
- Flight dates and planned times must form a valid datetime sequence.

### VR-3 Contact Rules

- Email must pass server-side regex validation.
- Phone must pass server-side regex validation.

### VR-4 Airport Rules

- Departure and destination airports must be selected from lookup results.
- Connection airports, if applicable in the chosen leg model, must also come from lookup results.

### VR-5 Connection Rules

- A maximum of four connecting flights may be added.
- If connecting flights exist, one problem-flight selection is mandatory.
- No more than one problem-flight marker is allowed.

### VR-6 File Rules

- Both required documents must be present.
- Each file must be 5 MB or smaller.
- Only `pdf`, `jpg`, and `jpeg` are allowed.

### VR-7 Consent Rule

- Final submission is blocked unless the required GDPR consent is affirmative.

## UX and Visual Design

### UX-1 Interaction Model

- The form behaves as a guided wizard rather than a long static page.
- The next-stage action stays disabled until the active stage validates.
- Inline error messages appear near the relevant field.
- A final review step summarizes the payload before submit.

### UX-2 Visual Direction

- Primary accent colors use a blue/green palette.
- The design should feel modern and polished rather than default framework styling.
- Use animated transitions between stages, progress state motion, and subtle field reveal animations.
- The design must remain responsive on mobile and desktop.

### UX-3 Progress Bar

- A prominent progress bar appears near the top of the wizard.
- It must clearly show current stage, completed stages, and remaining stages.
- Progress feedback should be visually tied to validation completion.

## Architecture

### Frontend

- Framework: React
- Responsibilities:
  - render the staged wizard
  - manage local form state and per-stage validation state
  - call airport search endpoint
  - assemble multipart submit payload
  - provide responsive animated UX

Suggested feature decomposition:

- `CaseEntryPage`
- `ProgressStepper`
- `FlightItineraryStep`
- `ComplianceStep`
- `FlightDetailsStep`
- `PassengerDetailsStep`
- `DocumentsStep`
- `ReviewSubmitStep`
- `ConnectingFlightsEditor`
- `AirportAutocomplete`

### Backend

- Framework: Django with Django REST Framework
- Responsibilities:
  - expose public REST endpoints
  - proxy airport lookup
  - validate all business rules for Story 1
  - process multipart uploads
  - persist case data transactionally

Suggested API surface:

- `GET /api/airports/search?q=<query>`
- `POST /api/cases`

### Database

- Engine: PostgreSQL
- Persistence style: normalized relational schema with foreign keys

Suggested initial entities:

- `cases`
- `passengers`
- `flight_legs`
- `documents`

## Data Model

### Case

- id
- public_case_reference, optional for Story 1 unless user-facing confirmation requires it
- status
- reservation_number
- gdpr_consent_primary
- gdpr_consent_secondary
- created_at
- updated_at
- passenger_id

### Passenger

- id
- first_name
- last_name
- date_of_birth
- email
- phone
- address
- postal_code
- created_at
- updated_at

### Flight Leg

- id
- case_id
- leg_order
- is_primary_leg
- is_connecting_leg
- is_problem_flight
- flight_date
- flight_number
- airline
- departure_airport_code
- departure_airport_name
- destination_airport_code
- destination_airport_name
- planned_departure_time
- planned_arrival_time

### Document

- id
- case_id
- document_category
- original_file_name
- mime_type
- file_size_bytes
- storage_path
- uploaded_at

## API Design

### Airport Search Response

The backend returns a normalized payload suitable for autocomplete.

Suggested item shape:

- code
- name
- city
- country
- display_label

### Case Creation Request

`POST /api/cases` uses `multipart/form-data` with:

- structured fields for case, passenger, and flight data
- one boarding-pass file
- one identification file

The backend may accept a JSON field for nested data plus separate files to keep the payload stable.

### Case Creation Response

- case_id
- status
- created_at
- confirmation message

## Error Handling

- Client-side validation errors stay inline at the field and stage level.
- Server-side validation failures return structured field errors and a non-2xx status.
- Airport API upstream failures return a controlled error message and do not expose raw upstream failures.
- Database or file-storage failures roll back the case creation transaction.

## Security and Compliance Considerations

- Server-side validation is authoritative.
- Uploaded files must be validated by extension and content type.
- Public endpoints must use request throttling and standard API hardening.
- Personally identifiable information must be stored using the project’s standard secure configuration.
- No authentication is required for intake, but abuse controls should be included in implementation planning.

## Non-Functional Requirements

- Responsive experience on current desktop and mobile browsers.
- Clear stage transition performance without long blocking UI operations.
- Form state should survive step navigation within the current session.
- API design should support later extension for eligibility and account-creation flows without breaking this story’s contracts.

## Testing Strategy

### Frontend Tests

- stage gating blocks progression until valid
- progress bar reflects current and completed stages
- connecting-flight add/remove behavior respects the max of four
- problem-flight selection becomes mandatory when connections exist
- document upload rules display proper validation messages

### Backend Tests

- successful case creation persists all records with status `NEW`
- invalid email is rejected
- invalid phone is rejected
- underage or present-day date of birth is rejected when it violates the earlier-than-today rule
- missing GDPR consent is rejected
- too many connecting flights are rejected
- missing problem-flight selection is rejected
- invalid file type is rejected
- oversize file is rejected
- transaction rolls back on persistence failure

### Integration Tests

- happy-path wizard submission creates a case and related records
- airport lookup endpoint returns normalized search results

## Delivery Boundaries for Story 1

Included:

- project scaffolding for React, Django, and PostgreSQL
- staged passenger case-entry wizard
- airport lookup integration
- file upload validation and persistence
- `NEW` status case creation

Explicitly excluded:

- CASE_03 disruption steps implementation
- eligibility evaluation
- compensation calculation
- staff assignment or status transitions beyond storing allowed status vocabulary
- user account creation
- email sending

## Risks and Follow-Up Items

- The original source text conflicts on whether `png` is allowed. This spec follows the acceptance criteria and excludes PNG.
- The six-part acceptance structure conflicts with Story 1 scope because parts 2 and 3 belong to CASE_03. This spec preserves the broader form structure visually while limiting submission to the current story’s implemented fields.
- A user-facing case reference may be needed soon. If so, generation should be added during implementation planning.

## Implementation Recommendation

Implement this story as a clean project foundation with a public intake API and a polished staged React wizard. Keep validation duplicated on the client for UX and authoritative on the server for correctness. Treat `NEW` case creation as the only submission outcome in this story.