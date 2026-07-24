import logo from "../assets/airassistlogo.png";
import { useState, type PropsWithChildren } from "react";

import { getDefaultRoute } from "../features/auth/api";
import { useOptionalAuth } from "../features/auth/AuthProvider";

export function App({ children }: PropsWithChildren) {
  const auth = useOptionalAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    if (!auth?.user) {
      return;
    }

    setIsSubmitting(true);
    try {
      await auth.logout();
      window.location.assign("/login");
    } finally {
      setIsSubmitting(false);
    }
  }

  const dashboardHref = auth?.user ? getDefaultRoute(auth.user) : "/";
  const shouldShowStartClaim = !auth?.user || auth.user.role === "Passenger";
  const shouldShowDashboard = Boolean(auth?.user && dashboardHref !== "/");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <a className="app-brand" href="/">
            <span aria-hidden="true" className="app-brand-mark">
              <img src={logo} alt="" className="app-logo" />
            </span>
            <span className="app-brand-copy">
              <strong>AirAssist Claims Portal</strong>
              <span>Passenger compensation case management</span>
            </span>
          </a>

          <div className="app-header-actions">
            {shouldShowStartClaim ? (
              <a className="ghost-button app-nav-link" href="/">
                Start a Claim
              </a>
            ) : null}

            {auth?.isLoading ? (
              <span className="app-status-pill">Checking session...</span>
            ) : auth?.user ? (
              <>
                {shouldShowDashboard ? (
                  <a className="ghost-button app-nav-link" href={dashboardHref}>
                    Dashboard
                  </a>
                ) : null}
                <div className="app-user-chip" aria-label="Signed in user">
                  <strong>{auth.user.name}</strong>
                  <span>{auth.user.role}</span>
                </div>
                <a className="ghost-button app-nav-link" href="/change-password">
                  Password
                </a>
                <button className="secondary-button" disabled={isSubmitting} onClick={handleLogout} type="button">
                  {isSubmitting ? "Signing out..." : "Sign Out"}
                </button>
              </>
            ) : (
              <a className="primary-button app-nav-link" href="/login">
                Sign In
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="app-footer-block app-footer-brand-block">
            <p className="app-footer-label">AirAssist Claims Portal</p>
            <strong>Structured support for passenger disruption claims.</strong>
            <p>Submit compensation requests, review cases internally, and manage access from a single professional workspace.</p>
          </div>

          <div className="app-footer-block app-footer-links-block">
            <p className="app-footer-label">Quick access</p>
            <div className="app-footer-links">
              <a href="/">Claim intake</a>
              <a href="/login">Staff sign in</a>
              {auth?.user ? <a href={dashboardHref}>Dashboard</a> : null}
            </div>
          </div>

          <div className="app-footer-block app-footer-meta-block">
            <p className="app-footer-label">Service</p>
            <p className="app-footer-meta">Secure intake for passengers, controlled access for colleagues, and administration tools for internal teams.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}