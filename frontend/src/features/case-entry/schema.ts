import { z } from "zod";

import {
  CASE_ENTRY_WIZARD_STEPS,
  type CaseEntryDraft,
  type CaseEntryWizardStepId,
} from "./types";

export const MAX_CONNECTING_FLIGHTS = 4;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = ["pdf", "jpg", "jpeg"] as const;
export const PHONE_PATTERN = /^\+?[0-9().\-\s]{7,20}$/;

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const isoDateSchema = requiredText("Date").refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  "Use a valid date.",
);

const timeSchema = requiredText("Time").refine(
  (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
  "Use a valid time.",
);

function normalizeDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
    return null;
  }

  const combined = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(combined.getTime()) ? null : combined;
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop() ?? "";
  return extension.toLowerCase();
}

export const airportOptionSchema = z.object({
  code: requiredText("Airport code"),
  name: requiredText("Airport name"),
  city: requiredText("Airport city"),
  country: requiredText("Airport country"),
  displayLabel: requiredText("Airport selection"),
});

export const connectingFlightSchema = z.object({
  id: requiredText("Connecting flight"),
  flightDate: isoDateSchema,
  flightNumber: requiredText("Connecting flight number"),
  airline: requiredText("Connecting airline"),
  departureAirport: airportOptionSchema,
  destinationAirport: airportOptionSchema,
  plannedDepartureTime: timeSchema,
  plannedArrivalTime: timeSchema,
}).superRefine((value, context) => {
  const departureDateTime = combineDateAndTime(value.flightDate, value.plannedDepartureTime);
  const arrivalDateTime = combineDateAndTime(value.flightDate, value.plannedArrivalTime);

  if (!departureDateTime || !arrivalDateTime) {
    return;
  }

  if (arrivalDateTime <= departureDateTime) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Planned arrival time must be after planned departure time.",
      path: ["plannedArrivalTime"],
    });
  }
});

export const itinerarySchema = z
  .object({
    departureAirport: airportOptionSchema,
    destinationAirport: airportOptionSchema,
    connectingFlights: z.array(connectingFlightSchema).max(
      MAX_CONNECTING_FLIGHTS,
      `You can add up to ${MAX_CONNECTING_FLIGHTS} connecting flights.`,
    ),
    problemFlightId: z.string().nullable(),
  })
  .superRefine((value, context) => {
    const problemFlightCount = value.connectingFlights.filter(
      (flight) => flight.id === value.problemFlightId,
    ).length;

    if (value.connectingFlights.length > 0 && !value.problemFlightId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select the problem flight when connections exist.",
        path: ["problemFlightId"],
      });
    }

    if (value.connectingFlights.length > 0 && problemFlightCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one problem flight must be selected.",
        path: ["problemFlightId"],
      });
    }

    if (value.connectingFlights.length === 0 && value.problemFlightId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Problem flight selection is only allowed when connections exist.",
        path: ["problemFlightId"],
      });
    }
  });

export const disruptionDetailsSchema = z.object({
  disruptionType: z.enum(["cancellation", "delay", "denied_boarding"], {
    required_error: "Select a disruption type.",
    invalid_type_error: "Select a disruption type.",
  }),
  cancellationNoticeTiming: z.string().nullable(),
  delayArrivalOutcome: z.string().nullable(),
  gaveUpSeatVoluntarily: z.string().nullable(),
  deniedBoardingReason: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (data.disruptionType === "cancellation" && !data.cancellationNoticeTiming) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select when you were informed about the cancellation.",
      path: ["cancellationNoticeTiming"],
    });
  }
  if (data.disruptionType === "delay" && !data.delayArrivalOutcome) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select how late you arrived.",
      path: ["delayArrivalOutcome"],
    });
  }
  if (data.disruptionType === "denied_boarding" && !data.gaveUpSeatVoluntarily) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Answer whether you gave up your seat voluntarily.",
      path: ["gaveUpSeatVoluntarily"],
    });
  }
  if (
    data.disruptionType === "denied_boarding"
    && data.gaveUpSeatVoluntarily === "no"
    && !data.deniedBoardingReason
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select the reason for denial of boarding.",
      path: ["deniedBoardingReason"],
    });
  }
});

export const disruptionMotiveSchema = z.object({
  airlineMotiveKnown: z.string().nullable(),
  airlineMotive: z.string().nullable(),
  incidentDescription: z.string().trim().min(1, "Describe the incident.").max(1000, "Maximum 1000 characters."),
});

const disruptionMotiveStepSchema = z.object({
  disruptionDetails: z.object({ disruptionType: z.string().nullable() }),
  disruptionMotive: disruptionMotiveSchema,
}).superRefine((data, ctx) => {
  const type = data.disruptionDetails.disruptionType;
  if ((type === "cancellation" || type === "delay") && !data.disruptionMotive.airlineMotiveKnown) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Answer whether the airline mentioned a disruption motive.",
      path: ["disruptionMotive", "airlineMotiveKnown"],
    });
  }
  if (
    (type === "cancellation" || type === "delay")
    && data.disruptionMotive.airlineMotiveKnown === "yes"
    && !data.disruptionMotive.airlineMotive
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select the motive communicated by the airline.",
      path: ["disruptionMotive", "airlineMotive"],
    });
  }
});

