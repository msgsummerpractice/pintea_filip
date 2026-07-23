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
import { DocumentsStep } from "./steps/DocumentsStep";
import { FlightDetailsStep } from "./steps/FlightDetailsStep";
import { ItineraryStep } from "./steps/ItineraryStep";
import { LockedDisruptionStep } from "./steps/LockedDisruptionStep";
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

interface LockedStepMeta {
  id: string;
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
  compliance: {
    label: "Step 2",
    title: "Confirm consent",
    description: "Record the passenger's GDPR permissions before personal and document details are collected.",
  },
  flightDetails: {
    label: "Step 3",
    title: "Add primary flight details",
    description: "Enter the main reservation and scheduled timing that anchors the compensation case.",
  },
  passengerDetails: {
    label: "Step 4",
    title: "Capture passenger details",
    description: "Store the contact identity used for airline outreach and case tracking.",
  },
  documents: {
    label: "Step 5",
    title: "Upload proof documents",
    description: "Attach the boarding pass and the identification document required by intake review.",
  },
  review: {
    label: "Step 6",
    title: "Review and submit",
    description: "Confirm the collected information, submit the Story 1 payload, and preview upcoming disruption work.",
  },
};

const lockedSteps: LockedStepMeta[] = [
  {
    id: "disruptionEvidence",
    label: "CASE_03",
    title: "Disruption evidence",
    description: "Delay, cancellation, missed connection, and airline-event capture will unlock here in the next story.",
  },
  {
    id: "disruptionResolution",
    label: "CASE_03",
    title: "Resolution path",
    description: "Compensation reasoning, escalation branching, and airline response handling stay read-only in Story 1.",
  },
];

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

function isLockedStepId(stepId: string): boolean {
  return lockedSteps.some((step) => step.id === stepId);
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
  const [lockedPreviewStepId, setLockedPreviewStepId] = useState<string | null>(null);
  const [revealedErrors, setRevealedErrors] = useState<Record<string, boolean>>({});

  const canPreviewLockedSteps =
    wizard.currentStep === "review" && wizard.stepValidity.review.isValid;
  const visibleStepId = lockedPreviewStepId ?? wizard.currentStep;
  const visibleLockedStep = lockedSteps.find((step) => step.id === lockedPreviewStepId) ?? null;
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

  function clearLockedPreview() {
    setLockedPreviewStepId(null);
  }

  function handleStepSelection(stepId: string) {
    if (isLockedStepId(stepId)) {
      if (canPreviewLockedSteps) {
        setLockedPreviewStepId(stepId);
      }

      return;
    }

    clearLockedPreview();
    wizard.goToStep(stepId as CaseEntryWizardStepId);
  }

  function handleNext() {
    if (!wizard.canGoNext) {
      revealCurrentStepErrors();
      return;
    }

    clearLockedPreview();
    wizard.goNext();
  }

  function handleBack() {
    if (lockedPreviewStepId) {
      clearLockedPreview();
      wizard.goToStep("review");
      return;
    }

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
            canPreviewLockedSteps={canPreviewLockedSteps}
            draft={wizard.draft}
            formatAirport={formatAirport}
            formatConsent={formatConsent}
            onPreviewLockedStep={() => setLockedPreviewStepId(lockedSteps[0].id)}
            onSubmit={handleSubmit}
            submitState={wizard.submitState}
          />
        );
      default:
        return null;
    }
  }

  const frameMeta = visibleLockedStep
    ? {
        label: visibleLockedStep.label,
        title: visibleLockedStep.title,
        description: visibleLockedStep.description,
      }
    : activeStepMeta[wizard.currentStep];

  const showNavigation = !visibleLockedStep && wizard.currentStep !== "review";
  const showBackButton = wizard.canGoBack || visibleLockedStep !== null;

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
                key={visibleStepId}
                transition={{ duration: 0.26, ease: "easeOut" }}
              >
                {visibleLockedStep ? (
                  <LockedDisruptionStep step={visibleLockedStep} />
                ) : (
                  renderActiveStep()
                )}
              </motion.div>
            </AnimatePresence>

            {!visibleLockedStep && wizard.submitState.status === "error" && (
              <SubmitErrorBanner error={wizard.submitState.error} />
            )}

            {!visibleLockedStep && showNavigation && !wizard.canGoNext && shouldShowCurrentStepErrors && (
              <StepGuidanceBanner errors={currentStepErrors} />
            )}

            {!visibleLockedStep && wizard.submitState.status === "success" && (
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
                  {visibleLockedStep ? "Back to review" : "Back"}
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
  const reference = submitState.response?.publicCaseReference;

  return (
    <div className="notice-banner notice-banner-success" role="status">
      <strong>Case submitted successfully.</strong>
      {message ? ` ${String(message)}` : ""}
      {status ? ` Status: ${String(status)}.` : ""}
      {reference ? ` Reference: ${String(reference)}.` : ""}
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