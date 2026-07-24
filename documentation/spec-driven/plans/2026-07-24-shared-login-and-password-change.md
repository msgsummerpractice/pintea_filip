# Shared Login And Password Change Implementation Plan

> **Execution:** Use subagent-driven development to implement this plan task-by-task.

**Goal:** Add a minimal shared login flow with Django session auth, role-based redirects, a forced first-login password change, and simple protected pages for passenger, colleague, and admin users.

**Architecture:** Extend the existing Django API with a small auth surface (`login`, `session`, `logout`, `change-password`) and keep the frontend stateful through one shared auth context backed by the session endpoint. Reuse the existing `PassengerAuthState` model for forced password change and route users directly to `/`, `/admin/users`, or a minimal colleague page without adding a general landing page.

**Tech Stack:** Django 5, Django REST Framework, django.contrib.auth, React 19, React Router, TypeScript, Vitest, Testing Library

**Design Spec:** `documentation/spec-driven/specs/2026-07-24-shared-login-and-password-change-design.md`

---

## Planned File Structure

### Backend

- Modify: `backend/apps/cases/api/serializers.py`
- Modify: `backend/apps/cases/api/views.py`
- Modify: `backend/apps/cases/api/urls.py`
- Modify: `backend/tests/test_user_list_api.py`
- Create: `backend/tests/test_auth_api.py`

### Frontend

- Create: `frontend/src/features/auth/api.ts`
- Create: `frontend/src/features/auth/types.ts`
- Create: `frontend/src/features/auth/AuthProvider.tsx`
- Create: `frontend/src/features/auth/components/LoginPage.tsx`
- Create: `frontend/src/features/auth/components/ChangePasswordPage.tsx`
- Create: `frontend/src/features/auth/components/ColleagueHomePage.tsx`
- Create: `frontend/src/features/auth/components/ProtectedRoute.tsx`
- Create: `frontend/src/features/auth/__tests__/api.test.ts`
- Create: `frontend/src/features/auth/__tests__/AuthProvider.test.tsx`
- Create: `frontend/src/features/auth/__tests__/LoginPage.test.tsx`
- Create: `frontend/src/features/auth/__tests__/ChangePasswordPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/app/styles/global.css`
- Modify: `frontend/src/features/user-list/components/UserListPage.tsx`

## Task Breakdown

### Task 1: Add Session Auth And Password-Change Backend APIs

**Files:**
- Modify: `backend/apps/cases/api/serializers.py`
- Modify: `backend/apps/cases/api/views.py`
- Modify: `backend/apps/cases/api/urls.py`
- Create: `backend/tests/test_auth_api.py`

**Requirements:**
- Add `POST /api/auth/login/`, `GET /api/auth/session/`, `POST /api/auth/logout/`, and `POST /api/auth/change-password/`.
- Authenticate by e-mail and password using the existing Django auth backend.
- Return the current user payload with `role` and `mustChangePasswordOnFirstLogin`.
- Require authentication for session, logout, and change-password.
- Validate current password, new password confirmation, and Django password rules.
- Clear `PassengerAuthState.must_change_password_on_first_login` after successful password change.

**Implementation:**

```python
class LoginRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128)


class SessionUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    name = serializers.CharField()
    role = serializers.CharField()
    mustChangePasswordOnFirstLogin = serializers.BooleanField()


class ChangePasswordRequestSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(max_length=128)
    newPassword = serializers.CharField(max_length=128)
    confirmNewPassword = serializers.CharField(max_length=128)

    def validate(self, attrs):
        if attrs["newPassword"] != attrs["confirmNewPassword"]:
            raise serializers.ValidationError({"confirmNewPassword": ["Passwords do not match."]})
        validate_password(attrs["newPassword"], user=self.context["request"].user)
        return attrs
```

```python
def serialize_session_user(user) -> dict[str, object]:
    role = "System Admin" if user.is_superuser else "Colleague" if user.is_staff else "Passenger"
    auth_state = getattr(user, "passenger_auth_state", None)
    return {
        "id": user.id,
        "email": user.email,
        "name": f"{user.first_name.strip()} {user.last_name.strip()}".strip() or user.email,
        "role": role,
        "mustChangePasswordOnFirstLogin": bool(auth_state and auth_state.must_change_password_on_first_login),
    }
```

```python
class LoginView(APIView):
    def post(self, request) -> Response:
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request=request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response({"detail": "Invalid e-mail or password."}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        return Response(serialize_session_user(user), status=status.HTTP_200_OK)
```

```python
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        serializer = ChangePasswordRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["currentPassword"]):
            return Response({"currentPassword": ["Current password is incorrect."]}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(serializer.validated_data["newPassword"])
        request.user.save(update_fields=["password"])
        PassengerAuthState.objects.update_or_create(
            user=request.user,
            defaults={"must_change_password_on_first_login": False},
        )
        update_session_auth_hash(request, request.user)
        return Response(serialize_session_user(request.user), status=status.HTTP_200_OK)
```

**Testing:**

```python
@pytest.mark.django_db
def test_login_returns_session_payload_for_admin(client):
    user = get_user_model().objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="StrongPass123!",
        is_staff=True,
        is_superuser=True,
    )

    response = client.post("/api/auth/login/", {"email": user.email, "password": "StrongPass123!"}, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["role"] == "System Admin"
```

