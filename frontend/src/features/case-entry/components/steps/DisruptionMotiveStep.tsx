import type { AirlineMotive, AirlineMotiveKnown, DisruptionMotiveInput, DisruptionType } from "../../types";

interface DisruptionMotiveStepProps {
  disruptionType: DisruptionType | null;
  disruptionMotive: DisruptionMotiveInput;
  errors: Record<string, string[]>;
  onChange: <K extends keyof DisruptionMotiveInput>(field: K, value: DisruptionMotiveInput[K]) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

const AIRLINE_MOTIVE_OPTIONS: Array<{ value: AirlineMotive; label: string }> = [
  { value: "technical_problem", label: "Technical problem" },
  { value: "meteorological_conditions", label: "Meteorological conditions" },
  { value: "strike", label: "Strike" },
  { value: "problems_with_airport", label: "Problems with airport" },
  { value: "crew_problems", label: "Crew problems" },
  { value: "other_motives", label: "Other motives" },
];

export function DisruptionMotiveStep({
  disruptionType,
  disruptionMotive,
  errors,
  onChange,
}: DisruptionMotiveStepProps) {
  const showMotiveQuestion = disruptionType === "cancellation" || disruptionType === "delay";
  const charCount = disruptionMotive.incidentDescription.length;

  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Additional disruption details</strong>
        <p>Help us understand the circumstances around your disrupted flight.</p>
      </section>

      <div className="form-grid">
        {showMotiveQuestion && (
          <>
            <fieldset className="field">
              <legend>Did the airline mention disruption motive?</legend>
              {(["yes", "no", "i_dont_know"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionMotive.airlineMotiveKnown === option}
                    name="airlineMotiveKnown"
                    onChange={() => onChange("airlineMotiveKnown", option as AirlineMotiveKnown)}
                    type="radio"
                  />
                  <span>
                    {option === "yes" ? "Yes" : option === "no" ? "No" : "I don't know"}
                  </span>
                </label>
              ))}
              {getError(errors, "disruptionMotive.airlineMotiveKnown") && (
                <p className="field-error">{getError(errors, "disruptionMotive.airlineMotiveKnown")}</p>
              )}
            </fieldset>

            {disruptionMotive.airlineMotiveKnown === "yes" && (
              <fieldset className="field">
                <legend>What was the motive communicated by the airline?</legend>
                {AIRLINE_MOTIVE_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="radio-option">
                    <input
                      checked={disruptionMotive.airlineMotive === value}
                      name="airlineMotive"
                      onChange={() => onChange("airlineMotive", value)}
                      type="radio"
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {getError(errors, "disruptionMotive.airlineMotive") && (
                  <p className="field-error">{getError(errors, "disruptionMotive.airlineMotive")}</p>
                )}
              </fieldset>
            )}
          </>
        )}

        <label className="field">
          <span>Describe in short what has happened</span>
          <textarea
            className="text-input textarea-large"
            maxLength={1000}
            onChange={(e) => onChange("incidentDescription", e.target.value)}
            rows={6}
            value={disruptionMotive.incidentDescription}
          />
          <span className="char-counter">{charCount} / 1000</span>
          {getError(errors, "disruptionMotive.incidentDescription") && (
            <p className="field-error">{getError(errors, "disruptionMotive.incidentDescription")}</p>
          )}
        </label>
      </div>
    </div>
  );
}
