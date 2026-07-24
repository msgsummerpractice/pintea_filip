# Create Colleague User Account Design Spec

## Document Control

- Date: 2026-07-24
- Epic: System Administration
- Story ID: ROLE_01
- Story Title: Create User Accounts
- Delivery Scope: Backend and frontend flow for a System Admin to create colleague user accounts

## Purpose

Define the backend and frontend behavior required for a System Admin to create a new colleague account, persist its access metadata, send the initial password by email, and confirm successful creation in the UI.

## Scope Summary

This delivery must:

- allow authenticated System Admin users to open a dedicated New User view
- collect first name, last name, email address, and initial password for the new colleague account
- validate the submitted data before account creation
- create a Django built-in `User` account for the colleague
- store the created account as an internal colleague user
- persist a first-login password-change flag for the new account
- send the initial password to the colleague's email address after successful persistence
- return a stable success confirmation that the frontend can display

This delivery must not:

- create passenger accounts from this admin flow
- grant System Admin privileges to new accounts by default
- support editing or deleting existing users
- reset or reuse existing accounts when the submitted email already exists
- implement the first-login password-change screen itself

## Functional Requirements

### FR-1 Access Control

- The system must provide the create-user capability only to authenticated System Admin users.
- Requests from unauthenticated users must be rejected.
- Requests from authenticated non-admin users must be denied.

### FR-2 New User View

- The frontend must provide a dedicated New User view in the administration area.
- The view must expose inputs for first name, last name, email address, and initial password.
- The form must prevent duplicate submission while a request is in flight.

### FR-3 Input Validation

- First name and last name are required and may not be blank after trimming whitespace.
- Email is required and must be a valid email address.
- Initial password is required.
- If the submitted email already belongs to an existing account, the request must fail with a validation error.

### FR-4 Account Creation

- On valid submission, the backend must create a new Django built-in `User` record.
- The new account must use the normalized email address for both `username` and `email`.
- The backend must populate `first_name` and `last_name` from the submitted form.
- The backend must store the password using Django's normal password hashing behavior.
- The created account must be active.

### FR-5 Role Assignment and Metadata

- New accounts created through this story must be colleague accounts by default.
- The backend must persist the colleague classification through `is_staff = true` and `is_superuser = false`.
- The backend must persist a first-login password-change flag for the new account.
- The first-login password-change flag must default to required for accounts created by this flow.

### FR-6 Email Notification

- After successful account persistence, the system must send the initial password to the specified email address.
- The email must state that the user can log in with their email address.
- The email must state that the password must be changed on first login.
- Email sending must not happen before the account creation transaction commits successfully.

### FR-7 Confirmation Response

- A successful create operation must return a stable success response for the frontend.
- The frontend must display a confirmation message after a successful response.
- The confirmation must make it clear that the colleague account was created successfully.

### FR-8 Failure Behavior

- Validation failures must return `400` responses with field-level errors.
- Authentication and authorization failures must not create any account records.
- If account persistence fails, no partial auth-state records may remain.
- If post-commit email delivery fails, the created account must remain persisted and the failure must be logged rather than rolled back.

## Data Design

### Django User

- Reuse Django's built-in `User` model for colleague login credentials.
- Populate `username`, `email`, `first_name`, and `last_name` from the submitted data.
- Set `username` to the normalized email address.
- Set `is_staff` to `True`.
- Set `is_superuser` to `False`.
- Keep `is_active` as `True`.

### Auth State

- Reuse the existing `PassengerAuthState` model as the generic first-login password-change state for auth users created in this project.
- Create one auth-state row for each newly created colleague account if none exists yet.
- Store `must_change_password_on_first_login = True` for accounts created by this flow.

## API Design

### Endpoint

- Add an admin-only create-user API endpoint under the existing admin user surface.
- Accept a JSON request payload with `firstName`, `lastName`, `email`, and `initialPassword`.

### Success Response

- Return `201 Created` when a new colleague account is created successfully.
- Return a compact payload containing the created user identifier, normalized email, derived role label `Colleague`, and a confirmation message.

Example response:

```json
{
  "id": 17,
  "email": "colleague@example.com",
  "role": "Colleague",
  "message": "User account created successfully."
}
```

### Validation Response

- Return field-keyed validation errors for invalid input.
- Use the email field to report duplicate-account rejection.

Example response:

```json
{
  "email": ["A user with this e-mail already exists."]
}
```

## Workflow Design

### Successful Flow

1. A System Admin opens the New User view.
2. The admin enters first name, last name, email address, and initial password.
3. The frontend submits the request to the admin-only create-user endpoint.
4. The backend validates the input and confirms the email is unused.
5. The backend creates the colleague `User` account inside a transaction.
6. The backend persists the first-login password-change flag.
7. The backend registers the credential email with `transaction.on_commit`.
8. The transaction commits successfully.
9. The system sends the email after commit.
10. The API returns a success payload and the frontend shows the confirmation message.

### Duplicate Email Flow

1. A System Admin submits a form using an email address that already exists.
2. The backend detects the existing account during validation.
3. The API returns a `400` validation response for the email field.
4. The frontend keeps the entered values and displays the validation error inline.

## Frontend Behavior

- The New User page should sit within the existing administration feature set alongside the user list.
- The form should disable its submit action while the request is pending.
- On success, the page should show a stable confirmation message and clear or reset the form.
- The page may provide a navigation path back to the user list after successful creation.
- Validation errors should render next to the relevant fields.
- Authorization failures should surface a stable access-denied message aligned with the current user-list experience.
- Unexpected server failures should surface a generic creation failure message without discarding the entered form values.

## Error Handling

- Duplicate-email rejection is a validation error, not a silent reuse path.
- Account creation and auth-state persistence must be atomic.
- Email delivery is a post-commit side effect and must not determine transaction success.
- Email delivery failures should be logged through the existing backend logging path.

## Testing Strategy

- Add backend API tests verifying that a System Admin can create a colleague account successfully.
- Verify the created account has `is_staff = true`, `is_superuser = false`, and a hashed password.
- Verify a first-login password-change flag row is persisted for the new account.
- Verify duplicate emails return a `400` validation response and do not create a second account.
- Verify non-admin users receive `403` responses.
- Verify the credential email is sent only after a successful commit.
- Add frontend tests verifying the New User page renders the form.
- Verify successful submission shows the confirmation state.
- Verify backend validation errors render inline.
- Verify access-denied and generic failure states render stable messages.

## Acceptance Criteria Mapping

- "The system allows the creation of new user accounts for colleagues." -> FR-1, FR-2, FR-4, FR-5
- "Confirmation message is shown upon successful account creation." -> FR-7, Frontend Behavior
- "For each new colleague the admin must enter a first name, last name, a valid e-mail address and an initial password." -> FR-2, FR-3
- "This password is sent to the specified email address and needs to be changed on the first login." -> FR-5, FR-6

## Open Decisions Resolved In This Spec

- New accounts created by this flow are colleague accounts by default, not system-admin accounts.
- Existing accounts are not reused or reset; duplicate emails are rejected with validation errors.
- The implementation reuses Django's built-in `User` model plus the existing auth-state model rather than introducing a new auth schema.
- Email delivery is deferred until after a successful transaction commit.