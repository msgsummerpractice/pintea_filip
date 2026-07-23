# Create User Account Design Spec

## Document Control

- Date: 2026-07-23
- Epic: Case Register
- Story ID: Case_05
- Story Title: Create User account
- Delivery Scope: Backend account creation and credential notification after successful case capture

## Purpose

Define the backend behavior for creating a passenger login account after a case is successfully persisted.

## Scope Summary

This delivery must:

- create a passenger login account when a new passenger case is saved successfully
- use Django's built-in `User` model as the authentication account
- generate an initial password for newly created passenger accounts
- send the generated password to the passenger's email address
- persist a flag that requires a password change on first login
- link the created auth account to the passenger record
- preserve transactional case persistence behavior for database records

This delivery must not:

- implement frontend login screens or password-change UI
- add custom authentication flows beyond account creation support
- replace Django's built-in user model with a custom auth model
- send the initial password email before the case transaction commits

## Functional Requirements

### FR-1 Account Creation Trigger

- Account creation occurs only after the system successfully captures and stores the passenger case data.
- The trigger point is the existing backend case creation workflow that persists passenger, case, flight, disruption, document, and compensation records.
- If the case save fails, no passenger auth account may be created.

### FR-2 Authentication Model

- The backend must use Django's built-in `User` model for passenger login credentials.
- Each passenger record must be linkable to exactly one auth user.
- The passenger email address is the login identifier and must be stored on the auth user.
- Backend authentication must accept the passenger email address as the login credential, including when a reused account has a different stored username.

### FR-3 Initial Credential Generation

- When the system creates a new passenger auth user, it must generate a random initial password.
- The password must be stored using Django's normal password hashing behavior.
- The plaintext generated password is transient and may only be used for the outbound notification email.

### FR-4 First-Login Password Change Requirement

- The system must persist a backend flag indicating that the passenger must change their password on first login.
- The flag must be created together with the auth user linkage during successful case processing.
- The flag defaults to required for new passenger accounts created by this story.

### FR-5 Email Notification

- The system must send an email to the passenger after successful database commit.
- The email must contain the generated initial password and enough context to tell the passenger they can log in with their email address.
- The email must state that the password must be changed on first login.
- Email sending must not run before the transaction commits successfully.

### FR-6 Existing Email Reuse

- If the passenger email already belongs to an existing auth user, the system must reuse that user instead of creating a duplicate account.
- The system must still link the passenger to the existing auth user.
- In the existing-user case, the system must not generate or resend a new initial password as part of this story.

### FR-7 Transaction Safety

- Passenger, case, flight, document, disruption, compensation, auth linkage, and first-login flag records must be persisted atomically.
- If any database operation in the save flow fails, no partial case or auth records may remain.
- The outbound email side effect must be deferred until after a successful commit.

## Data Design

### Passenger

- Add a nullable relation from `Passenger` to Django's `User` model.
- Keep the existing passenger profile fields unchanged.
- The relation remains nullable for preexisting records until linked.
- Multiple passenger case-submission records may link to the same reused auth user so each case keeps its own passenger snapshot.

### Passenger Auth State

- Add a dedicated passenger auth state model keyed one-to-one to `User`.
- Store `must_change_password_on_first_login` as a boolean field.
- Initialize the flag to `True` for new auth users created through case submission.

### Django User

- Reuse Django's built-in auth table.
- Populate at minimum `username`, `email`, `first_name`, and `last_name` from the passenger data.
- Set a hashed password via Django's password APIs.
- Keep the user active by default.

## Workflow Design

### Successful New-Passenger Flow

1. Validate the incoming case submission as today.
2. Start the existing transactional case creation flow.
3. Create the `Passenger` and `Case` graph records.
4. Create a Django `User` for the passenger email.
5. Generate and set the initial password.
6. Link the passenger to the user.
7. Create the first-login password-change state with the required flag set to `True`.
8. Register the credential email using `transaction.on_commit`.
9. Commit the transaction.
10. Send the email after commit.

### Existing-User Flow

1. Resolve the passenger email during the transactional save flow.
2. If a Django `User` already exists for that email, reuse it.
3. Link the newly created passenger case snapshot to the existing user.
4. Preserve any existing password and existing first-login state.
5. Do not generate or send a new initial password email.

## Error Handling

- Validation failures remain unchanged and continue to return `400` responses.
- Database failures during account creation or linking must fail the whole case save and leave no partial database records.
- Email delivery is a post-commit side effect. A successful commit must not be rolled back by a later email send failure.
- Email send failures should surface through logging or exception handling boundaries already used by the backend, but they must not invalidate the committed case.

## API Impact

- The existing case creation request contract remains unchanged.
- The existing success response from the case creation endpoint remains compatible with current consumers.
- This story does not add login or password-change endpoints.

## Testing Strategy

- Extend case creation service or API tests to verify a new Django `User` is created for a new passenger email.
- Verify the passenger is linked to the auth user and the first-login password-change flag is persisted.
- Verify the generated password email is queued only after a successful commit.
- Verify an existing auth user is reused for repeated passenger email submissions and no replacement password email is sent.
- Verify rollback behavior when auth record creation fails inside the transaction.

## Acceptance Criteria Mapping

- "After the system successfully captures and records all relevant information for the new passenger case, including passenger details, flight details, and disruption details, a new user account is created for the passenger." -> FR-1, FR-2, FR-7
- "Upon storage of this information in the database, the system automatically generates a new password and sends it to the user's email." -> FR-3, FR-5, FR-7
- "The user can then log in using their email address and the newly generated password. This password needs to be changed on the first login." -> FR-2, FR-4, FR-5

## Open Decisions Resolved In This Spec

- Use Django's built-in `User` model instead of introducing a custom auth model.
- Keep Case_05 backend-only; frontend login and password-change UX are deferred.
- Reuse existing auth users by email instead of issuing duplicate passenger accounts.
- Preserve separate passenger records for repeated case submissions while linking them to the same reused auth user.
- Support email-address login through backend authentication configuration rather than rewriting existing usernames.