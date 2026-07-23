import { act, renderHook } from "@testing-library/react";

import { useCaseEntryWizard } from "../hooks/useCaseEntryWizard";
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

function buildFile(name: string, sizeBytes = 2_048, type = "application/pdf"): File {
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
    identification: { file: buildFile("passport.jpg", 2_048, "image/jpeg") },
  };

  return draft;
}

describe("useCaseEntryWizard", () => {
  test("blocks forward navigation until the active step validates", () => {
    const { result } = renderHook(() => useCaseEntryWizard());

    expect(result.current.currentStep).toBe("itinerary");
    expect(result.current.canGoNext).toBe(false);

    act(() => {
      result.current.setDraft(buildValidDraft());
    });

    expect(result.current.canGoNext).toBe(true);

    act(() => {
      result.current.goNext();
    });

    expect(result.current.currentStep).toBe("disruptionDetails");

    act(() => {
      result.current.setStepData("disruptionDetails", {
        disruptionType: null,
        cancellationNoticeTiming: null,
        finalArrivalOutcome: null,
        gaveUpSeatVoluntarily: null,
        deniedBoardingReason: null,
      });
    });

    expect(result.current.canGoNext).toBe(false);

    act(() => {
      result.current.goNext();
    });

    expect(result.current.currentStep).toBe("disruptionDetails");
  });

  test("manages connecting flight helpers inside wizard state", () => {
    const { result } = renderHook(() => useCaseEntryWizard());

    act(() => {
      result.current.addConnectingFlight();
    });

    expect(result.current.draft.itinerary.connectingFlights).toHaveLength(1);

    const flightId = result.current.draft.itinerary.connectingFlights[0].id;

    act(() => {
      result.current.updateConnectingFlight(flightId, (currentFlight) => ({
        ...currentFlight,
        flightDate: "2026-06-15",
        flightNumber: "RO777",
        airline: "Tarom",
        departureAirport: buildAirport("OTP"),
        destinationAirport: buildAirport("FRA", "Frankfurt"),
        plannedDepartureTime: "13:15",
        plannedArrivalTime: "15:00",
      }));
      result.current.setProblemFlight(flightId);
    });

    expect(result.current.draft.itinerary.problemFlightId).toBe(flightId);

    act(() => {
      result.current.removeConnectingFlight(flightId);
    });

    expect(result.current.draft.itinerary.connectingFlights).toHaveLength(0);
    expect(result.current.draft.itinerary.problemFlightId).toBeNull();
  });

  test("submits only after the full draft validates", async () => {
    const submitter = vi.fn().mockResolvedValue({ id: "CASE-ABC123DEF456", caseId: "CASE-ABC123DEF456", status: "NEW" });
    const { result } = renderHook(() => useCaseEntryWizard({ submitter }));

    await act(async () => {
      await result.current.submit();
    });

    expect(submitter).not.toHaveBeenCalled();
    expect(result.current.currentStep).toBe("itinerary");
    expect(result.current.submitState.status).toBe("error");

    act(() => {
      result.current.setDraft(buildValidDraft());
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(submitter).toHaveBeenCalledTimes(1);
    expect(result.current.submitState.status).toBe("success");
    expect(result.current.submitState.response).toEqual({
      id: "CASE-ABC123DEF456",
      caseId: "CASE-ABC123DEF456",
      status: "NEW",
    });
  });
});