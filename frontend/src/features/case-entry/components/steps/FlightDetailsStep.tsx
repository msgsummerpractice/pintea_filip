import type { FlightDetailsInput } from "../../types";

interface FlightDetailsStepProps {
  flightDetails: FlightDetailsInput;
  errors: Record<string, string[]>;
  onChange: (field: keyof FlightDetailsInput, value: string) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function FlightDetailsStep({ errors, flightDetails, onChange }: FlightDetailsStepProps) {
  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Anchor the claim on the main reservation.</strong>
        <p>
          The reservation number and planned schedule feed the current submit path and shape the
          later disruption evaluation.
        </p>
      </section>

      <div className="form-grid">
        <label className="field">
          <span>Flight date</span>
          <input
            className="text-input"
            onChange={(event) => onChange("flightDate", event.target.value)}
            type="date"
            value={flightDetails.flightDate}
          />
          {getError(errors, "flightDetails.flightDate") && (
            <p className="field-error">{getError(errors, "flightDetails.flightDate")}</p>
          )}
        </label>

        <label className="field">
          <span>Flight number</span>
          <input
            className="text-input"
            onChange={(event) => onChange("flightNumber", event.target.value)}
            type="text"
            value={flightDetails.flightNumber}
          />
          {getError(errors, "flightDetails.flightNumber") && (
            <p className="field-error">{getError(errors, "flightDetails.flightNumber")}</p>
          )}
        </label>

        <label className="field">
          <span>Airline</span>
          <input
            className="text-input"
            onChange={(event) => onChange("airline", event.target.value)}
            type="text"
            value={flightDetails.airline}
          />
          {getError(errors, "flightDetails.airline") && (
            <p className="field-error">{getError(errors, "flightDetails.airline")}</p>
          )}
        </label>

        <label className="field">
          <span>Reservation number</span>
          <input
            className="text-input"
            onChange={(event) => onChange("reservationNumber", event.target.value)}
            type="text"
            value={flightDetails.reservationNumber}
          />
          {getError(errors, "flightDetails.reservationNumber") && (
            <p className="field-error">{getError(errors, "flightDetails.reservationNumber")}</p>
          )}
        </label>

        <label className="field">
          <span>Planned departure time</span>
          <input
            className="text-input"
            onChange={(event) => onChange("plannedDepartureTime", event.target.value)}
            type="time"
            value={flightDetails.plannedDepartureTime}
          />
          {getError(errors, "flightDetails.plannedDepartureTime") && (
            <p className="field-error">{getError(errors, "flightDetails.plannedDepartureTime")}</p>
          )}
        </label>

        <label className="field">
          <span>Planned arrival time</span>
          <input
            className="text-input"
            onChange={(event) => onChange("plannedArrivalTime", event.target.value)}
            type="time"
            value={flightDetails.plannedArrivalTime}
          />
          {getError(errors, "flightDetails.plannedArrivalTime") && (
            <p className="field-error">{getError(errors, "flightDetails.plannedArrivalTime")}</p>
          )}
        </label>
      </div>
    </div>
  );
}