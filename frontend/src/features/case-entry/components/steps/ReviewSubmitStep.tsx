import type { CaseEntrySubmitState } from "../../hooks/useCaseEntryWizard";
import type { AirportOption, CaseEntryDraft } from "../../types";

interface ReviewSubmitStepProps {
  draft: CaseEntryDraft;
  submitState: CaseEntrySubmitState;
  onSubmit: () => void | Promise<void>;
  formatAirport: (airport: AirportOption | null) => string;
  formatConsent: (value: boolean | null) => string;
}

export function ReviewSubmitStep({
  draft,
  formatAirport,
  formatConsent,
  onSubmit,
  submitState,
}: ReviewSubmitStepProps) {
  const disruptionLabels = {
    cancellation: "Cancellation",
    delay: "Delay",
    denied_boarding: "Denied boarding",
  } as const;

  const airlineMotiveKnownLabels = {
    yes: "Yes",
    no: "No",
    i_dont_know: "I don't know",
  } as const;

  const airlineMotiveLabels = {
    technical_problem: "Technical problem",
    meteorological_conditions: "Meteorological conditions",
    strike: "Strike",
    problems_with_airport: "Problems with airport",
    other_motives: "Other motives",
  } as const;

  const disruptionType = draft.disruptionDetails.disruptionType;
  const finalArrivalOutcome = draft.disruptionDetails.finalArrivalOutcome ?? "Not provided";
  const noticeTiming = draft.disruptionDetails.cancellationNoticeTiming ?? "Not provided";
  const voluntarySeat = draft.disruptionDetails.gaveUpSeatVoluntarily === null
    ? "Not provided"
    : draft.disruptionDetails.gaveUpSeatVoluntarily === "yes"
      ? "Yes"
      : "No";
  const deniedBoardingReason = draft.disruptionDetails.deniedBoardingReason
    ? draft.disruptionDetails.deniedBoardingReason.replace(/_/g, " ")
    : "Not provided";
  const airlineMotiveKnown = draft.disruptionMotive.airlineMotiveKnown
    ? airlineMotiveKnownLabels[draft.disruptionMotive.airlineMotiveKnown]
    : "Not provided";
  const airlineMotive = draft.disruptionMotive.airlineMotive
    ? airlineMotiveLabels[draft.disruptionMotive.airlineMotive]
    : "Not provided";

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

        <article className="summary-card">
          <p className="section-card-label">Disruption</p>
          <h3>{disruptionType ? disruptionLabels[disruptionType] : "Not selected"}</h3>
          <p>{finalArrivalOutcome}</p>
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
          <p className="section-card-label">Disruption summary</p>
          <dl className="review-list">
            <div>
              <dt>Type of disruption</dt>
              <dd>{disruptionType ? disruptionLabels[disruptionType] : "Not selected"}</dd>
            </div>
            <div>
              <dt>Final arrival outcome</dt>
              <dd>{finalArrivalOutcome}</dd>
            </div>
            {disruptionType === "cancellation" && (
              <div>
                <dt>Cancellation notice</dt>
                <dd>{noticeTiming}</dd>
              </div>
            )}
            {disruptionType === "denied_boarding" && (
              <>
                <div>
                  <dt>Gave up seat voluntarily</dt>
                  <dd>{voluntarySeat}</dd>
                </div>
                <div>
                  <dt>Denied boarding reason</dt>
                  <dd>{deniedBoardingReason}</dd>
                </div>
              </>
            )}
            {(disruptionType === "cancellation" || disruptionType === "delay") && (
              <>
                <div>
                  <dt>Airline mentioned a reason</dt>
                  <dd>{airlineMotiveKnown}</dd>
                </div>
                <div>
                  <dt>Airline reason</dt>
                  <dd>{airlineMotive}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Incident description</dt>
              <dd>{draft.disruptionMotive.incidentDescription || "Not provided"}</dd>
            </div>
          </dl>
        </article>

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
          <h3>Send your request</h3>
          <p>
            Check the journey, disruption, passenger details, and documents one last time before you submit.
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
          </div>
        </article>
      </section>
    </div>
  );
}