export const CASE_ENTRY_WIZARD_STEPS = [
  "itinerary",
  "compliance",
  "flightDetails",
  "passengerDetails",
  "documents",
  "review",
] as const;

export type CaseEntryWizardStepId = (typeof CASE_ENTRY_WIZARD_STEPS)[number];

export interface AirportOption {
  code: string;
  name: string;
  city: string;
  country: string;
  displayLabel: string;
}

export interface CompensationPreview {
  distanceKm: number;
  compensationEur: number;
}

export interface FlightLegInput {
  flightDate: string;
  flightNumber: string;
  airline: string;
  departureAirport: AirportOption | null;
  destinationAirport: AirportOption | null;
  plannedDepartureTime: string;
  plannedArrivalTime: string;
}

export interface ConnectingFlightInput extends FlightLegInput {
  id: string;
}

export interface ItineraryInput {
  departureAirport: AirportOption | null;
  destinationAirport: AirportOption | null;
  connectingFlights: ConnectingFlightInput[];
  problemFlightId: string | null;
}

export interface FlightDetailsInput {
  flightDate: string;
  flightNumber: string;
  airline: string;
  reservationNumber: string;
  plannedDepartureTime: string;
  plannedArrivalTime: string;
}

export interface PassengerDetailsInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
}

export interface ConsentState {
  gdprConsentPrimary: boolean | null;
  gdprConsentSecondary: boolean | null;
}

export interface UploadField {
  file: File | null;
}

export interface DocumentsInput {
  boardingPass: UploadField;
  identification: UploadField;
}

export interface CaseEntryDraft {
  itinerary: ItineraryInput;
  compliance: ConsentState;
  flightDetails: FlightDetailsInput;
  passengerDetails: PassengerDetailsInput;
  documents: DocumentsInput;
  compensationPreview: CompensationPreview | null;
}

export interface CaseEntryPayload {
  reservationNumber: string;
  gdprConsentPrimary: boolean;
  gdprConsentSecondary: boolean;
  passenger: PassengerDetailsInput;
  itinerary: {
    departureAirport: AirportOption;
    destinationAirport: AirportOption;
    primaryFlight: {
      flightDate: string;
      flightNumber: string;
      airline: string;
      plannedDepartureTime: string;
      plannedArrivalTime: string;
    };
    connectingFlights: ConnectingFlightInput[];
    problemFlightId: string | null;
  };
}

export interface CaseEntryMultipartPayload {
  payload: CaseEntryPayload;
  boardingPass: File;
  identification: File;
}

export interface CaseEntrySubmitResponse {
  id?: number | string;
  status?: string;
  message?: string;
  publicCaseReference?: string | null;
  compensation?: {
    distance_km: number;
    compensation_eur: number;
  };
  [key: string]: unknown;
}

export interface CaseEntrySubmitError {
  message: string;
  validationErrors: Record<string, string[]>;
}

export function createDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyConnectingFlight(): ConnectingFlightInput {
  return {
    id: createDraftId(),
    flightDate: "",
    flightNumber: "",
    airline: "",
    departureAirport: null,
    destinationAirport: null,
    plannedDepartureTime: "",
    plannedArrivalTime: "",
  };
}

export function createEmptyCaseEntryDraft(): CaseEntryDraft {
  return {
    itinerary: {
      departureAirport: null,
      destinationAirport: null,
      connectingFlights: [],
      problemFlightId: null,
    },
    compliance: {
      gdprConsentPrimary: null,
      gdprConsentSecondary: null,
    },
    flightDetails: {
      flightDate: "",
      flightNumber: "",
      airline: "",
      reservationNumber: "",
      plannedDepartureTime: "",
      plannedArrivalTime: "",
    },
    passengerDetails: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
    },
    documents: {
      boardingPass: { file: null },
      identification: { file: null },
    },
    compensationPreview: null,
  };
}