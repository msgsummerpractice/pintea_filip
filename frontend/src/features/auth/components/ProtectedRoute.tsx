import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { getDefaultRoute } from "../api";
import { useAuth } from "../AuthProvider";
import type { SessionUser } from "../types";
import { SessionLoader } from "./SessionLoader";

interface ProtectedRouteProps extends PropsWithChildren {
  allow: (user: SessionUser) => boolean;
}

export function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SessionLoader />;
  }

  if (!user) {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    const loginTarget = nextPath && nextPath !== "/" ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
    return <Navigate to={loginTarget} replace />;
  }

  if (user.mustChangePasswordOnFirstLogin && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (!allow(user)) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }

  return <>{children}</>;
}