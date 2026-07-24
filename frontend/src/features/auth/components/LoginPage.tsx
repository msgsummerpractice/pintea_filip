import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { HttpError } from "../../../lib/http";
import { getDefaultRoute } from "../api";
import { useAuth } from "../AuthProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && user) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const sessionUser = await login({ email, password });
      const searchParams = new URLSearchParams(location.search);
      const nextPath = searchParams.get("next");
      const destination = sessionUser.mustChangePasswordOnFirstLogin
        ? "/change-password"
        : nextPath || getDefaultRoute(sessionUser);
      navigate(destination, { replace: true });
    } catch (reason: unknown) {
      if (reason instanceof HttpError && reason.status === 401) {
        setErrorMessage("Invalid e-mail or password.");
      } else {
        setErrorMessage("Unable to sign in right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-copy">
          <p className="eyebrow">AirAssist access</p>
          <h1 id="login-title">Sign In</h1>
          <p>Use the same login page for passenger, colleague, and system admin accounts.</p>
        </div>

        {errorMessage ? (
          <div className="notice-banner notice-banner-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field field-span-full">
            <span>E-Mail</span>
            <input
              autoComplete="email"
              className="text-input"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>

          <label className="field field-span-full">
            <span>Password</span>
            <input
              autoComplete="current-password"
              className="text-input"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}