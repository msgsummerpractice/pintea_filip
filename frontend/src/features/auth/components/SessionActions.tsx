import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useOptionalAuth } from "../AuthProvider";

export function SessionActions() {
  const navigate = useNavigate();
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
      navigate("/login", { replace: true });
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
        <Link className="ghost-button" to="/change-password">
          Change Password
        </Link>
        <button className="secondary-button" disabled={isSubmitting} onClick={handleLogout} type="button">
          {isSubmitting ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </div>
  );
}