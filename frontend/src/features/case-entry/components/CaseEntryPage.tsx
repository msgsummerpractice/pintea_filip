import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { useOptionalAuth } from "../../auth/AuthProvider";
import { SessionActions } from "../../auth/components/SessionActions";
import { fetchCaseList } from "../../case-list/api";
import type { CaseListRow } from "../../case-list/types";
import { HttpError } from "../../../lib/http";

import type { CaseEntrySubmitState } from "../hooks/useCaseEntryWizard";
import { useCaseEntryWizard } from "../hooks/useCaseEntryWizard";
import type {
  AirportOption,
  CaseEntryDraft,
  CaseEntrySubmitError,
  CaseEntrySubmitResponse,
  CaseEntryWizardStepId,
} from "../types";

import { StepFrame } from "./StepFrame";
import { ComplianceStep } from "./steps/ComplianceStep";
import { DisruptionDetailsStep } from "./steps/DisruptionDetailsStep";
import { DisruptionMotiveStep } from "./steps/DisruptionMotiveStep";
import { DocumentsStep } from "./steps/DocumentsStep";
import { FlightDetailsStep } from "./steps/FlightDetailsStep";
import { ItineraryStep } from "./steps/ItineraryStep";
import { PassengerDetailsStep } from "./steps/PassengerDetailsStep";
import { ReviewSubmitStep } from "./steps/ReviewSubmitStep";

interface CaseEntryPageProps {
  initialDraft?: CaseEntryDraft;
  submitter?: (draft: CaseEntryDraft) => Promise<CaseEntrySubmitResponse>;
}

interface ActiveStepMeta {
  label: string;
  title: string;
  description: string;
}

interface StepRailItem {
  id: CaseEntryWizardStepId;
  index: number;
  label: string;
  title: string;
  status: "complete" | "current" | "upcoming";
}

function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = trimmedName.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
  };
}

const activeStepMeta: Record<CaseEntryWizardStepId, ActiveStepMeta> = {
  itinerary: {
    label: "Step 1",
    title: "Add your journey",
    description: "Tell us where you were travelling from, where you were headed, and whether your trip included any connections.",
  },
  disruptionDetails: {
    label: "Step 2",
    title: "Describe the disruption",
    description: "Choose the disruption type and answer a few follow-up questions about what happened during the trip.",
  },
  disruptionMotive: {
    label: "Step 3",
    title: "Add more details",
    description: "Share the airline's explanation, if one was given, and briefly describe the incident in your own words.",
  },
  compliance: {
    label: "Step 4",
    title: "Confirm consent",
    description: "Confirm how we may use your information so we can process your request and keep you informed.",
  },
  flightDetails: {
    label: "Step 5",
    title: "Add your flight details",
    description: "Enter the booking and schedule details for the flight that was affected.",
  },
  passengerDetails: {
    label: "Step 6",
    title: "Add passenger details",
    description: "Provide the contact details we should use for updates about your request.",
  },
  documents: {
    label: "Step 7",
    title: "Upload proof documents",
    description: "Upload the documents that help confirm the trip and the affected passenger.",
  },
  review: {
    label: "Step 8",
    title: "Review and submit",
    description: "Review everything carefully before sending your request.",
  },
};

function formatConsent(value: boolean | null): string {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return "Not selected";
}

function formatAirport(airport: AirportOption | null): string {
  return airport?.displayLabel ?? "Not selected";
}

function formatValidationErrorLabel(path: string): string {
  if (path === "general") {
    return "General";
  }

  const segments = path.split(".");
  const formattedSegments = segments.map((segment) => {
    if (/^\d+$/.test(segment)) {
      return `#${Number(segment) + 1}`;
    }

    return segment
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  });

  return formattedSegments.join(" > ");
}

function hasStepInteraction(step: CaseEntryWizardStepId, draft: CaseEntryDraft): boolean {
  switch (step) {
    case "itinerary":
      return Boolean(
        draft.itinerary.departureAirport
        || draft.itinerary.destinationAirport
        || draft.itinerary.connectingFlights.length > 0
        || draft.itinerary.problemFlightId,
      );
    case "disruptionDetails":
      return draft.disruptionDetails.disruptionType !== null;
    case "disruptionMotive":
      return (
        draft.disruptionMotive.airlineMotiveKnown !== null
        || draft.disruptionMotive.incidentDescription.trim().length > 0
      );
    case "compliance":
      return draft.compliance.gdprConsentPrimary !== null || draft.compliance.gdprConsentSecondary !== null;
    case "flightDetails":
      return Object.values(draft.flightDetails).some((value) => value.trim().length > 0);
    case "passengerDetails":
      return Object.values(draft.passengerDetails).some((value) => value.trim().length > 0);
    case "documents":
      return Boolean(draft.documents.boardingPass.file || draft.documents.identification.file);
    case "review":
      return false;
    default:
      return false;
  }
}

