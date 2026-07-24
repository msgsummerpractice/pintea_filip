# Create Colleague User Account Implementation Plan

> **Execution:** Use subagent-driven development to implement this plan task-by-task.

**Goal:** Add an admin-only backend and frontend flow that lets a System Admin create colleague accounts, persist first-login password-change state, send initial credentials by email after commit, and show a success confirmation in the UI.

**Architecture:** Extend the existing admin user surface rather than introducing a separate admin module. On the backend, add a focused account-provisioning service plus a POST API endpoint beside the existing user-list endpoint; on the frontend, add a sibling admin page and API client next to the current user-list feature. Reuse Django's built-in `User` model and the existing `PassengerAuthState` record as the shared auth-state marker for forced password change.

**Tech Stack:** Django 5, Django REST Framework, django.contrib.auth, django.core.mail, pytest, React 19, React Router, Vitest, Testing Library, TypeScript

**Design Spec:** `documentation/spec-driven/specs/2026-07-24-create-colleague-user-account-design.md`

---

## Planned File Structure

### Backend

- Modify: `backend/apps/cases/api/serializers.py`
- Modify: `backend/apps/cases/api/views.py`
- Modify: `backend/apps/cases/api/urls.py`
- Create: `backend/apps/cases/services/colleague_accounts.py`
- Modify: `backend/tests/test_user_list_api.py`

### Frontend

- Create: `frontend/src/features/user-list/createUserApi.ts`
- Create: `frontend/src/features/user-list/components/NewUserPage.tsx`
- Create: `frontend/src/features/user-list/__tests__/createUserApi.test.ts`
- Create: `frontend/src/features/user-list/__tests__/NewUserPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/styles/global.css`

## Task Breakdown

### Task 1: Add Backend Validation and Colleague Account Provisioning Service

**Files:**
- Modify: `backend/apps/cases/api/serializers.py`
- Create: `backend/apps/cases/services/colleague_accounts.py`

**Requirements:**
- Define a request serializer for `firstName`, `lastName`, `email`, and `initialPassword`.
- Trim first and last names and reject blank values after trimming.
- Normalize the submitted email and reject duplicates with a field-level validation error.
- Create a colleague `User` with `username=email`, `is_staff=True`, `is_superuser=False`, and a hashed password.
- Create or confirm a `PassengerAuthState` row with `must_change_password_on_first_login=True`.
- Queue the credential email with `transaction.on_commit` so email sending happens only after commit.

**Implementation:**

```python
from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from rest_framework import serializers

from apps.cases.models import PassengerAuthState


class CreateColleagueUserRequestSerializer(serializers.Serializer):
    firstName = serializers.CharField(max_length=150)
    lastName = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)
    initialPassword = serializers.CharField(max_length=128)

    def validate_firstName(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("This field may not be blank.")
        return normalized

    def validate_lastName(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("This field may not be blank.")
        return normalized

    def validate_email(self, value: str) -> str:
        user_model = get_user_model()
        normalized = user_model.objects.normalize_email(value)
        if user_model.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("A user with this e-mail already exists.")
        return normalized
```

```python
@dataclass(slots=True)
class ColleagueAccountResult:
    user: object


def send_colleague_credentials_email(*, email: str, raw_password: str) -> None:
    send_mail(
        subject="Your AirAssist colleague account",
        message=(
            f"You can log in with {email}.\n"
            f"Temporary password: {raw_password}\n"
            "You must change this password on first login."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
    )


def create_colleague_account(*, first_name: str, last_name: str, email: str, initial_password: str) -> ColleagueAccountResult:
    user_model = get_user_model()

    with transaction.atomic():
        user = user_model.objects.create_user(
            username=email,
            email=email,
            password=initial_password,
            first_name=first_name,
            last_name=last_name,
            is_staff=True,
            is_superuser=False,
            is_active=True,
        )
        PassengerAuthState.objects.update_or_create(
            user=user,
            defaults={"must_change_password_on_first_login": True},
        )
        transaction.on_commit(
            lambda: send_colleague_credentials_email(email=user.email, raw_password=initial_password)
        )

    return ColleagueAccountResult(user=user)
```

**Testing:**

```python
serializer = CreateColleagueUserRequestSerializer(
    data={
        "firstName": "  Ada  ",
        "lastName": "  Admin  ",
        "email": "COLLEAGUE@example.com",
        "initialPassword": "Start123!",
    }
)
assert serializer.is_valid()
assert serializer.validated_data["firstName"] == "Ada"
assert serializer.validated_data["lastName"] == "Admin"
assert serializer.validated_data["email"] == "COLLEAGUE@example.com"
```

```python
result = create_colleague_account(
    first_name="Ada",
    last_name="Admin",
    email="colleague@example.com",
    initial_password="Start123!",
)
assert result.user.is_staff is True
assert result.user.is_superuser is False
assert result.user.check_password("Start123!")
assert PassengerAuthState.objects.get(user=result.user).must_change_password_on_first_login is True
```

**Verification:**
- Run `cd backend && ./.venv/Scripts/python.exe manage.py check --settings=config.test_settings`.

