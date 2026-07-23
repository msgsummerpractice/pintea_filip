import type { PassengerDetailsInput } from "../../types";

interface PassengerDetailsStepProps {
  passengerDetails: PassengerDetailsInput;
  errors: Record<string, string[]>;
  onChange: (field: keyof PassengerDetailsInput, value: string) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function PassengerDetailsStep({
  errors,
  onChange,
  passengerDetails,
}: PassengerDetailsStepProps) {
  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Use the passenger's claim identity.</strong>
        <p>
          These details are carried into the case payload and will be used for contact and case
          reference communication.
        </p>
      </section>

      <div className="form-grid">
        <label className="field">
          <span>First name</span>
          <input
            className="text-input"
            onChange={(event) => onChange("firstName", event.target.value)}
            type="text"
            value={passengerDetails.firstName}
          />
          {getError(errors, "passengerDetails.firstName") && (
            <p className="field-error">{getError(errors, "passengerDetails.firstName")}</p>
          )}
        </label>

        <label className="field">
          <span>Last name</span>
          <input
            className="text-input"
            onChange={(event) => onChange("lastName", event.target.value)}
            type="text"
            value={passengerDetails.lastName}
          />
          {getError(errors, "passengerDetails.lastName") && (
            <p className="field-error">{getError(errors, "passengerDetails.lastName")}</p>
          )}
        </label>

        <label className="field">
          <span>Date of birth</span>
          <input
            className="text-input"
            onChange={(event) => onChange("dateOfBirth", event.target.value)}
            type="date"
            value={passengerDetails.dateOfBirth}
          />
          {getError(errors, "passengerDetails.dateOfBirth") && (
            <p className="field-error">{getError(errors, "passengerDetails.dateOfBirth")}</p>
          )}
        </label>

        <label className="field">
          <span>Email</span>
          <input
            className="text-input"
            onChange={(event) => onChange("email", event.target.value)}
            type="email"
            value={passengerDetails.email}
          />
          {getError(errors, "passengerDetails.email") && (
            <p className="field-error">{getError(errors, "passengerDetails.email")}</p>
          )}
        </label>

        <label className="field">
          <span>Phone</span>
          <input
            className="text-input"
            onChange={(event) => onChange("phone", event.target.value)}
            type="tel"
            value={passengerDetails.phone}
          />
          {getError(errors, "passengerDetails.phone") && (
            <p className="field-error">{getError(errors, "passengerDetails.phone")}</p>
          )}
        </label>

        <label className="field field-span-full">
          <span>Address</span>
          <input
            className="text-input"
            onChange={(event) => onChange("address", event.target.value)}
            type="text"
            value={passengerDetails.address}
          />
          {getError(errors, "passengerDetails.address") && (
            <p className="field-error">{getError(errors, "passengerDetails.address")}</p>
          )}
        </label>

        <label className="field">
          <span>Postal code</span>
          <input
            className="text-input"
            onChange={(event) => onChange("postalCode", event.target.value)}
            type="text"
            value={passengerDetails.postalCode}
          />
          {getError(errors, "passengerDetails.postalCode") && (
            <p className="field-error">{getError(errors, "passengerDetails.postalCode")}</p>
          )}
        </label>
      </div>
    </div>
  );
}