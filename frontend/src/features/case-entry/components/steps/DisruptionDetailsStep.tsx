import type { DisruptionDetailsInput, DisruptionType } from "../../types";

interface DisruptionDetailsStepProps {
  disruptionDetails: DisruptionDetailsInput;
  errors: Record<string, string[]>;
  onChange: <K extends keyof DisruptionDetailsInput>(field: K, value: DisruptionDetailsInput[K]) => void;
  onTypeChange: (type: DisruptionType | null) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function DisruptionDetailsStep({
  disruptionDetails,
  errors,
  onChange,
  onTypeChange,
}: DisruptionDetailsStepProps) {
  function handleTypeChange(value: string) {
    const newType = value === "" ? null : (value as DisruptionType);
    onTypeChange(newType);
  }

  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>What happened to your flight?</strong>
        <p>Select the type of disruption you experienced and answer the follow-up questions.</p>
      </section>

      <div className="form-grid">
        <label className="field">
          <span>Type of disruption</span>
          <select
            className="text-input"
            onChange={(e) => handleTypeChange(e.target.value)}
            value={disruptionDetails.disruptionType ?? ""}
          >
            <option value="">Select disruption type</option>
            <option value="cancellation">Cancellation</option>
            <option value="delay">Delay</option>
            <option value="denied_boarding">Denied Boarding</option>
          </select>
          {getError(errors, "disruptionDetails.disruptionType") && (
            <p className="field-error">{getError(errors, "disruptionDetails.disruptionType")}</p>
          )}
        </label>

        {disruptionDetails.disruptionType === "cancellation" && (
          <>
            <fieldset className="field">
              <legend>How late arrived to final destination?</legend>
              {(["<3h", ">3h", "never arrived"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionDetails.finalArrivalOutcome === option}
                    name="finalArrivalOutcome"
                    onChange={() => onChange("finalArrivalOutcome", option)}
                    type="radio"
                  />
                  <span>{option}</span>
                </label>
              ))}
              {getError(errors, "disruptionDetails.finalArrivalOutcome") && (
                <p className="field-error">{getError(errors, "disruptionDetails.finalArrivalOutcome")}</p>
              )}
            </fieldset>

            <fieldset className="field">
              <legend>How many days before cancellation has the airline informed?</legend>
              {([">14 days", "<14 days", "on flight day"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionDetails.cancellationNoticeTiming === option}
                    name="cancellationNoticeTiming"
                    onChange={() => onChange("cancellationNoticeTiming", option)}
                    type="radio"
                  />
                  <span>{option}</span>
                </label>
              ))}
              {getError(errors, "disruptionDetails.cancellationNoticeTiming") && (
                <p className="field-error">{getError(errors, "disruptionDetails.cancellationNoticeTiming")}</p>
              )}
            </fieldset>
          </>
        )}

        {disruptionDetails.disruptionType === "delay" && (
          <fieldset className="field">
            <legend>How late arrived to final destination?</legend>
            {(["<3h", ">3h", "connection flight lost"] as const).map((option) => (
              <label key={option} className="radio-option">
                <input
                  checked={disruptionDetails.finalArrivalOutcome === option}
                  name="finalArrivalOutcome"
                  onChange={() => onChange("finalArrivalOutcome", option)}
                  type="radio"
                />
                <span>{option}</span>
              </label>
            ))}
            {getError(errors, "disruptionDetails.finalArrivalOutcome") && (
              <p className="field-error">{getError(errors, "disruptionDetails.finalArrivalOutcome")}</p>
            )}
          </fieldset>
        )}

        {disruptionDetails.disruptionType === "denied_boarding" && (
          <>
            <fieldset className="field">
              <legend>How late arrived to final destination?</legend>
              {(["<3h", ">3h", "never arrived"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionDetails.finalArrivalOutcome === option}
                    name="finalArrivalOutcome"
                    onChange={() => onChange("finalArrivalOutcome", option)}
                    type="radio"
                  />
                  <span>{option}</span>
                </label>
              ))}
              {getError(errors, "disruptionDetails.finalArrivalOutcome") && (
                <p className="field-error">{getError(errors, "disruptionDetails.finalArrivalOutcome")}</p>
              )}
            </fieldset>

            <fieldset className="field">
              <legend>Did you give up your seat voluntarily?</legend>
              {(["yes", "no"] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    checked={disruptionDetails.gaveUpSeatVoluntarily === option}
                    name="gaveUpSeatVoluntarily"
                    onChange={() => onChange("gaveUpSeatVoluntarily", option)}
                    type="radio"
                  />
                  <span>{option === "yes" ? "Yes" : "No"}</span>
                </label>
              ))}
              {getError(errors, "disruptionDetails.gaveUpSeatVoluntarily") && (
                <p className="field-error">{getError(errors, "disruptionDetails.gaveUpSeatVoluntarily")}</p>
              )}
            </fieldset>

            {disruptionDetails.gaveUpSeatVoluntarily === "no" && (
              <fieldset className="field">
                <legend>Reason behind denial of boarding</legend>
                {([
                  ["flight_overbooked", "Flight overbooked"],
                  ["aggressive_behavior", "Aggressive behavior with staff"],
                  ["intoxication", "Intoxication"],
                  ["unspecified_reason", "Unspecified reason"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="radio-option">
                    <input
                      checked={disruptionDetails.deniedBoardingReason === value}
                      name="deniedBoardingReason"
                      onChange={() => onChange("deniedBoardingReason", value)}
                      type="radio"
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {getError(errors, "disruptionDetails.deniedBoardingReason") && (
                  <p className="field-error">{getError(errors, "disruptionDetails.deniedBoardingReason")}</p>
                )}
              </fieldset>
            )}
          </>
        )}
      </div>
    </div>
  );
}