### Task 2: Add the Admin-Only Create-User API Endpoint and Backend Tests

**Files:**
- Modify: `backend/apps/cases/api/views.py`
- Modify: `backend/apps/cases/api/urls.py`
- Modify: `backend/tests/test_user_list_api.py`

**Requirements:**
- Add an admin-only POST endpoint for colleague account creation.
- Keep the existing GET `/api/users/` user list behavior unchanged.
- Return `201` with `id`, `email`, `role`, and confirmation `message` on success.
- Return `400` field errors for duplicate emails and invalid payloads.
- Return `403` for authenticated non-admins.
- Confirm email sending and auth-state persistence through API tests.

**Implementation:**

```python
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.api.serializers import CreateColleagueUserRequestSerializer
from apps.cases.services.colleague_accounts import create_colleague_account


class AdminUserCreateView(APIView):
    permission_classes = [IsSystemAdminUser]

    def post(self, request) -> Response:
        serializer = CreateColleagueUserRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = create_colleague_account(
            first_name=serializer.validated_data["firstName"],
            last_name=serializer.validated_data["lastName"],
            email=serializer.validated_data["email"],
            initial_password=serializer.validated_data["initialPassword"],
        )

        return Response(
            {
                "id": result.user.id,
                "email": result.user.email,
                "role": "Colleague",
                "message": "User account created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )
```

```python
urlpatterns = [
    path("users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("users/create/", AdminUserCreateView.as_view(), name="admin-user-create"),
]
```

**Testing:**

```python
@pytest.mark.django_db(transaction=True)
def test_admin_can_create_colleague_user(admin_client, mailoutbox):
    response = admin_client.post(
        "/api/users/create/",
        data={
            "firstName": "Cora",
            "lastName": "Colleague",
            "email": "colleague@example.com",
            "initialPassword": "Start123!",
        },
        format="json",
    )

    user = get_user_model().objects.get(email="colleague@example.com")
    assert response.status_code == 201
    assert response.json()["message"] == "User account created successfully."
    assert user.username == "colleague@example.com"
    assert user.is_staff is True
    assert user.is_superuser is False
    assert user.check_password("Start123!")
    assert PassengerAuthState.objects.get(user=user).must_change_password_on_first_login is True
    assert mailoutbox[0].to == ["colleague@example.com"]
```

```python
@pytest.mark.django_db
def test_duplicate_email_is_rejected(admin_client):
    get_user_model().objects.create_user(
        username="existing@example.com",
        email="existing@example.com",
        password="secret",
    )

    response = admin_client.post(
        "/api/users/create/",
        data={
            "firstName": "Ada",
            "lastName": "Admin",
            "email": "existing@example.com",
            "initialPassword": "Start123!",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"email": ["A user with this e-mail already exists."]}
```

```python
@pytest.mark.django_db
def test_non_admin_cannot_create_colleague_user():
    user = create_passenger_user("viewer@example.com")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/users/create/",
        data={
            "firstName": "Cora",
            "lastName": "Colleague",
            "email": "colleague@example.com",
            "initialPassword": "Start123!",
        },
        format="json",
    )

    assert response.status_code == 403
```

**Verification:**
- Run `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_user_list_api.py -q`.

### Task 3: Add the Frontend Create-User API Client and Admin Route

**Files:**
- Create: `frontend/src/features/user-list/createUserApi.ts`
- Modify: `frontend/src/app/router.tsx`
- Create: `frontend/src/features/user-list/__tests__/createUserApi.test.ts`

**Requirements:**
- Add a dedicated frontend API client for the create-user endpoint.
- Convert backend validation responses into field-keyed frontend errors.
- Add a route for the New User page in the existing admin area.
- Preserve the current `/admin/users` route behavior.

**Implementation:**

```ts
import { HttpError, buildApiUrl, requestJson } from "../../lib/http";

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  initialPassword: string;
}

export interface CreateUserResult {
  id: number;
  email: string;
  role: "Colleague";
  message: string;
}

export interface CreateUserError {
  message: string;
  validationErrors: Record<string, string[]>;
}

export function normalizeCreateUserError(error: unknown): CreateUserError {
  if (error instanceof HttpError && typeof error.body === "object" && error.body !== null) {
    const body = error.body as Record<string, unknown>;
    const validationErrors = Object.fromEntries(
      Object.entries(body).filter(([, value]) => Array.isArray(value)),
    ) as Record<string, string[]>;

    return {
      message: error.message,
      validationErrors,
    };
  }

  return {
    message: "Unable to create the user right now.",
    validationErrors: {},
  };
}

export async function createUserAccount(input: CreateUserInput): Promise<CreateUserResult> {
  return requestJson<CreateUserResult>("/users/create/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
}
```

```ts
import { NewUserPage } from "../features/user-list/components/NewUserPage";

export const router = createBrowserRouter([
  { path: "/", element: <CaseEntryPage /> },
  { path: "/admin/users", element: <UserListPage /> },
  { path: "/admin/users/new", element: <NewUserPage /> },
]);
```

**Testing:**

