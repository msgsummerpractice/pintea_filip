import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

import { fetchSession, login as loginRequest, logout as logoutRequest, changePassword as changePasswordRequest } from "./api";
import type { ChangePasswordRequest, LoginRequest, SessionUser } from "./types";

interface AuthContextValue {
  isLoading: boolean;
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  login: (payload: LoginRequest) => Promise<SessionUser>;
  logout: () => Promise<void>;
  changePassword: (payload: ChangePasswordRequest) => Promise<SessionUser>;
  refreshSession: () => Promise<SessionUser | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshSession(): Promise<SessionUser | null> {
    const nextUser = await fetchSession();
    setUser(nextUser);
    return nextUser;
  }

  async function login(payload: LoginRequest): Promise<SessionUser> {
    const nextUser = await loginRequest(payload);
    setUser(nextUser);
    return nextUser;
  }

  async function logout(): Promise<void> {
    await logoutRequest();
    setUser(null);
  }

  async function changePassword(payload: ChangePasswordRequest): Promise<SessionUser> {
    const nextUser = await changePasswordRequest(payload);
    setUser(nextUser);
    return nextUser;
  }

  useEffect(() => {
    let cancelled = false;

    fetchSession()
      .then((nextUser) => {
        if (!cancelled) {
          setUser(nextUser);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        user,
        setUser,
        login,
        logout,
        changePassword,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}

export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}