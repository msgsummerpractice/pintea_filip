import { useState } from "react";

import { normalizeCaseEntrySubmitError, submitCaseEntry } from "../api";
import {
  getCaseEntryStepValidity,
  validateCaseEntryStep,
} from "../schema";
import {
  CASE_ENTRY_WIZARD_STEPS,
  createEmptyCaseEntryDraft,
  createEmptyConnectingFlight,
  type CaseEntryDraft,
  type CaseEntrySubmitError,
  type CaseEntrySubmitResponse,
  type CaseEntryWizardStepId,
  type CompensationPreview,
  type ConnectingFlightInput,
} from "../types";

type DraftUpdate = CaseEntryDraft | ((currentDraft: CaseEntryDraft) => CaseEntryDraft);
type Submitter = (draft: CaseEntryDraft) => Promise<CaseEntrySubmitResponse>;

export interface CaseEntryWizardOptions {
  initialDraft?: CaseEntryDraft;
  submitter?: Submitter;
}

export interface CaseEntrySubmitState {
  status: "idle" | "submitting" | "success" | "error";
  response: CaseEntrySubmitResponse | null;
  error: CaseEntrySubmitError | null;
}

const initialSubmitState: CaseEntrySubmitState = {
  status: "idle",
  response: null,
  error: null,
};

function getStepIndex(step: CaseEntryWizardStepId): number {
  return CASE_ENTRY_WIZARD_STEPS.indexOf(step);
}

export function useCaseEntryWizard(options: CaseEntryWizardOptions = {}) {
  const [draft, setDraftState] = useState<CaseEntryDraft>(
    options.initialDraft ?? createEmptyCaseEntryDraft(),
  );
  const [currentStep, setCurrentStep] = useState<CaseEntryWizardStepId>("itinerary");
  const [submitState, setSubmitState] = useState<CaseEntrySubmitState>(initialSubmitState);

  const stepValidity = getCaseEntryStepValidity(draft);
  const currentStepIndex = getStepIndex(currentStep);
  const currentStepValidation = stepValidity[currentStep];
  const completedSteps = CASE_ENTRY_WIZARD_STEPS.filter(
    (step, index) => index < currentStepIndex && stepValidity[step].isValid,
  );
  const canGoBack = currentStepIndex > 0;
  const canGoNext =
    currentStepIndex < CASE_ENTRY_WIZARD_STEPS.length - 1 && currentStepValidation.isValid;

  function resetSubmitState() {
    setSubmitState((currentState) =>
      currentState.status === "submitting" ? currentState : initialSubmitState,
    );
  }

  function setDraft(update: DraftUpdate) {
    resetSubmitState();
    setDraftState((currentDraft) =>
      typeof update === "function" ? update(currentDraft) : update,
    );
  }

  function setStepData<TKey extends keyof CaseEntryDraft>(
    section: TKey,
    value:
      | CaseEntryDraft[TKey]
      | ((currentValue: CaseEntryDraft[TKey]) => CaseEntryDraft[TKey]),
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [section]:
        typeof value === "function"
          ? (value as (currentValue: CaseEntryDraft[TKey]) => CaseEntryDraft[TKey])(
              currentDraft[section],
            )
          : value,
    }));
  }

  function addConnectingFlight() {
    setStepData("itinerary", (currentItinerary) => {
      if (currentItinerary.connectingFlights.length >= 4) {
        return currentItinerary;
      }

      return {
        ...currentItinerary,
        connectingFlights: [...currentItinerary.connectingFlights, createEmptyConnectingFlight()],
      };
    });
  }

  function updateConnectingFlight(
    flightId: string,
    updater:
      | ConnectingFlightInput
      | ((currentFlight: ConnectingFlightInput) => ConnectingFlightInput),
  ) {
    setStepData("itinerary", (currentItinerary) => ({
      ...currentItinerary,
      connectingFlights: currentItinerary.connectingFlights.map((flight) => {
        if (flight.id !== flightId) {
          return flight;
        }

        return typeof updater === "function" ? updater(flight) : updater;
      }),
    }));
  }

  function removeConnectingFlight(flightId: string) {
    setStepData("itinerary", (currentItinerary) => ({
      ...currentItinerary,
      connectingFlights: currentItinerary.connectingFlights.filter((flight) => flight.id !== flightId),
      problemFlightId:
        currentItinerary.problemFlightId === flightId ? null : currentItinerary.problemFlightId,
    }));
  }

  function setProblemFlight(problemFlightId: string | null) {
    setStepData("itinerary", (currentItinerary) => ({
      ...currentItinerary,
      problemFlightId,
    }));
  }

  function goToStep(targetStep: CaseEntryWizardStepId): boolean {
    const targetIndex = getStepIndex(targetStep);
    if (targetIndex <= currentStepIndex) {
      setCurrentStep(targetStep);
      return true;
    }

    for (let index = 0; index < targetIndex; index += 1) {
      const step = CASE_ENTRY_WIZARD_STEPS[index];
      const validation = validateCaseEntryStep(step, draft);
      if (!validation.isValid) {
        setCurrentStep(step);
        return false;
      }
    }

    setCurrentStep(targetStep);
    return true;
  }

  function goNext(): boolean {
    if (!currentStepValidation.isValid || currentStepIndex >= CASE_ENTRY_WIZARD_STEPS.length - 1) {
      return false;
    }

    setCurrentStep(CASE_ENTRY_WIZARD_STEPS[currentStepIndex + 1]);
    return true;
  }

  function goBack(): boolean {
    if (!canGoBack) {
      return false;
    }

    setCurrentStep(CASE_ENTRY_WIZARD_STEPS[currentStepIndex - 1]);
    return true;
  }

  async function submit(): Promise<CaseEntrySubmitResponse | null> {
    const firstInvalidStep = CASE_ENTRY_WIZARD_STEPS.find(
      (step) => !stepValidity[step].isValid,
    );
    if (firstInvalidStep) {
      setCurrentStep(firstInvalidStep);
      setSubmitState({
        status: "error",
        response: null,
        error: {
          message: "Please fix the validation errors before submitting.",
          validationErrors: {},
        },
      });
      return null;
    }

    setSubmitState({ status: "submitting", response: null, error: null });

    try {
      const response = await (options.submitter ?? submitCaseEntry)(draft);
      setSubmitState({ status: "success", response, error: null });
      return response;
    } catch (error) {
      setSubmitState({
        status: "error",
        response: null,
        error: normalizeCaseEntrySubmitError(error),
      });
      return null;
    }
  }

  function setCompensationPreview(preview: CompensationPreview | null) {
    setDraftState((currentDraft) => ({
      ...currentDraft,
      compensationPreview: preview,
    }));
  }

  function reset() {
    setDraftState(createEmptyCaseEntryDraft());
    setCurrentStep("itinerary");
    setSubmitState(initialSubmitState);
  }

  return {
    draft,
    setDraft,
    setStepData,
    currentStep,
    currentStepIndex,
    steps: CASE_ENTRY_WIZARD_STEPS,
    stepValidity,
    completedSteps,
    canGoBack,
    canGoNext,
    goBack,
    goNext,
    goToStep,
    addConnectingFlight,
    updateConnectingFlight,
    removeConnectingFlight,
    setProblemFlight,
    setCompensationPreview,
    submit,
    submitState,
    reset,
  };
}