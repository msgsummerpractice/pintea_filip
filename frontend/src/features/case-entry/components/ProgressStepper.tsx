export type ProgressStepperStatus = "complete" | "current" | "upcoming" | "locked";

export interface ProgressStepperItem {
  id: string;
  label: string;
  title: string;
  description: string;
  status: ProgressStepperStatus;
  kind: "active" | "locked";
  isSelected: boolean;
  disabled: boolean;
}

interface ProgressStepperProps {
  ariaLabel: string;
  items: ProgressStepperItem[];
  progressPercent: number;
  onSelect: (stepId: string) => void;
}

export function ProgressStepper({ ariaLabel, items, progressPercent, onSelect }: ProgressStepperProps) {
  return (
    <nav aria-label={ariaLabel} className="progress-stepper">
      <div className="progress-meter" aria-hidden="true">
        <div className="progress-meter-bar" style={{ width: `${progressPercent}%` }} />
      </div>

      <ol className="progress-step-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              aria-current={item.isSelected ? "step" : undefined}
              className={[
                "progress-step",
                `progress-step-${item.status}`,
                item.isSelected ? "progress-step-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span className="progress-step-label-row">
                <span className="progress-step-label">{item.label}</span>
                <span className="progress-step-status">{item.status}</span>
              </span>
              <strong>{item.title}</strong>
              <span className="progress-step-description">{item.description}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}