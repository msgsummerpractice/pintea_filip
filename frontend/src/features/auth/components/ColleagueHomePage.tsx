import { SessionActions } from "./SessionActions";

export function ColleagueHomePage() {
  return (
    <main className="auth-shell auth-shell-wide">
      <section className="auth-card auth-card-wide" aria-labelledby="colleague-home-title">
        <SessionActions />
        <div className="auth-copy">
          <p className="eyebrow">Internal access</p>
          <h1 id="colleague-home-title">Colleague Workspace</h1>
          <p>You are signed in as a colleague. This placeholder confirms the internal route protection is working.</p>
        </div>
      </section>
    </main>
  );
}