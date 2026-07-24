import { useState } from "react";

import { useOptionalAuth } from "../AuthProvider";

export function SessionActions() {
  const auth = useOptionalAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!auth?.user) {
    return null;
  }

  const { user, logout } = auth;

  async function handleLogout() {
    setIsSubmitting(true);
    try {
      await logout();
      window.location.assign("/login");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="session-actions" aria-label="Session actions">
      <div className="session-actions-copy">
        <p className="session-actions-name">{user.name}</p>
        <p className="session-actions-meta">{user.role}</p>
      </div>
      <div className="session-actions-buttons">
        <a className="ghost-button" href="/change-password">
          Change Password
        </a>
        <button className="secondary-button" disabled={isSubmitting} onClick={handleLogout} type="button">
          {isSubmitting ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </div>
  );
}