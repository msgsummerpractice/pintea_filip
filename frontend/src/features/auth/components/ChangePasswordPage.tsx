import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { HttpError } from "../../../lib/http";
import { ChangePasswordValidationError, getDefaultRoute } from "../api";
import { useAuth } from "../AuthProvider";
import type { ChangePasswordFieldErrors } from "../types";

const initialErrors: ChangePasswordFieldErrors = {};

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, changePassword, isLoading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ChangePasswordFieldErrors>(initialErrors);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFieldErrors(initialErrors);
    setStatusMessage(null);

    try {
      const updatedUser = await changePassword({
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      navigate(getDefaultRoute(updatedUser), { replace: true });
    } catch (reason: unknown) {
      if (reason instanceof ChangePasswordValidationError) {
        setFieldErrors(reason.fieldErrors);
      } else if (reason instanceof HttpError && reason.status === 401) {
        navigate("/login", { replace: true });
      } else {
        setStatusMessage("Unable to change the password right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="change-password-title">
        <div className="auth-copy">
          <p className="eyebrow">Security</p>
          <h1 id="change-password-title">Change Password</h1>
          <p>{user?.mustChangePasswordOnFirstLogin ? "You must update your password before continuing." : "Update your password for the current session."}</p>
        </div>

        {statusMessage ? (
          <div className="notice-banner notice-banner-error" role="alert">
            {statusMessage}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field field-span-full">
            <span>Current Password</span>
            <input
              aria-describedby={fieldErrors.currentPassword ? "change-password-current-error" : undefined}
              aria-invalid={fieldErrors.currentPassword ? "true" : undefined}
              autoComplete="current-password"
              className="text-input"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
            {fieldErrors.currentPassword ? (
              <p className="field-error" id="change-password-current-error">{fieldErrors.currentPassword}</p>
            ) : null}
          </label>

          <label className="field field-span-full">
            <span>New Password</span>
            <input
              aria-describedby={fieldErrors.newPassword ? "change-password-new-error" : undefined}
              aria-invalid={fieldErrors.newPassword ? "true" : undefined}
              autoComplete="new-password"
              className="text-input"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
            {fieldErrors.newPassword ? (
              <p className="field-error" id="change-password-new-error">{fieldErrors.newPassword}</p>
            ) : null}
          </label>

          <label className="field field-span-full">
            <span>Confirm New Password</span>
            <input
              aria-describedby={fieldErrors.confirmNewPassword ? "change-password-confirm-error" : undefined}
              aria-invalid={fieldErrors.confirmNewPassword ? "true" : undefined}
              autoComplete="new-password"
              className="text-input"
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              type="password"
              value={confirmNewPassword}
            />
            {fieldErrors.confirmNewPassword ? (
              <p className="field-error" id="change-password-confirm-error">{fieldErrors.confirmNewPassword}</p>
            ) : null}
          </label>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving password..." : "Save Password"}
          </button>
        </form>
      </section>
    </main>
  );
}