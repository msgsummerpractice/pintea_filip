import {
  MAX_CONNECTING_FLIGHTS,
  MAX_UPLOAD_BYTES,
  caseEntryDraftSchema,
  disruptionDetailsSchema,
  disruptionMotiveSchema,
} from "../schema";
import {
  createDraftId,
  createEmptyCaseEntryDraft,
  type AirportOption,
  type CaseEntryDraft,
} from "../types";

function buildAirport(code: string, city = "Bucharest"): AirportOption {
  return {
    code,
    name: `${city} Airport`,
    city,
    country: "Romania",
    displayLabel: `${city} - ${city} Airport (${code})`,
  };
}

function buildFile(name: string, sizeBytes = 512_000, type = "application/pdf"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function buildValidDraft(): CaseEntryDraft {
  const draft = createEmptyCaseEntryDraft();

  draft.itinerary = {
    departureAirport: buildAirport("OTP"),
    destinationAirport: buildAirport("LHR", "London"),
    connectingFlights: [
      {
        id: createDraftId(),
        flightDate: "2026-06-15",
        flightNumber: "RO101",
        airline: "Tarom",
        departureAirport: buildAirport("OTP"),
        destinationAirport: buildAirport("FRA", "Frankfurt"),
        plannedDepartureTime: "12:15",
        plannedArrivalTime: "14:00",
      },
    ],
    problemFlightId: null,
  };
  draft.itinerary.problemFlightId = draft.itinerary.connectingFlights[0].id;
  draft.disruptionDetails = {
    disruptionType: "cancellation",
    cancellationNoticeTiming: "<14 days",
    finalArrivalOutcome: "never arrived",
    gaveUpSeatVoluntarily: null,
    deniedBoardingReason: null,
  };
  draft.disruptionMotive = {
    airlineMotiveKnown: "no",
    airlineMotive: null,
    incidentDescription: "Flight was cancelled without notice.",
  };
  draft.compliance = {
    gdprConsentPrimary: true,
    gdprConsentSecondary: false,
  };
  draft.flightDetails = {
    flightDate: "2026-06-15",
    flightNumber: "RO384",
    airline: "Tarom",
    reservationNumber: "ABC123",
    plannedDepartureTime: "09:15",
    plannedArrivalTime: "11:45",
  };
  draft.passengerDetails = {
    firstName: "Ana",
    lastName: "Popescu",
    dateOfBirth: "1990-12-10",
    email: "ana@example.com",
    phone: "+40123456789",
    address: "Main Street 10",
    postalCode: "010101",
  };
  draft.documents = {
    boardingPass: { file: buildFile("boarding-pass.pdf") },
    identification: { file: buildFile("passport.jpg", 256_000, "image/jpeg") },
  };

  return draft;
}

describe("caseEntryDraftSchema", () => {
  test("accepts a valid story-1 draft", () => {
    const result = caseEntryDraftSchema.safeParse(buildValidDraft());

    expect(result.success).toBe(true);
  });

  test("rejects a date of birth that is not earlier than today", () => {
    const draft = buildValidDraft();
    draft.passengerDetails.dateOfBirth = new Date().toISOString().slice(0, 10);

    const result = caseEntryDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Date of birth must be earlier than today.",
    );
  });

  test("rejects more than four connecting flights", () => {
    const draft = buildValidDraft();
    draft.itinerary.connectingFlights = Array.from({ length: MAX_CONNECTING_FLIGHTS + 1 }, (_, index) => ({
      id: `${index + 1}`,
      flightDate: "2026-06-15",
      flightNumber: `RO10${index}`,
      airline: "Tarom",
      departureAirport: buildAirport("OTP"),
      destinationAirport: buildAirport(`X${index + 1}`, `City ${index + 1}`),
      plannedDepartureTime: "10:00",
      plannedArrivalTime: "12:00",
    }));
    draft.itinerary.problemFlightId = draft.itinerary.connectingFlights[0].id;

    const result = caseEntryDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      `You can add up to ${MAX_CONNECTING_FLIGHTS} connecting flights.`,
    );
  });

  test("requires exactly one problem flight when connections exist", () => {
    const draft = buildValidDraft();
    draft.itinerary.problemFlightId = "missing-flight";

    const result = caseEntryDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Exactly one problem flight must be selected.",
    );
  });

  test("rejects connecting flights whose arrival time is not after departure time", () => {
    const draft = buildValidDraft();
    draft.itinerary.connectingFlights[0].plannedArrivalTime = "11:00";

    const result = caseEntryDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Planned arrival time must be after planned departure time.",
    );
  });

  test("rejects unsupported file types and files larger than 5 MB", () => {
    const draft = buildValidDraft();
    draft.documents.boardingPass.file = buildFile("boarding-pass.png", 10, "image/png");
    draft.documents.identification.file = buildFile(
      "passport.jpg",
      MAX_UPLOAD_BYTES + 1,
      "image/jpeg",
    );

    const result = caseEntryDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Allowed file types are pdf, jpg, and jpeg.",
    );
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "File size must be 5 MB or smaller.",
    );
  });

  test("requires primary GDPR consent before submission", () => {
    const draft = buildValidDraft();
    draft.compliance.gdprConsentPrimary = false;

    const result = caseEntryDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "GDPR consent is required to submit.",
    );
  });
});

