import type { ConsentState } from "../../types";

interface ComplianceStepProps {
  compliance: ConsentState;
  errors: Record<string, string[]>;
  onChange: (field: keyof ConsentState, value: boolean) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

interface BooleanChoiceFieldProps {
  label: string;
  hint: string;
  value: boolean | null;
  error?: string;
  onChange: (value: boolean) => void;
}

function BooleanChoiceField({ error, hint, label, onChange, value }: BooleanChoiceFieldProps) {
  return (
    <div className="choice-card-group">
      <div className="choice-card-copy">
        <strong>{label}</strong>
        <p>{hint}</p>
      </div>
      <div className="choice-grid">
        <button
          className={`choice-card ${value === true ? "choice-card-selected" : ""}`}
          onClick={() => onChange(true)}
          type="button"
        >
          Yes
        </button>
        <button
          className={`choice-card ${value === false ? "choice-card-selected" : ""}`}
          onClick={() => onChange(false)}
          type="button"
        >
          No
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function ComplianceStep({ compliance, errors, onChange }: ComplianceStepProps) {
  return (
    <div className="step-layout">
      <section className="step-intro-card compliance-intro-card">
        <strong>Consent must be explicit before case handling starts.</strong>
        <p>
          Your privacy choices help us process the request correctly and contact you about important updates.
        </p>
      </section>

      <BooleanChoiceField
        error={getError(errors, "compliance.gdprConsentPrimary")}
        hint="The passenger agrees that AirAssist may process the case package and communicate with the airline."
        label="Primary GDPR consent"
        onChange={(value) => onChange("gdprConsentPrimary", value)}
        value={compliance.gdprConsentPrimary}
      />

      <BooleanChoiceField
        error={getError(errors, "compliance.gdprConsentSecondary")}
        hint="The passenger chooses whether non-essential follow-up updates may be sent after the case is filed."
        label="Secondary follow-up preference"
        onChange={(value) => onChange("gdprConsentSecondary", value)}
        value={compliance.gdprConsentSecondary}
      />
    </div>
  );
}