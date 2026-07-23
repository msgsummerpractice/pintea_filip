import { requestJson } from "../../lib/http";
import {
  caseEntryDraftSchema,
  type ValidatedCaseEntryDraft,
} from "./schema";
import type {
  AirportOption,
  CaseEntryDraft,
  CaseEntrySubmitError,
  CaseEntryMultipartPayload,
  CaseEntryPayload,
  CaseEntrySubmitResponse,
} from "./types";

interface AirportSearchResponse {
  results: Array<{
    code: string;
    name: string;
    city: string;
    country: string;
    display_label: string;
  }>;
}

function mapAirportOption(option: AirportSearchResponse["results"][number]): AirportOption {
  return {
    code: option.code,
    name: option.name,
    city: option.city,
    country: option.country,
    displayLabel: option.display_label,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectValidationErrors(
  value: unknown,
  path: string[],
  validationErrors: Record<string, string[]>,
) {
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      const key = path.join(".") || "general";
      validationErrors[key] = value;
      return;
    }

    value.forEach((entry, index) => {
      collectValidationErrors(entry, [...path, String(index)], validationErrors);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (key === "detail") {
      return;
    }

    const nextPath = key === "payload" ? path : [...path, key];
    collectValidationErrors(nestedValue, nextPath, validationErrors);
  });
}

function extractErrorMessage(error: unknown, validationErrors: Record<string, string[]>): string {
  if (isRecord(error)) {
    if (typeof error.detail === "string") {
      return error.detail;
    }

    if (typeof error.message === "string") {
      return error.message;
    }
  }

  if (validationErrors.general?.length) {
    return validationErrors.general[0];
  }

  return "Unable to submit the case.";
}

export function normalizeCaseEntrySubmitError(error: unknown): CaseEntrySubmitError {
  const errorSource =
    error instanceof Error && "body" in error
      ? (error as Error & { body?: unknown }).body ?? error
      : error;
  const validationErrors: Record<string, string[]> = {};

  collectValidationErrors(errorSource, [], validationErrors);

  return {
    message:
      error instanceof Error
        ? extractErrorMessage(errorSource, validationErrors) || error.message
        : extractErrorMessage(errorSource, validationErrors),
    validationErrors,
  };
}

export async function searchAirports(query: string): Promise<AirportOption[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const response = await requestJson<AirportSearchResponse>(
    `/airports/search?q=${encodeURIComponent(normalizedQuery)}`,
  );

  return response.results.map(mapAirportOption);
}

export function buildCaseEntryPayload(draft: ValidatedCaseEntryDraft): CaseEntryPayload {
  return {
    reservationNumber: draft.flightDetails.reservationNumber,
    gdprConsentPrimary: draft.compliance.gdprConsentPrimary,
    gdprConsentSecondary: draft.compliance.gdprConsentSecondary,
    passenger: { ...draft.passengerDetails },
    itinerary: {
      departureAirport: draft.itinerary.departureAirport,
      destinationAirport: draft.itinerary.destinationAirport,
      primaryFlight: {
        flightDate: draft.flightDetails.flightDate,
        flightNumber: draft.flightDetails.flightNumber,
        airline: draft.flightDetails.airline,
        plannedDepartureTime: draft.flightDetails.plannedDepartureTime,
        plannedArrivalTime: draft.flightDetails.plannedArrivalTime,
      },
      connectingFlights: draft.itinerary.connectingFlights,
      problemFlightId: draft.itinerary.problemFlightId,
    },
  };
}

export function buildCaseEntryMultipartPayload(
  draft: CaseEntryDraft,
): CaseEntryMultipartPayload {
  const validatedDraft = caseEntryDraftSchema.parse(draft);

  return {
    payload: buildCaseEntryPayload(validatedDraft),
    boardingPass: validatedDraft.documents.boardingPass.file,
    identification: validatedDraft.documents.identification.file,
  };
}

export function buildCaseEntryFormData(draft: CaseEntryDraft): FormData {
  const multipartPayload = buildCaseEntryMultipartPayload(draft);
  const formData = new FormData();

  formData.append("payload", JSON.stringify(multipartPayload.payload));
  formData.append("boarding_pass", multipartPayload.boardingPass);
  formData.append("identification", multipartPayload.identification);

  return formData;
}

export async function submitCaseEntry(
  draft: CaseEntryDraft,
): Promise<CaseEntrySubmitResponse> {
  return requestJson<CaseEntrySubmitResponse>("/cases/", {
    method: "POST",
    body: buildCaseEntryFormData(draft),
  });
}