export const complianceSchema = z.object({
  gdprConsentPrimary: z
    .boolean({ required_error: "Select a GDPR consent option." })
    .refine((value) => value, "GDPR consent is required to submit."),
  gdprConsentSecondary: z.boolean({ required_error: "Select a GDPR preference option." }),
});

export const flightDetailsSchema = z
  .object({
    flightDate: isoDateSchema,
    flightNumber: requiredText("Flight number"),
    airline: requiredText("Airline"),
    reservationNumber: requiredText("Reservation number"),
    plannedDepartureTime: timeSchema,
    plannedArrivalTime: timeSchema,
  })
  .superRefine((value, context) => {
    const departureDateTime = combineDateAndTime(value.flightDate, value.plannedDepartureTime);
    const arrivalDateTime = combineDateAndTime(value.flightDate, value.plannedArrivalTime);

    if (!departureDateTime || !arrivalDateTime) {
      return;
    }

    if (arrivalDateTime <= departureDateTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planned arrival time must be after planned departure time.",
        path: ["plannedArrivalTime"],
      });
    }
  });

export const passengerDetailsSchema = z.object({
  firstName: requiredText("First name"),
  lastName: requiredText("Last name"),
  dateOfBirth: isoDateSchema.refine((value) => {
    const parsedDate = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      return false;
    }

    return normalizeDate(parsedDate) < normalizeDate(new Date());
  }, "Date of birth must be earlier than today."),
  email: requiredText("Email").email("Use a valid email address."),
  phone: requiredText("Phone number").refine((value) => PHONE_PATTERN.test(value), "Use a valid phone number."),
  address: requiredText("Address"),
  postalCode: requiredText("Postal code"),
});

export const uploadFieldSchema = z.object({
  file: z
    .instanceof(File, { message: "A file is required." })
    .refine((file) => file.size <= MAX_UPLOAD_BYTES, "File size must be 5 MB or smaller.")
    .refine(
      (file) => ALLOWED_UPLOAD_EXTENSIONS.includes(getFileExtension(file.name) as (typeof ALLOWED_UPLOAD_EXTENSIONS)[number]),
      "Allowed file types are pdf, jpg, and jpeg.",
    ),
});

export const documentsSchema = z.object({
  boardingPass: uploadFieldSchema,
  identification: uploadFieldSchema,
});

export const caseEntryDraftSchema = z.object({
  itinerary: itinerarySchema,
  disruptionDetails: disruptionDetailsSchema,
  disruptionMotive: disruptionMotiveSchema,
  compliance: complianceSchema,
  flightDetails: flightDetailsSchema,
  passengerDetails: passengerDetailsSchema,
  documents: documentsSchema,
});

export type ValidatedCaseEntryDraft = z.infer<typeof caseEntryDraftSchema>;

export const caseEntryStepSchemas: Record<CaseEntryWizardStepId, z.ZodTypeAny> = {
  itinerary: z.object({ itinerary: itinerarySchema }),
  disruptionDetails: z.object({ disruptionDetails: disruptionDetailsSchema }),
  disruptionMotive: disruptionMotiveStepSchema,
  compliance: z.object({ compliance: complianceSchema }),
  flightDetails: z.object({ flightDetails: flightDetailsSchema }),
  passengerDetails: z.object({ passengerDetails: passengerDetailsSchema }),
  documents: z.object({ documents: documentsSchema }),
  review: caseEntryDraftSchema,
};

export interface StepValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
}

export function flattenZodIssues(issues: z.ZodIssue[]): Record<string, string[]> {
  return issues.reduce<Record<string, string[]>>((accumulator, issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "root";
    accumulator[key] ??= [];
    accumulator[key].push(issue.message);
    return accumulator;
  }, {});
}

export function validateCaseEntryStep(
  step: CaseEntryWizardStepId,
  draft: CaseEntryDraft,
): StepValidationResult {
  const result = caseEntryStepSchemas[step].safeParse(draft);
  if (result.success) {
    return { isValid: true, errors: {} };
  }

  return {
    isValid: false,
    errors: flattenZodIssues(result.error.issues),
  };
}

export function getCaseEntryStepValidity(
  draft: CaseEntryDraft,
): Record<CaseEntryWizardStepId, StepValidationResult> {
  return CASE_ENTRY_WIZARD_STEPS.reduce<Record<CaseEntryWizardStepId, StepValidationResult>>(
    (accumulator, step) => {
      accumulator[step] = validateCaseEntryStep(step, draft);
      return accumulator;
    },
    {} as Record<CaseEntryWizardStepId, StepValidationResult>,
  );
}