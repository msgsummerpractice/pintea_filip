import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

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

const activeStepMeta: Record<CaseEntryWizardStepId, ActiveStepMeta> = {
  itinerary: {
    label: "Step 1",
    title: "Build the itinerary",
    description: "Capture the airports, the affected route, and any connecting flights tied to the disruption.",
  },
  disruptionDetails: {
    label: "Step 2",
    title: "Describe the disruption",
    description: "Select the type of disruption you experienced and answer the follow-up questions.",
  },
  disruptionMotive: {
    label: "Step 3",
    title: "Disruption motive",
    description: "Provide details about the airline's stated reason and describe the incident.",
  },
  compliance: {
    label: "Step 4",
    title: "Confirm consent",
    description: "Record the passenger's GDPR permissions before personal and document details are collected.",
  },
  flightDetails: {
    label: "Step 5",
    title: "Add primary flight details",
    description: "Enter the main reservation and scheduled timing that anchors the compensation case.",
  },
  passengerDetails: {
    label: "Step 6",
    title: "Capture passenger details",
    description: "Store the contact identity used for airline outreach and case tracking.",
  },
  documents: {
    label: "Step 7",
    title: "Upload proof documents",
    description: "Attach the boarding pass and the identification document required by intake review.",
  },
  review: {
    label: "Step 8",
    title: "Review and submit",
    description: "Confirm the collected information and submit.",
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

export function CaseEntryPage({ initialDraft, submitter }: CaseEntryPageProps = {}) {
  const wizard = useCaseEntryWizard({ initialDraft, submitter });
  const [revealedErrors, setRevealedErrors] = useState<Record<string, boolean>>({});

  const shouldShowCurrentStepErrors =
    revealedErrors[wizard.currentStep]
    || (
      hasStepInteraction(wizard.currentStep, wizard.draft)
      && !wizard.stepValidity[wizard.currentStep].isValid
    );
  const currentStepErrors = shouldShowCurrentStepErrors
    ? wizard.stepValidity[wizard.currentStep].errors
    : {};

  function revealCurrentStepErrors() {
    setRevealedErrors((current) => ({ ...current, [wizard.currentStep]: true }));
  }

  function handleStepSelection(stepId: string) {
    wizard.goToStep(stepId as CaseEntryWizardStepId);
  }

  function handleNext() {
    if (!wizard.canGoNext) {
      revealCurrentStepErrors();
      return;
    }

    wizard.goNext();
  }

  function handleBack() {
    wizard.goBack();
  }

  async function handleSubmit() {
    revealCurrentStepErrors();
    await wizard.submit();
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

  return (
    <main className="case-entry-page">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="case-entry-frame wizard-shell"
        initial={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="case-entry-hero wizard-hero">
          <header className="case-entry-header">
            <h1>Start your compensation case</h1>
            <p className="eyebrow">
              Step {wizard.currentStepIndex + 1} of {wizard.steps.length}
            </p>
          </header>

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

            {showNavigation && !wizard.canGoNext && shouldShowCurrentStepErrors && (
              <StepGuidanceBanner errors={currentStepErrors} />
            )}

            {wizard.submitState.status === "success" && (
              <SubmitSuccessBanner submitState={wizard.submitState} />
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

function SubmitSuccessBanner({ submitState }: { submitState: CaseEntrySubmitState }) {
  const message = submitState.response?.message;
  const status = submitState.response?.status;
  const reference = submitState.response?.caseId ?? submitState.response?.publicCaseReference ?? submitState.response?.id;

  return (
    <div className="notice-banner notice-banner-success" role="status">
      <strong>Case submitted successfully.</strong>
      {message ? ` ${String(message)}` : ""}
      {status ? ` Status: ${String(status)}.` : ""}
      {reference ? ` Case ID: ${String(reference)}.` : ""}
    </div>
  );
}

function StepGuidanceBanner({ errors }: { errors: Record<string, string[]> }) {
  const validationEntries = Object.entries(errors).filter(([path]) => path !== "general" && path !== "root");

  if (validationEntries.length === 0) {
    return null;
  }

  return (
    <div className="notice-banner" role="status">
      <strong>Complete the highlighted fields to continue.</strong>
      <ul>
        {validationEntries.map(([path, messages]) => (
          <li key={path}>
            {formatValidationErrorLabel(path)}: {messages.join(" ")}
          </li>
        ))}
      </ul>
    </div>
  );
}