```python
@pytest.mark.django_db
def test_change_password_clears_forced_flag(client, user):
    PassengerAuthState.objects.create(user=user, must_change_password_on_first_login=True)
    client.force_login(user)

    response = client.post(
        "/api/auth/change-password/",
        {"currentPassword": "StrongPass123!", "newPassword": "EvenStronger123!", "confirmNewPassword": "EvenStronger123!"},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert PassengerAuthState.objects.get(user=user).must_change_password_on_first_login is False
```

**Verification:**
- Run `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_auth_api.py -q`.

### Task 2: Add Shared Frontend Auth State, Login Page, And Protected Routing

**Files:**
- Create: `frontend/src/features/auth/api.ts`
- Create: `frontend/src/features/auth/types.ts`
- Create: `frontend/src/features/auth/AuthProvider.tsx`
- Create: `frontend/src/features/auth/components/LoginPage.tsx`
- Create: `frontend/src/features/auth/components/ColleagueHomePage.tsx`
- Create: `frontend/src/features/auth/components/ProtectedRoute.tsx`
- Create: `frontend/src/features/auth/__tests__/api.test.ts`
- Create: `frontend/src/features/auth/__tests__/AuthProvider.test.tsx`
- Create: `frontend/src/features/auth/__tests__/LoginPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/features/user-list/components/UserListPage.tsx`

**Requirements:**
- Add one shared login page at `/login`.
- Restore session state from `GET /api/auth/session/` on app start.
- Redirect authenticated users to `/`, `/admin/users`, or a colleague placeholder page by role.
- Protect admin and colleague routes.
- Add a logout action for authenticated internal pages.

**Implementation:**

```ts
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "Passenger" | "Colleague" | "System Admin";
  mustChangePasswordOnFirstLogin: boolean;
}

export async function login(payload: { email: string; password: string }) {
  return requestJson<SessionUser>("/auth/login/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

```tsx
const AuthContext = createContext<...>(...);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSession().then(setUser).catch(() => setUser(null)).finally(() => setIsLoading(false));
  }, []);

  return <AuthContext.Provider value={{ user, setUser, isLoading }}>{children}</AuthContext.Provider>;
}
```

```tsx
export function ProtectedRoute({ allow, children }: { allow: ... }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">Loading session...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePasswordOnFirstLogin && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  if (!allow(user)) return <Navigate to={getDefaultRoute(user)} replace />;
  return children;
}
```

```tsx
export function LoginPage() {
  const navigate = useNavigate();
  const { setUser, user } = useAuth();
  if (user) return <Navigate to={getDefaultRoute(user)} replace />;
  // submit form -> login() -> setUser(result) -> navigate(mustChange ? "/change-password" : getDefaultRoute(result))
}
```

**Testing:**

```ts
test("login redirects admin users to /admin/users", async () => {
  vi.spyOn(api, "login").mockResolvedValue({
    id: 1,
    email: "admin@example.com",
    name: "Ada Admin",
    role: "System Admin",
    mustChangePasswordOnFirstLogin: false,
  });
  // render /login and submit
});
```

```ts
test("protected admin route redirects unauthenticated users to /login", async () => {
  // render route with user = null and expect login page
});
```

**Verification:**
- Run `cd frontend && npm run test -- --run src/features/auth/__tests__/api.test.ts src/features/auth/__tests__/AuthProvider.test.tsx src/features/auth/__tests__/LoginPage.test.tsx`.

### Task 3: Add Shared Change-Password Page And Forced-Change Route Enforcement

**Files:**
- Create: `frontend/src/features/auth/components/ChangePasswordPage.tsx`
- Create: `frontend/src/features/auth/__tests__/ChangePasswordPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/styles/global.css`

**Requirements:**
- Add `/change-password` with current password, new password, and confirmation.
- Force users with the first-login flag to this page before protected routes.
- After success, update auth state and redirect to the role-based destination.
- Keep the page simple.

**Implementation:**

```tsx
export function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  // submit -> changePassword() -> setUser(result) -> navigate(getDefaultRoute(result))
}
```

```tsx
export const router = createBrowserRouter([
  { path: "/", element: <CaseEntryPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/change-password", element: <ProtectedRoute allow={() => true}><ChangePasswordPage /></ProtectedRoute> },
  { path: "/colleague", element: <ProtectedRoute allow={(user) => user.role === "Colleague" || user.role === "System Admin"}><ColleagueHomePage /></ProtectedRoute> },
  { path: "/admin/users", element: <ProtectedRoute allow={(user) => user.role === "System Admin"}><UserListPage /></ProtectedRoute> },
  { path: "/admin/users/new", element: <ProtectedRoute allow={(user) => user.role === "System Admin"}><NewUserPage /></ProtectedRoute> },
]);
```

**Testing:**

```ts
test("forced-change users are redirected to /change-password", async () => {
  // seed auth provider with mustChangePasswordOnFirstLogin true and open protected route
});
```

```ts
test("successful password change redirects to passenger home", async () => {
  // changePassword mock returns mustChangePasswordOnFirstLogin false and role Passenger
});
```

**Verification:**
- Run `cd frontend && npm run test -- --run src/features/auth/__tests__/ChangePasswordPage.test.tsx`.
- Run `cd frontend && npm run build`.

## Self-Review Coverage

- FR-1 through FR-3 are implemented by Task 1 auth endpoints and Task 2 shared login/session state.
- FR-4 and FR-7 are implemented by Task 2 protected routing and Task 3 route enforcement.
- FR-5 and FR-6 are implemented by Task 1 password-change endpoint and Task 3 forced-change UI flow.
- FR-8 is implemented by keeping `/` as the compensation page, `/admin/users` as the admin page, and adding only a minimal colleague placeholder plus simple auth pages.