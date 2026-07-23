import type { CaseEntrySubmitState } from "../../hooks/useCaseEntryWizard";
import type { AirportOption, CaseEntryDraft } from "../../types";

interface ReviewSubmitStepProps {
  draft: CaseEntryDraft;
  submitState: CaseEntrySubmitState;
  canPreviewLockedSteps: boolean;
  onSubmit: () => void | Promise<void>;
  onPreviewLockedStep: () => void;
  formatAirport: (airport: AirportOption | null) => string;
  formatConsent: (value: boolean | null) => string;
}

export function ReviewSubmitStep({
  canPreviewLockedSteps,
  draft,
  formatAirport,
  formatConsent,
  onPreviewLockedStep,
  onSubmit,
  submitState,
}: ReviewSubmitStepProps) {
  return (
    <div className="step-layout">
      <section className="summary-grid">
        <article className="summary-card">
          <p className="section-card-label">Itinerary</p>
          <h3>
            {formatAirport(draft.itinerary.departureAirport)} to {formatAirport(draft.itinerary.destinationAirport)}
          </h3>
          <p>{draft.itinerary.connectingFlights.length} connecting flights attached</p>
        </article>

        <article className="summary-card">
          <p className="section-card-label">Passenger</p>
          <h3>
            {draft.passengerDetails.firstName || "First name"} {draft.passengerDetails.lastName || "Last name"}
          </h3>
          <p>{draft.passengerDetails.email || "Email pending"}</p>
        </article>

        <article className="summary-card">
          <p className="section-card-label">Reservation</p>
          <h3>{draft.flightDetails.reservationNumber || "Reservation pending"}</h3>
          <p>
            {draft.flightDetails.flightNumber || "Flight"} · {draft.flightDetails.airline || "Airline"}
          </p>
        </article>

        {draft.compensationPreview && (
          <article className="summary-card">
            <p className="section-card-label">Compensation Estimate</p>
            <h3>€{draft.compensationPreview.compensationEur}</h3>
            <p>
              {draft.compensationPreview.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km orthodromic distance
            </p>
          </article>
        )}
      </section>

      <section className="review-section-grid">
        <article className="review-panel">
          <p className="section-card-label">Consent choices</p>
          <dl className="review-list">
            <div>
              <dt>Primary GDPR consent</dt>
              <dd>{formatConsent(draft.compliance.gdprConsentPrimary)}</dd>
            </div>
            <div>
              <dt>Secondary follow-up preference</dt>
              <dd>{formatConsent(draft.compliance.gdprConsentSecondary)}</dd>
            </div>
            <div>
              <dt>Boarding pass</dt>
              <dd>{draft.documents.boardingPass.file?.name ?? "Missing"}</dd>
            </div>
            <div>
              <dt>Identification</dt>
              <dd>{draft.documents.identification.file?.name ?? "Missing"}</dd>
            </div>
          </dl>
        </article>

        <article className="review-panel review-submit-panel">
          <p className="section-card-label">Submission</p>
          <h3>Submit the Story 1 intake package</h3>
          <p>
            The current submit path uses the existing case API contract. Disruption reasoning is
            intentionally deferred to the locked CASE_03 stages.
          </p>
          <div className="review-actions">
            <button
              className="primary-button"
              disabled={submitState.status === "submitting"}
              onClick={() => {
                void onSubmit();
              }}
              type="button"
            >
              {submitState.status === "submitting" ? "Submitting…" : "Submit case"}
            </button>
            <button
              className="secondary-button"
              disabled={!canPreviewLockedSteps}
              onClick={onPreviewLockedStep}
              type="button"
            >
              Preview CASE_03 locked steps
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}