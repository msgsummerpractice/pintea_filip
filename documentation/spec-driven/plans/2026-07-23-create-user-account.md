# Create User Account Implementation Plan

> **Execution:** Use subagent-driven development to implement this plan task-by-task.

**Goal:** Extend the backend case-save workflow so a successful new passenger case also provisions or links a Django auth account, requires first-login password change, and sends initial credentials after commit.

**Architecture:** Keep the implementation centered on the existing Django case creation service. Add a small auth-link model layer in the cases app, create or reuse Django built-in `User` records inside the existing transaction, and defer credential email delivery with `transaction.on_commit` so database integrity and side effects remain separated.

**Tech Stack:** Django 5, Django REST Framework, django.contrib.auth, django.core.mail, pytest

**Design Spec:** `documentation/spec-driven/specs/2026-07-23-create-user-account-design.md`

---

## Planned File Structure

### Backend

- Create: `backend/apps/cases/auth_backends.py`
- Modify: `backend/apps/cases/models.py`
- Modify: `backend/apps/cases/services/case_creation.py`
- Create: `backend/apps/cases/services/passenger_accounts.py`
- Create: `backend/apps/cases/migrations/0005_passenger_user_account_and_auth_state.py`
- Modify: `backend/config/settings.py`
- Modify: `backend/config/test_settings.py`
- Modify: `backend/tests/test_case_models.py`
- Modify: `backend/tests/test_case_creation_api.py`

## Task Breakdown

### Task 1: Add Passenger Auth Linkage Models

**Files:**
- Modify: `backend/apps/cases/models.py`
- Create: `backend/apps/cases/migrations/0005_passenger_user_account_and_auth_state.py`
- Modify: `backend/tests/test_case_models.py`

**Requirements:**
- Add a nullable relation from `Passenger` to Django's built-in `User` model.
- Add a dedicated auth state model that stores `must_change_password_on_first_login` per user.
- Preserve the existing passenger and case domain model behavior.

**Implementation:**

```python
from django.conf import settings


class Passenger(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="passengers",
    )
    first_name = models.CharField(max_length=100)
    ...


class PassengerAuthState(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="passenger_auth_state",
    )
    must_change_password_on_first_login = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Testing:**

```python
@pytest.mark.django_db
def test_passenger_can_link_to_auth_user() -> None:
    user = User.objects.create_user(username="ada@example.com", email="ada@example.com", password="secret")
    passenger = Passenger.objects.create(..., user=user)

    assert passenger.user_id == user.id


@pytest.mark.django_db
def test_passenger_auth_state_defaults_to_forced_password_change(user: User) -> None:
    state = PassengerAuthState.objects.create(user=user)

    assert state.must_change_password_on_first_login is True
```

**Verification:**
- Run `cd backend && ./.venv/Scripts/python.exe manage.py makemigrations --check`.
- Run `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_case_models.py -q`.

### Task 2: Provision or Reuse Passenger Accounts During Case Save

**Files:**
- Create: `backend/apps/cases/auth_backends.py`
- Modify: `backend/apps/cases/services/case_creation.py`
- Create: `backend/apps/cases/services/passenger_accounts.py`
- Modify: `backend/tests/test_case_creation_api.py`

**Requirements:**
- Create a Django `User` for first-time passenger emails during successful case save.
- Reuse an existing `User` when the passenger email already exists.
- Generate a random initial password only for newly created users.
- Persist the first-login password-change state for new users.
- Queue the credential email with `transaction.on_commit` so it runs only after commit.
- Keep the whole database save path atomic.
- Allow authentication by email address without rewriting reused usernames.
- Preserve separate passenger case snapshots when repeated submissions reuse the same auth user.

**Implementation:**

```python
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.utils.crypto import get_random_string
from django.db import transaction


@dataclass
class PassengerAccountResult:
    user: User
    created: bool


