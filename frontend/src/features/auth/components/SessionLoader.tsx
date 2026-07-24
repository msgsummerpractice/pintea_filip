export function SessionLoader() {
  return (
    <main className="auth-shell">
      <section className="auth-card session-loader-card" aria-labelledby="session-loader-title">
        <div aria-hidden="true" className="flight-loader">
          <div className="flight-loader-path" />
          <div className="flight-loader-plane">
            <svg className="flight-loader-plane-icon" viewBox="0 0 24 24">
              <path
                d="M3 13.5L21 12 3 10.5l5.5-6 .9.4-1.8 5 6.3.5 3.2-3.7.8.4-1.5 3.5 1.5 3.5-.8.4-3.2-3.7-6.3.5 1.8 5-.9.4-5.5-6z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>

        <div className="auth-copy session-loader-copy">
          <p className="eyebrow">Preparing your route</p>
          <h1 id="session-loader-title">Checking your session</h1>
          <p role="status">Taking you to the right workspace.</p>
        </div>
      </section>
    </main>
  );
}