```ts
test("posts the colleague account payload", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 7,
        email: "colleague@example.com",
        role: "Colleague",
        message: "User account created successfully.",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    ),
  );

  await expect(
    createUserAccount({
      firstName: "Cora",
      lastName: "Colleague",
      email: "colleague@example.com",
      initialPassword: "Start123!",
    }),
  ).resolves.toMatchObject({ role: "Colleague" });

  expect(fetchSpy).toHaveBeenCalledWith(
    buildApiUrl("/users/create/"),
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
});
```

**Verification:**
- Run `cd frontend && npm run test -- --run src/features/user-list/__tests__/createUserApi.test.ts`.

### Task 4: Build the New User Page, Success State, and Frontend Tests

**Files:**
- Create: `frontend/src/features/user-list/components/NewUserPage.tsx`
- Create: `frontend/src/features/user-list/__tests__/NewUserPage.test.tsx`
- Modify: `frontend/src/app/styles/global.css`

**Requirements:**
- Render a New User form with first name, last name, e-mail, and initial password fields.
- Disable the submit button while the request is pending.
- Show inline field errors for backend validation failures.
- Show a stable access-denied message for `401/403` failures.
- Show a success confirmation message after a successful create operation.
- Keep entered values on unexpected errors.
- Style the page consistently with the existing admin pages.

**Implementation:**

```tsx
import { FormEvent, useState } from "react";

import { HttpError } from "../../../lib/http";
import { createUserAccount, normalizeCreateUserError } from "../createUserApi";


const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  initialPassword: "",
};


export function NewUserPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationErrors({});

    try {
      const result = await createUserAccount(form);
      setSuccessMessage(result.message);
      setForm(EMPTY_FORM);
    } catch (reason) {
      if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
        setErrorMessage("You do not have access to create users.");
      } else {
        const normalized = normalizeCreateUserError(reason);
        setErrorMessage(normalized.message);
        setValidationErrors(normalized.validationErrors);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="user-list-page">
      <section className="user-list-frame" aria-labelledby="new-user-title">
        <header className="user-list-header">
          <p className="eyebrow">System administration</p>
          <h1 id="new-user-title">New User</h1>
          <p>Create a colleague account and send the initial password by email.</p>
        </header>
        <div className="user-list-content">
          {successMessage ? <div className="notice-banner notice-banner-success">{successMessage}</div> : null}
          {errorMessage ? <div className="notice-banner notice-banner-error">{errorMessage}</div> : null}
          <form className="user-create-form form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>First Name</span>
              <input className="text-input" value={form.firstName} />
              {validationErrors.firstName ? <p className="field-error">{validationErrors.firstName[0]}</p> : null}
            </label>
          </form>
        </div>
      </section>
    </main>
  );
}
```

```css
.user-create-form {
  align-items: start;
}

.user-create-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  grid-column: 1 / -1;
}

.user-create-form .text-input[type="password"] {
  letter-spacing: 0.04em;
}
```

**Testing:**

```ts
test("renders the new user route", () => {
  const router = createMemoryRouter(appRouter.routes, {
    initialEntries: ["/admin/users/new"],
  });

  render(<RouterProvider router={router} />);

  expect(screen.getByRole("heading", { name: /new user/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument();
});
```

```ts
test("shows a success confirmation after submit", async () => {
  vi.spyOn(api, "createUserAccount").mockResolvedValue({
    id: 11,
    email: "colleague@example.com",
    role: "Colleague",
    message: "User account created successfully.",
  });

  render(<NewUserPage />);
  await userEvent.type(screen.getByLabelText(/first name/i), "Cora");
  await userEvent.type(screen.getByLabelText(/last name/i), "Colleague");
  await userEvent.type(screen.getByLabelText(/e-mail/i), "colleague@example.com");
  await userEvent.type(screen.getByLabelText(/initial password/i), "Start123!");
  await userEvent.click(screen.getByRole("button", { name: /create user/i }));

  expect(await screen.findByText(/user account created successfully/i)).toBeInTheDocument();
});
```

```ts
test("shows inline validation errors from the backend", async () => {
  vi.spyOn(api, "createUserAccount").mockRejectedValue(
    new HttpError(400, "Request failed with status 400.", {
      email: ["A user with this e-mail already exists."],
    }),
  );

  render(<NewUserPage />);
  await userEvent.type(screen.getByLabelText(/e-mail/i), "existing@example.com");
  await userEvent.click(screen.getByRole("button", { name: /create user/i }));

  expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
});
```

**Verification:**
- Run `cd frontend && npm run test -- --run src/features/user-list/__tests__/NewUserPage.test.tsx`.
- Run `cd frontend && npm run build`.

## Self-Review Coverage

- FR-1 and FR-8 access/failure rules are implemented by Task 2 backend permissions and forbidden-response tests plus Task 4 access-denied UI handling.
- FR-2 and FR-7 frontend view and confirmation behavior are implemented by Tasks 3 and 4.
- FR-3 validation rules are implemented by Task 1 serializer rules and Task 2 duplicate-email tests.
- FR-4, FR-5, and FR-6 account creation, role metadata, auth-state persistence, and post-commit email behavior are implemented by Tasks 1 and 2.