def provision_passenger_account(*, passenger: Passenger) -> PassengerAccountResult:
    user_model = get_user_model()
    normalized_email = user_model.objects.normalize_email(passenger.email)
    matching_users = list(user_model.objects.filter(email=normalized_email))
    ...

    if created:
        raw_password = get_random_string(20)
        user = user_model.objects.create_user(
            username=normalized_email,
            email=normalized_email,
            password=raw_password,
            first_name=passenger.first_name,
            last_name=passenger.last_name,
        )
        PassengerAuthState.objects.create(user=user, must_change_password_on_first_login=True)
        transaction.on_commit(lambda: send_initial_password_email(email=user.email, raw_password=raw_password))

    passenger.user = user
    passenger.email = normalized_email
    passenger.save(update_fields=["user", "email"])
    return PassengerAccountResult(user=user, created=created)
```

```python
class EmailOrUsernameModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        ...
```

```python
with transaction.atomic():
    passenger = Passenger.objects.create(...)
    case = Case.objects.create(...)
    ...
    provision_passenger_account(passenger=passenger)
```

**Testing:**

```python
@pytest.mark.django_db(transaction=True)
def test_case_create_api_creates_passenger_auth_user_and_sends_credentials(mailoutbox, tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path

    response = APIClient().post("/api/cases/", data={...}, format="multipart")

    passenger = Passenger.objects.get()
    user = User.objects.get(username="ada@example.com")
    auth_state = PassengerAuthState.objects.get(user=user)

    assert response.status_code == 201
    assert passenger.user_id == user.id
    assert user.check_password(extracted_password_from_mail(mailoutbox[0].body))
    assert authenticate(username="ada@example.com", password=extracted_password_from_mail(mailoutbox[0].body)).pk == user.pk
    assert auth_state.must_change_password_on_first_login is True
    assert mailoutbox[0].to == ["ada@example.com"]


@pytest.mark.django_db(transaction=True)
def test_case_create_api_reuses_existing_auth_user_without_resending_password(mailoutbox, tmp_path, settings):
    existing_user = User.objects.create_user(username="existing-ada", email="ada@example.com", password="known-secret")
    settings.MEDIA_ROOT = tmp_path

    response = APIClient().post("/api/cases/", data={...}, format="multipart")

    passenger = Passenger.objects.get()
    assert response.status_code == 201
    assert passenger.user_id == existing_user.id
    assert len(mailoutbox) == 0
    assert authenticate(username="ada@example.com", password="known-secret").pk == existing_user.pk


@pytest.mark.django_db
def test_case_create_api_rolls_back_when_account_provisioning_fails(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path

    with patch("apps.cases.services.passenger_accounts.get_user_model", side_effect=DatabaseError()):
        response = APIClient().post("/api/cases/", data={...}, format="multipart")

    assert response.status_code == 500
    assert Case.objects.count() == 0
    assert Passenger.objects.count() == 0
```

**Verification:**
- Run `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_case_creation_api.py -q`.

### Task 3: Add Deterministic Email Settings and Full-Flow Validation

**Files:**
- Modify: `backend/config/settings.py`
- Modify: `backend/config/test_settings.py`
- Modify: `backend/tests/test_case_creation_api.py`

**Requirements:**
- Provide a default sender address for credential emails.
- Ensure the test environment uses Django's in-memory email backend.
- Enable authentication by email address.
- Validate the end-to-end case-create flow still returns the existing success payload while adding account automation coverage.

**Implementation:**

```python
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@airassist.local") or "noreply@airassist.local"
AUTHENTICATION_BACKENDS = ["apps.cases.auth_backends.EmailOrUsernameModelBackend"]
```

```python
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
DEFAULT_FROM_EMAIL = "tests@airassist.local"
```

```python
assert response.json()["caseId"].startswith("CASE-")
assert response.json()["status"] == CaseStatus.NEW
assert response.json()["compensation"]["compensation_eur"] == 400
assert len(mailoutbox) == 1
assert "must change this password on first login" in mailoutbox[0].body.lower()
```

**Verification:**
- Run `cd backend && ./.venv/Scripts/python.exe manage.py check --settings=config.test_settings`.
- Run `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_case_models.py tests/test_case_creation_api.py -q`.
