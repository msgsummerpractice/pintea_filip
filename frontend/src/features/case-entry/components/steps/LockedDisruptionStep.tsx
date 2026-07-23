interface LockedDisruptionStepProps {
  step: {
    label: string;
    title: string;
    description: string;
  };
}

export function LockedDisruptionStep({ step }: LockedDisruptionStepProps) {
  return (
    <div className="step-layout">
      <section className="locked-spotlight" aria-label="Locked disruption stage">
        <div>
          <p className="section-card-label">{step.label} locked</p>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>
        <span className="locked-pill">Read-only in Story 1</span>
      </section>

      <div className="locked-card-grid">
        <article className="locked-card">
          <strong>Disruption timeline</strong>
          <p>Delay codes, airline notices, and missed-connection evidence remain visible as future scope.</p>
        </article>
        <article className="locked-card">
          <strong>Compensation logic</strong>
          <p>Eligibility checks and exception handling will attach to the submitted intake package later.</p>
        </article>
        <article className="locked-card">
          <strong>Airline workflow</strong>
          <p>Carrier response tracking, escalation, and manual review states are intentionally non-editable here.</p>
        </article>
      </div>
    </div>
  );
}