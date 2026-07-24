# User List Design Spec

## Document Control

- Date: 2026-07-23
- Epic: System administrator
- Story ID: Role_00
- Story Title: User List
- Delivery Scope: Backend admin user-list API and frontend user-list view

## Purpose

Define the backend and frontend behavior required for a System Admin to view all user accounts in the system.

## Scope Summary

This delivery must:

- provide a backend endpoint that returns all user accounts in the system
- restrict access to authenticated System Admin users
- include the fields `Name`, `E-Mail`, `Role`, `Assigned Cases`, and `Actions`
- derive the displayed role types as `Passenger`, `Colleague`, or `System Admin`
- compute assigned case counts from passenger-linked cases via `Passenger.user`
- add a frontend page that fetches and renders the user list
- show `Edit` and `Delete` actions as visible placeholders only

This delivery must not:

- implement account creation, account deletion, or account editing
- introduce a custom user model or a new role table
- add a login flow, login page, or session bootstrap UI
- redefine colleague assignment on cases beyond the current data model

## Functional Requirements

### FR-1 User List Access

- The system must provide a user list that is accessible only to authenticated System Admin users.
- The backend must enforce this authorization on the user-list API.
- The frontend may render the page shell for other visitors, but protected data access must remain blocked by the backend.

### FR-2 User Coverage

- The list must include all Django auth user accounts stored in the system.
- Included accounts may represent passengers, colleagues, or system administrators.
- The list must not exclude passenger-created accounts.

### FR-3 Display Fields

- Each user row must include `Name`, `E-Mail`, `Role`, `Assigned Cases`, and `Actions`.
- `Name` must display the concatenation of `first_name` and `last_name` when present.
- If both `first_name` and `last_name` are blank, the system must still provide a non-empty display value, using the email address as the fallback label.
- `E-Mail` must display the user's email address.

### FR-4 Role Resolution

- The system must display one of three role labels: `System Admin`, `Colleague`, or `Passenger`.
- `System Admin` means a user with `is_superuser = true`.
- `Colleague` means a user with `is_staff = true` and `is_superuser = false`.
- `Passenger` means any remaining non-internal auth user account that is not already classified as `System Admin` or `Colleague`.
- Passenger-linked accounts created through case submission are included in the `Passenger` role.
- Role resolution must use that precedence order so every listed account receives a deterministic label.

### FR-5 Assigned Case Count

- The system must provide an assigned case count for each listed user.
- For this story, the count means the number of cases linked through passenger records associated to that auth user via `Passenger.user`.
- The story does not interpret the free-text `Case.assigned_colleague` field as a source of assigned-case counts.
- Users without linked passenger cases must return `0`.

### FR-6 Actions Column

- The system must display `Edit` and `Delete` actions for each row.
- In this story, those actions are placeholders only and must not trigger mutation behavior.
- The UI must communicate that the actions are currently unavailable rather than making them appear broken.

### FR-7 Frontend User List View

- The frontend must provide a dedicated User List view separate from the passenger case-entry flow.
- On page load, the view must request the backend user-list endpoint and render the returned rows in a table.
- The table must include the required columns in a stable, readable layout.

## Data and API Design

### Backend Endpoint

- Add a dedicated read-only API endpoint for the user list.
- The endpoint returns a flat JSON collection of user rows suitable for direct table rendering.
- Each row must include:
  - `id`
  - `name`
  - `email`
  - `role`
  - `assignedCaseCount`
  - action metadata or placeholder labels needed by the frontend to render unavailable `Edit` and `Delete` actions

### Query Behavior

- The endpoint queries Django auth users as the authoritative source for the list.
- The query must annotate or otherwise compute the number of passenger-linked cases per auth user.
- The count source is the relation path from auth user to passenger records and then to cases.
- The query should avoid N+1 behavior when computing counts.

### Name Formatting

- The backend may precompute a normalized display name, or the frontend may format first and last name from returned fields.
- Regardless of implementation split, the final table must never show an empty primary label for a user row.

## Authentication and Authorization

- This story requires an authenticated System Admin session to successfully use the user-list endpoint.
- The story does not implement login UI or a broader authentication flow.
- Authentication and session establishment are treated as prerequisites supplied by adjacent or future stories.
- If the request is unauthenticated, the API should return an authentication failure response.
- If the request is authenticated but the user is not a System Admin, the API must deny access.

## Frontend Behavior

### Page States

- The page must show a loading state while the request is in flight.
- When users are returned, the page must render the populated table.
- If no users exist, the page must render an explicit empty state.
- If the request fails due to missing or insufficient access, the page must render an access-related message.
- For other request failures, the page must render a generic load failure state.

### Actions Rendering

- The `Actions` column must visibly include `Edit` and `Delete` for every row.
- Those controls may be rendered as disabled buttons, inert controls, or clearly unavailable links, as long as they are visibly present and clearly non-functional.

## Error Handling

- Unauthorized or forbidden access must not leak protected user-list data.
- Normal backend validation for other APIs remains unchanged.
- Failures in loading the user list must not affect unrelated frontend flows such as case entry.
- Generic server errors for the user list should surface as a stable failure message in the UI.

## Testing Strategy

- Add backend API tests verifying that a System Admin can retrieve the user list.
- Add backend API tests verifying that an authenticated non-admin user is denied access.
- Add backend API tests verifying role mapping for `Passenger`, `Colleague`, and `System Admin`.
- Add backend API tests verifying assigned case counts derived from `Passenger.user` linked cases.
- Add frontend tests for loading, populated, empty, and access-denied states.
- Add frontend tests verifying that the `Edit` and `Delete` actions are rendered but do not invoke mutation behavior.

## Acceptance Criteria Mapping

- "The system provides access to all users in the System." -> FR-1, FR-2, Backend Endpoint
- "Fields: Name (Firstname + Lastname), E-Mail, Role, number of assigned cases, actions (delete, edit)." -> FR-3, FR-4, FR-5, FR-6, FR-7
- "Backend: Provide admin user list API" -> FR-1, Backend Endpoint
- "Backend: Include assigned case counts" -> FR-5, Query Behavior
- "Backend: Enforce admin authorization" -> FR-1, Authentication and Authorization
- "Frontend: Build user list view" -> FR-7, Frontend Behavior
- "Frontend: Display name, email, role, assigned cases, and actions" -> FR-3, FR-4, FR-5, FR-6
- "Database: Query users and assigned case counts" -> Query Behavior, FR-5

## Open Decisions Resolved In This Spec

- Use Django's built-in auth user model and flags instead of introducing a custom role model.
- Treat `System Admin` as `is_superuser = true`.
- Treat `Colleague` as `is_staff = true` and `is_superuser = false`.
- Treat `Passenger` as the fallback non-internal auth role unless already classified as an internal role.
- Include all auth accounts in the list, including passenger-created accounts.
- Compute assigned case counts from passenger-linked cases only.
- Render `Edit` and `Delete` as placeholders only in this story.
- Require authenticated admin access while keeping login/session UI out of scope.