describe("disruptionDetailsSchema", () => {
  test("accepts valid cancellation details", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "cancellation",
      cancellationNoticeTiming: "<14 days",
      finalArrivalOutcome: "never arrived",
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });

    expect(result.success).toBe(true);
  });

  test("rejects missing disruption type", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: null,
      cancellationNoticeTiming: null,
      finalArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Select a disruption type.",
    );
  });

  test("requires cancellation notice timing when type is cancellation", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "cancellation",
      cancellationNoticeTiming: null,
      finalArrivalOutcome: "never arrived",
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Select when you were informed about the cancellation.",
    );
  });

  test("requires final arrival outcome when type is delay", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "delay",
      cancellationNoticeTiming: null,
      finalArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Select how late you arrived at the final destination.",
    );
  });

  test("requires final arrival outcome when type is cancellation", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "cancellation",
      cancellationNoticeTiming: "<14 days",
      finalArrivalOutcome: null,
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Select how late you arrived at the final destination.",
    );
  });

  test("requires final arrival outcome when type is denied_boarding", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "denied_boarding",
      cancellationNoticeTiming: null,
      finalArrivalOutcome: null,
      gaveUpSeatVoluntarily: "no",
      deniedBoardingReason: "flight_overbooked",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Select how late you arrived at the final destination.",
    );
  });

  test("requires voluntary seat answer when type is denied_boarding", () => {
    const result = disruptionDetailsSchema.safeParse({
      disruptionType: "denied_boarding",
      cancellationNoticeTiming: null,
      finalArrivalOutcome: "never arrived",
      gaveUpSeatVoluntarily: null,
      deniedBoardingReason: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Answer whether you gave up your seat voluntarily.",
    );
  });
});

describe("disruptionMotiveSchema", () => {
  test("accepts valid motive data", () => {
    const result = disruptionMotiveSchema.safeParse({
      airlineMotiveKnown: "no",
      airlineMotive: null,
      incidentDescription: "Flight was cancelled without notice.",
    });

    expect(result.success).toBe(true);
  });

  test("rejects empty incident description", () => {
    const result = disruptionMotiveSchema.safeParse({
      airlineMotiveKnown: "no",
      airlineMotive: null,
      incidentDescription: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Describe the incident.",
    );
  });

  test("rejects incident description exceeding 1000 characters", () => {
    const result = disruptionMotiveSchema.safeParse({
      airlineMotiveKnown: "no",
      airlineMotive: null,
      incidentDescription: "x".repeat(1001),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Maximum 1000 characters.",
    );
  });
});