function getStepIcon(step: CaseEntryWizardStepId) {
  switch (step) {
    case "itinerary":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <path d="M3 14l18-4-7 7 1 4-3-2-3 2 1-4-7-3z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "disruptionDetails":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <path d="M12 4l8 14H4L12 4z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 9v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
      );
    case "disruptionMotive":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <path d="M8 5h8l3 3v11H8z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M16 5v4h4" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M10.5 13h6M10.5 16h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "compliance":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <path d="M12 4l7 3v5c0 4.3-2.9 7.6-7 8.8C7.9 19.6 5 16.3 5 12V7l7-3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9.5 12.5l1.8 1.8 3.7-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "flightDetails":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <rect x="4" y="7" width="16" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 10h8M8 14h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "passengerDetails":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.5 19c1.4-3 3.6-4.5 5.5-4.5s4.1 1.5 5.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "documents":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <path d="M8 4h7l4 4v12H8z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M15 4v4h4M10.5 13h6M10.5 16h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "review":
      return (
        <svg aria-hidden="true" className="step-rail-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.8 12.3l2.2 2.2 4.4-4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    default:
      return null;
  }
}

function StepRail({ items, onSelect }: { items: StepRailItem[]; onSelect: (stepId: string) => void }) {
  const progressPercent = items.length <= 1 ? 0 : (items.findIndex((item) => item.status === "current") / (items.length - 1)) * 100;

  return (
    <nav aria-label="Case entry progress" className="step-rail">
      <div aria-hidden="true" className="step-rail-track">
        <div className="step-rail-track-fill" style={{ height: `${progressPercent}%` }} />
      </div>

      <ol className="step-rail-list">
        {items.map((item, index) => (
          <li className="step-rail-entry" key={item.id}>
            <button
              aria-current={item.status === "current" ? "step" : undefined}
              className={[
                "step-rail-button",
                `step-rail-button-${item.status}`,
              ].join(" ")}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span className="step-rail-marker">{getStepIcon(item.id)}</span>
              <span className="step-rail-copy">
                <span className="step-rail-label">{item.label}</span>
                <strong>{item.title}</strong>
              </span>
            </button>

            {index < items.length - 1 ? (
              <span
                aria-hidden="true"
                className={[
                  "step-rail-connector",
                  item.status === "complete" ? "step-rail-connector-complete" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CaseEntryPage({ initialDraft, submitter }: CaseEntryPageProps = {}) {
  const auth = useOptionalAuth();
  const currentUser = auth?.user;
  const wizard = useCaseEntryWizard({ initialDraft, submitter });
  const [revealedErrors, setRevealedErrors] = useState<Record<string, boolean>>({});
  const [successfulResponse, setSuccessfulResponse] = useState<CaseEntrySubmitResponse | null>(null);
  const [passengerCases, setPassengerCases] = useState<CaseListRow[] | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);
  const isLoggedInPassenger = auth?.user?.role === "Passenger";

  const shouldShowCurrentStepErrors =
    revealedErrors[wizard.currentStep]
    || (
      hasStepInteraction(wizard.currentStep, wizard.draft)
      && !wizard.stepValidity[wizard.currentStep].isValid
    );
  const currentStepErrors = shouldShowCurrentStepErrors
    ? wizard.stepValidity[wizard.currentStep].errors
    : {};

  useEffect(() => {
    if (!isLoggedInPassenger) {
      setPassengerCases(null);
      setCasesError(null);
      setShowNewCaseForm(false);
      return;
    }

    let cancelled = false;
    fetchCaseList()
      .then((result) => {
        if (!cancelled) {
          setPassengerCases(result);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }

        if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
          setCasesError("You do not have access to your cases right now.");
          return;
        }

        setCasesError("Unable to load your cases right now.");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedInPassenger, successfulResponse]);

  useEffect(() => {
    if (!isLoggedInPassenger || !currentUser || !showNewCaseForm) {
      return;
    }

    const { firstName, lastName } = splitDisplayName(currentUser.name);
    wizard.setStepData("passengerDetails", (current) => ({
      ...current,
      firstName: current.firstName || firstName,
      lastName: current.lastName || lastName,
      email: current.email || currentUser.email,
    }));
  }, [currentUser, isLoggedInPassenger, showNewCaseForm]);

  function revealCurrentStepErrors() {
    setRevealedErrors((current) => ({ ...current, [wizard.currentStep]: true }));
  }

  function handleStepSelection(stepId: string) {
    setSuccessfulResponse(null);
    wizard.goToStep(stepId as CaseEntryWizardStepId);
  }

  function handleNext() {
    if (!wizard.canGoNext) {
      revealCurrentStepErrors();
      return;
    }

    setSuccessfulResponse(null);
    wizard.goNext();
  }

  function handleBack() {
    setSuccessfulResponse(null);
    wizard.goBack();
  }

  async function handleSubmit() {
    revealCurrentStepErrors();
    const response = await wizard.submit();
    if (response) {
      setSuccessfulResponse(response);
      setRevealedErrors({});
      wizard.reset();
    }
  }

  function handleStartNewCase() {
    setSuccessfulResponse(null);
    setShowNewCaseForm(true);
  }

  function renderActiveStep() {
    switch (wizard.currentStep) {
      case "itinerary":
        return (
          <ItineraryStep
            compensationPreview={wizard.draft.compensationPreview}
            errors={currentStepErrors}
            itinerary={wizard.draft.itinerary}
            onAddConnectingFlight={wizard.addConnectingFlight}
            onCompensationPreviewChange={wizard.setCompensationPreview}
            onDepartureAirportChange={(airport) =>
              wizard.setStepData("itinerary", (current) => ({
                ...current,
                departureAirport: airport,
              }))
            }
            onDestinationAirportChange={(airport) =>
              wizard.setStepData("itinerary", (current) => ({
                ...current,
                destinationAirport: airport,
              }))
            }
            onProblemFlightChange={wizard.setProblemFlight}
            onRemoveConnectingFlight={wizard.removeConnectingFlight}
            onUpdateConnectingFlight={wizard.updateConnectingFlight}
          />
        );
      case "disruptionDetails":
        return (
          <DisruptionDetailsStep
            disruptionDetails={wizard.draft.disruptionDetails}
            errors={currentStepErrors}
            onChange={(field, value) =>
              wizard.setStepData("disruptionDetails", (current) => ({
                ...current,
                [field]: value,
              }))
            }
            onTypeChange={(newType) =>
              wizard.setStepData("disruptionDetails", () => ({
                disruptionType: newType,
                cancellationNoticeTiming: null,
                finalArrivalOutcome: null,
                gaveUpSeatVoluntarily: null,
                deniedBoardingReason: null,
              }))
            }
          />
        );
      case "disruptionMotive":
        return (
          <DisruptionMotiveStep
            disruptionType={wizard.draft.disruptionDetails.disruptionType}
            disruptionMotive={wizard.draft.disruptionMotive}
            errors={currentStepErrors}
            onChange={(field, value) =>
              wizard.setStepData("disruptionMotive", (current) => ({
                ...current,
                [field]: value,
              }))
            }
          />
        );
      case "compliance":
        return (
          <ComplianceStep
            compliance={wizard.draft.compliance}
            errors={currentStepErrors}
            onChange={(field, value) =>
              wizard.setStepData("compliance", (current) => ({
                ...current,
                [field]: value,
              }))
            }
          />
        );
      case "flightDetails":
        return (
          <FlightDetailsStep
            errors={currentStepErrors}
            flightDetails={wizard.draft.flightDetails}
            onChange={(field, value) =>
              wizard.setStepData("flightDetails", (current) => ({
                ...current,
                [field]: value,
              }))
            }
          />
        );
      case "passengerDetails":
        return (
          <PassengerDetailsStep
            errors={currentStepErrors}
            passengerDetails={wizard.draft.passengerDetails}
            onChange={(field, value) =>
              wizard.setStepData("passengerDetails", (current) => ({
                ...current,
                [field]: value,
              }))
            }
          />
        );
      case "documents":
        return (
          <DocumentsStep
            documents={wizard.draft.documents}
            errors={currentStepErrors}
            onFileChange={(field, file) =>
              wizard.setStepData("documents", (current) => ({
                ...current,
                [field]: { file },
              }))
            }
          />
        );
      case "review":
        return (
          <ReviewSubmitStep
            draft={wizard.draft}
            formatAirport={formatAirport}
            formatConsent={formatConsent}
            onSubmit={handleSubmit}
            submitState={wizard.submitState}
          />
        );
      default:
        return null;
    }
  }

  const frameMeta = activeStepMeta[wizard.currentStep];
  const showNavigation = wizard.currentStep !== "review";
  const showBackButton = wizard.canGoBack;
  const shouldShowCaseForm = !isLoggedInPassenger || showNewCaseForm;
  const stepRailItems: StepRailItem[] = wizard.steps.map((step, index) => ({
    id: step,
    index,
    label: activeStepMeta[step].label,
    title: activeStepMeta[step].title,
    status:
      index < wizard.currentStepIndex
        ? "complete"
        : index === wizard.currentStepIndex
          ? "current"
          : "upcoming",
  }));

  return (
    <main className="case-entry-page">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="case-entry-frame wizard-shell"
        initial={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="case-entry-hero wizard-hero">
          <SessionActions />
          {isLoggedInPassenger ? (
            <section className="passenger-case-overview" aria-labelledby="my-cases-title">
              <div className="new-user-heading-row">
                <div>
                  <p className="eyebrow">Passenger portal</p>
                  <h2 id="my-cases-title">My Cases</h2>
                </div>
                <div className="new-user-heading-actions">
                  <button className="primary-button" onClick={handleStartNewCase} type="button">
                    Create New Case
                  </button>
                </div>
              </div>
              {passengerCases === null && casesError === null ? <p role="status">Loading your cases...</p> : null}
              {casesError ? <div className="notice-banner notice-banner-error" role="alert">{casesError}</div> : null}
              {passengerCases && passengerCases.length === 0 ? (
                <div className="notice-banner" role="status">You do not have any cases yet.</div>
              ) : null}
              {passengerCases && passengerCases.length > 0 ? (
                <div className="user-list-table-shell">
                  <table className="user-list-table">
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Case Date</th>
                        <th scope="col">Flight Number</th>
                        <th scope="col">Flight Date</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passengerCases.map((row) => (
                        <tr key={row.id}>
                          <td>{row.id}</td>
                          <td>{row.caseDate}</td>
                          <td>{row.flightNumber}</td>
                          <td>{row.flightDate ?? "-"}</td>
                          <td>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
          {shouldShowCaseForm ? (
            <>
              <header className="case-entry-header">
                <h1>Start your flight compensation request</h1>
                <p className="eyebrow">
                  Step {wizard.currentStepIndex + 1} of {wizard.steps.length}
                </p>
              </header>

              <div className="wizard-flow-layout">
                <StepRail items={stepRailItems} onSelect={handleStepSelection} />

                <div className="wizard-flow-content">
                <StepFrame
                  description={frameMeta.description}
                  label={frameMeta.label}
                  title={frameMeta.title}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="step-stage"
                      initial={{ opacity: 0, y: 18 }}
                      key={wizard.currentStep}
                      transition={{ duration: 0.26, ease: "easeOut" }}
                    >
                      {renderActiveStep()}
                    </motion.div>
                  </AnimatePresence>

                  {wizard.submitState.status === "error" && (
                    <SubmitErrorBanner error={wizard.submitState.error} />
                  )}

                  {(wizard.submitState.status === "success" || successfulResponse) && (
                    <SubmitSuccessBanner submitState={wizard.submitState} fallbackResponse={successfulResponse} />
                  )}

                  {(showNavigation || showBackButton) && (
                    <div className="wizard-nav">
                      <button
                        className="secondary-button"
                        disabled={!showBackButton}
                        onClick={handleBack}
                        type="button"
                      >
                        Back
                      </button>

                      {showNavigation && (
                        <button
                          className="primary-button"
                          disabled={!wizard.canGoNext}
                          onClick={handleNext}
                          type="button"
                        >
                          Continue to next step
                        </button>
                      )}
                    </div>
                  )}
                </StepFrame>
              </div>
              </div>
            </>
          ) : (
            <div className="notice-banner" role="status">
              Select one of your existing cases above or click Create New Case to start another request.
            </div>
          )}
        </div>
      </motion.section>
    </main>
  );
}

function SubmitErrorBanner({ error }: { error: CaseEntrySubmitError | null }) {
  if (!error) {
    return null;
  }

  const validationEntries = Object.entries(error.validationErrors).filter(
    ([path]) => path !== "general",
  );

  return (
    <div className="notice-banner notice-banner-error" role="alert">
      <strong>{error.message}</strong>
      {validationEntries.length > 0 && (
        <ul>
          {validationEntries.map(([path, messages]) => (
            <li key={path}>
              {formatValidationErrorLabel(path)}: {messages.join(" ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmitSuccessBanner({
  submitState,
  fallbackResponse,
}: {
  submitState: CaseEntrySubmitState;
  fallbackResponse: CaseEntrySubmitResponse | null;
}) {
  const response = submitState.response ?? fallbackResponse;
  const message = response?.message;
  const status = response?.status;
  const reference = response?.caseId ?? response?.publicCaseReference ?? response?.id;

  return (
    <div className="notice-banner notice-banner-success" role="status">
      <strong>Case submitted successfully.</strong>
      {message ? ` ${String(message)}` : ""}
      {status ? ` Status: ${String(status)}.` : ""}
      {reference ? ` Case ID: ${String(reference)}.` : ""}
    </div>
  );
}

