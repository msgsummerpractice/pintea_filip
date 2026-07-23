import { buildApiUrl } from "../../../lib/http";
import {
  buildCaseEntryFormData,
  searchAirports,
  submitCaseEntry,
} from "../api";
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

function buildFile(name: string, sizeBytes = 1_024, type = "application/pdf"): File {
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
  draft.compliance = {
    gdprConsentPrimary: true,
    gdprConsentSecondary: true,
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
    identification: { file: buildFile("passport.jpg", 1_024, "image/jpeg") },
  };

  return draft;
}

describe("case-entry api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("skips airport search requests for short queries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(searchAirports("a")).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("maps airport search responses into client-side options", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              code: "OTP",
              name: "Henri Coanda International Airport",
              city: "Bucharest",
              country: "Romania",
              display_label: "Bucharest - Henri Coanda International Airport (OTP)",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(searchAirports("bu")).resolves.toEqual([
      {
        code: "OTP",
        name: "Henri Coanda International Airport",
        city: "Bucharest",
        country: "Romania",
        displayLabel: "Bucharest - Henri Coanda International Airport (OTP)",
      },
    ]);

    expect(globalThis.fetch).toHaveBeenCalledWith(buildApiUrl("/airports/search?q=bu"), expect.any(Object));
  });

  test("builds multipart form data for case submission", () => {
    const draft = buildValidDraft();
    const formData = buildCaseEntryFormData(draft);

    const payload = JSON.parse(String(formData.get("payload")));

    expect(payload.reservationNumber).toBe("ABC123");
    expect(payload.itinerary.problemFlightId).toBe(draft.itinerary.problemFlightId);
    expect(payload.itinerary.connectingFlights[0].plannedDepartureTime).toBe("12:15");
    expect(payload.itinerary.connectingFlights[0].plannedArrivalTime).toBe("14:00");
    expect(formData.get("boarding_pass")).toBe(draft.documents.boardingPass.file);
    expect(formData.get("identification")).toBe(draft.documents.identification.file);
  });

  test("submits the typed case payload to the planned cases endpoint", async () => {
    const draft = buildValidDraft();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 42, status: "NEW" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(submitCaseEntry(draft)).resolves.toEqual({ id: 42, status: "NEW" });
    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl("/cases/"),
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });
});