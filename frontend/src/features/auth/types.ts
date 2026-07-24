export type SessionRole = "Passenger" | "Colleague" | "System Admin";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: SessionRole;
  mustChangePasswordOnFirstLogin: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface ChangePasswordFieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
}