import { HttpError, requestJson } from "../../lib/http";
import type {
  ChangePasswordFieldErrors,
  ChangePasswordRequest,
  LoginRequest,
  SessionUser,
} from "./types";

export class ChangePasswordValidationError extends Error {
  readonly fieldErrors: ChangePasswordFieldErrors;

  constructor(fieldErrors: ChangePasswordFieldErrors) {
    super("Password change validation failed.");
    this.name = "ChangePasswordValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function mapFieldError(value: unknown): string | undefined {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

export function getDefaultRoute(user: SessionUser): string {
  if (user.mustChangePasswordOnFirstLogin) {
    return "/change-password";
  }

  if (user.role === "System Admin") {
    return "/admin/users";
  }

  if (user.role === "Colleague") {
    return "/colleague";
  }

  return "/";
}

export async function login(payload: LoginRequest): Promise<SessionUser> {
  return requestJson<SessionUser>("/auth/login/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchSession(): Promise<SessionUser | null> {
  try {
    return await requestJson<SessionUser>("/auth/session/", {
      credentials: "include",
    });
  } catch (reason: unknown) {
    if (reason instanceof HttpError && reason.status === 401) {
      return null;
    }

    throw reason;
  }
}

export async function logout(): Promise<void> {
  await requestJson<null>("/auth/logout/", {
    method: "POST",
    credentials: "include",
  });
}

export async function changePassword(payload: ChangePasswordRequest): Promise<SessionUser> {
  try {
    return await requestJson<SessionUser>("/auth/change-password/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (reason: unknown) {
    if (!(reason instanceof HttpError) || reason.status !== 400 || typeof reason.body !== "object" || reason.body === null) {
      throw reason;
    }

    const body = reason.body as Record<string, unknown>;
    throw new ChangePasswordValidationError({
      currentPassword: mapFieldError(body.currentPassword),
      newPassword: mapFieldError(body.newPassword),
      confirmNewPassword: mapFieldError(body.confirmNewPassword),
    });
  }
}