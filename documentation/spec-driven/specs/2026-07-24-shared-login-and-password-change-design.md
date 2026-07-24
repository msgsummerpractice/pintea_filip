# Shared Login And Password Change Design Spec

## Document Control

- Date: 2026-07-24
- Epic: Authentication
- Story ID: AUTH_01
- Story Title: Shared Login And Forced Password Change
- Delivery Scope: Minimal shared login, session restoration, role-based redirects, and forced password change for authenticated users

## Purpose

Define the smallest authentication flow that allows passenger, colleague, and admin users to sign in through one shared login page, restore their session, reach the correct page for their role, and complete a forced password change when required.

## Scope Summary

This delivery must:

- provide one shared login page for all user types
- authenticate users with e-mail address and password using Django session auth
- restore the signed-in session on page refresh
- redirect each authenticated user directly to the correct page for their role
- force users with `must_change_password_on_first_login = true` to change their password before using the app
- allow authenticated users to change their password through a shared change-password page
- allow users to log out cleanly

This delivery must not:

- build separate login pages for passenger, colleague, and admin
- create a general-purpose profile area or landing page
- build a full colleague dashboard beyond a minimal placeholder page
- add token-based auth or OAuth flows
- implement password reset by e-mail

## Functional Requirements

### FR-1 Shared Login

- The frontend must provide a single login page for all users.
- The login form must accept e-mail address and password.
- The backend must authenticate against the existing Django auth system.
- Invalid credentials must return a stable authentication error.

### FR-2 Session Management

- Successful login must create a Django session.
- The frontend must be able to restore the current session on refresh through a session endpoint.
- Logout must terminate the current Django session.

### FR-3 Role Resolution

- The backend must classify the signed-in user as `Passenger`, `Colleague`, or `System Admin`.
- `System Admin` means `is_superuser = true`.
- `Colleague` means `is_staff = true` and `is_superuser = false`.
- `Passenger` means any remaining authenticated user.

### FR-4 Role-Based Redirects

- After successful login, `System Admin` users must be redirected to `/admin/users`.
- After successful login, `Colleague` users must be redirected to a minimal colleague placeholder page.
- After successful login, `Passenger` users must be redirected to `/`.
- The system must not introduce a shared landing page.

### FR-5 Forced Password Change

- If the signed-in user has `must_change_password_on_first_login = true`, the frontend must redirect the user to `/change-password` instead of their normal destination.
- Users with that flag must be blocked from using protected app routes until the password change succeeds.
- After a successful password change, the system must clear the forced-change flag.
- After a successful password change, the user must be redirected to the role-based destination that normally applies to them.

### FR-6 Password Change Validation

- The change-password form must require the current password, a new password, and a confirmation of the new password.
- The backend must reject incorrect current passwords.
- The backend must reject mismatched new-password confirmation.
- The backend must apply Django password validation rules to the new password.

### FR-7 Route Protection

- Admin-only routes must require an authenticated `System Admin` session.
- The colleague placeholder route must require an authenticated internal user session.
- The shared change-password route must require an authenticated session.
- Unauthenticated users opening protected routes must be redirected to `/login`.
- Authenticated users opening routes that do not match their role must be redirected to the correct role-based destination.

### FR-8 Minimal Pages

- The compensation page remains the passenger-facing page at `/`.
- The admin user list remains the admin-facing page at `/admin/users`.
- The colleague placeholder page may be a simple page that confirms the colleague is logged in.
- The login page and change-password page should remain intentionally simple.

## Data Design

### Django User

- Reuse Django's built-in `User` model.
- Continue to authenticate by e-mail through the existing auth backend.

### Auth State

- Reuse the existing `PassengerAuthState` model as the source of the first-login password-change flag.
- If no auth-state record exists for a user, treat `must_change_password_on_first_login` as `false` for session responses.

## API Design

### `POST /api/auth/login/`

- Accept JSON with `email` and `password`.
- Authenticate the user and create a Django session.
- Return the current user identity, derived role, and `mustChangePasswordOnFirstLogin` flag.

Example response:

```json
{
  "id": 17,
  "email": "colleague@example.com",
  "name": "Cora Colleague",
  "role": "Colleague",
  "mustChangePasswordOnFirstLogin": true
}
```

### `GET /api/auth/session/`

- Return the same session payload when the user is authenticated.
- Return `401` when no authenticated session exists.

### `POST /api/auth/logout/`

- Terminate the current session.
- Return `204 No Content`.

### `POST /api/auth/change-password/`

- Require an authenticated session.
- Accept JSON with `currentPassword`, `newPassword`, and `confirmNewPassword`.
- Validate the current password and the new password rules.
- Update the password and clear the forced-change flag.
- Return the refreshed session payload with `mustChangePasswordOnFirstLogin = false`.

## Workflow Design

### Successful Login Flow

1. The user opens `/login`.
2. The user enters e-mail and password.
3. The frontend calls `POST /api/auth/login/`.
4. The backend authenticates the user and starts a Django session.
5. The backend returns the role and forced-password-change state.
6. If the flag is `true`, the frontend redirects to `/change-password`.
7. Otherwise, the frontend redirects directly to the role-based destination.

### Forced Password Change Flow

1. The authenticated user is redirected to `/change-password`.
2. The user submits current password, new password, and confirmation.
3. The backend validates the request and updates the password.
4. The backend clears `must_change_password_on_first_login`.
5. The frontend redirects the user to their normal role-based destination.

### Session Restore Flow

1. The frontend starts or refreshes.
2. The app calls `GET /api/auth/session/`.
3. If a session exists, the frontend restores auth state and enforces the forced-change rule.
4. If no session exists, protected routes redirect to `/login`.

## Frontend Behavior

- The login page should be simple and form-based.
- The change-password page should be simple and form-based.
- The colleague placeholder page may contain only a short confirmation message and a logout action.
- The app should maintain a small client-side auth state derived from the session endpoint and login responses.
- The admin user-list page may remain the current page but should become reachable through authenticated routing rather than unauthenticated probing.

## Error Handling

- Invalid credentials should show a stable login error message.
- Unauthorized session and route access should redirect to `/login`.
- Wrong-role access should redirect to the route appropriate for the authenticated user.
- Password change validation errors should render inline on the form.
- Password change failures must not clear the forced-change flag.

## Testing Strategy

- Add backend tests for successful login as passenger, colleague, and admin.
- Verify invalid credentials return `401`.
- Verify the session endpoint returns the authenticated user payload and `401` otherwise.
- Verify logout clears the session.
- Verify forced-password-change users are reported correctly by the login and session endpoints.
- Verify successful password change clears the forced-change flag.
- Verify incorrect current password and invalid new password return field errors.
- Add frontend tests for login success and role-based redirect.
- Verify forced redirect to `/change-password` when the flag is present.
- Verify successful password change redirects to the correct destination.
- Verify protected route guards redirect unauthenticated users to `/login`.

## Acceptance Criteria Mapping

- "Shared login page for passenger, colleague, and admin" -> FR-1, FR-2
- "Keep passenger experience on the compensation page and admin on the user list" -> FR-4, FR-8
- "Allow logged-in users to change password" -> FR-5, FR-6
- "Force first-login password change when required" -> FR-5, Workflow Design

## Open Decisions Resolved In This Spec

- The system uses one shared login page, not separate login flows.
- There is no shared landing page after login.
- Passengers go to `/`, admins go to `/admin/users`, and colleagues go to a minimal placeholder page.
- Forced password change blocks protected usage until completed.
- Session auth is preferred over token auth to keep implementation small and aligned with the current Django setup.