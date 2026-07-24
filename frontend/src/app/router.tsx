import { createBrowserRouter } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { ChangePasswordPage } from "../features/auth/components/ChangePasswordPage";
import { ColleagueHomePage } from "../features/auth/components/ColleagueHomePage";
import { LoginPage } from "../features/auth/components/LoginPage";
import { ProtectedRoute } from "../features/auth/components/ProtectedRoute";
import { getDefaultRoute } from "../features/auth/api";
import { useAuth } from "../features/auth/AuthProvider";
import { CaseEntryPage } from "../features/case-entry/components/CaseEntryPage";
import { CaseListPage } from "../features/case-list/components/CaseListPage";
import { NewUserPage } from "../features/user-list/components/NewUserPage";
import { UserListPage } from "../features/user-list/components/UserListPage";

function PublicPassengerRoute() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p role="status">Loading session...</p>
        </section>
      </main>
    );
  }

  if (!user || user.role === "Passenger") {
    return <CaseEntryPage />;
  }

  return <Navigate to={getDefaultRoute(user)} replace />;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <PublicPassengerRoute />,
  },
  {
    path: "/change-password",
    element: (
      <ProtectedRoute allow={() => true}>
        <ChangePasswordPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/colleague",
    element: (
      <ProtectedRoute allow={(user) => user.role === "Colleague"}>
        <ColleagueHomePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/cases",
    element: (
      <ProtectedRoute allow={(user) => user.role === "System Admin"}>
        <CaseListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/users",
    element: (
      <ProtectedRoute allow={(user) => user.role === "System Admin"}>
        <UserListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/users/new",
    element: (
      <ProtectedRoute allow={(user) => user.role === "System Admin"}>
        <NewUserPage />
      </ProtectedRoute>
    ),
  },
]);