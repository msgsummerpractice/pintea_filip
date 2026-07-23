import type { PropsWithChildren } from "react";

interface StepFrameProps extends PropsWithChildren {
  label: string;
  title: string;
  description: string;
}

export function StepFrame({ children, description, label, title }: StepFrameProps) {
  return (
    <section className="step-frame" aria-labelledby="case-entry-step-title">
      <header className="step-frame-header">
        <p className="eyebrow">{label}</p>
        <h2 id="case-entry-step-title">{title}</h2>
        <p>{description}</p>
      </header>
      <div className="step-frame-body">{children}</div>
    </section>
  );
}