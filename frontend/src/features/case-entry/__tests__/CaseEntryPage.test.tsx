import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import { router as appRouter } from "../../../app/router";
import { CaseEntryPage } from "../components/CaseEntryPage";
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

test("renders the case entry route on the root path", () => {
  const router = createMemoryRouter(appRouter.routes, {
    initialEntries: ["/"],
  });

  render(<RouterProvider router={router} />);

  expect(
    screen.getByRole("heading", { name: /start your compensation case/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("region", { name: /build the itinerary/i })).toBeInTheDocument();
  expect(screen.queryByText(/placeholder exists only/i)).not.toBeInTheDocument();
});

test("keeps the next button disabled until the current step is valid", () => {
  const invalidRender = render(<CaseEntryPage />);
  expect(screen.getByRole("button", { name: /continue to next step/i })).toBeDisabled();

  invalidRender.unmount();

  render(<CaseEntryPage initialDraft={buildValidDraft()} />);
  expect(screen.getByRole("button", { name: /continue to next step/i })).toBeEnabled();
});

test("caps connecting flights at four entries", async () => {
  const user = userEvent.setup();

  render(<CaseEntryPage />);

  const addButton = screen.getByRole("button", { name: /add connecting flight/i });

  await user.click(addButton);
  await user.click(addButton);
  await user.click(addButton);
  await user.click(addButton);

  expect(screen.getAllByTestId("connecting-flight-card")).toHaveLength(4);
  expect(addButton).toBeDisabled();
});

test("shows submit confirmation details when the mocked submit succeeds", async () => {
  const user = userEvent.setup();
  const submitter = vi.fn().mockResolvedValue({
    status: "QUEUED",
    message: "Your intake package is ready for review.",
    publicCaseReference: "AA-2048",
  });

  render(<CaseEntryPage initialDraft={buildValidDraft()} submitter={submitter} />);

  for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
    await user.click(screen.getByRole("button", { name: /continue to next step/i }));
  }

  await user.click(screen.getByRole("button", { name: /submit case/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/case submitted successfully/i);
  expect(screen.getByRole("status")).toHaveTextContent(/your intake package is ready for review/i);
  expect(screen.getByRole("status")).toHaveTextContent(/status: queued/i);
  expect(screen.getByRole("status")).toHaveTextContent(/reference: aa-2048/i);
  expect(submitter).toHaveBeenCalledTimes(1);
});

test("shows structured server validation errors when the mocked submit rejects", async () => {
  const user = userEvent.setup();
  const submitter = vi.fn().mockRejectedValue({
    payload: {
      itinerary: {
        problemFlightId: ["Select the disrupted connection."],
      },
    },
    boarding_pass: ["Upload a boarding pass before submitting."],
  });

  render(<CaseEntryPage initialDraft={buildValidDraft()} submitter={submitter} />);

  for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
    await user.click(screen.getByRole("button", { name: /continue to next step/i }));
  }

  await user.click(screen.getByRole("button", { name: /submit case/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/unable to submit the case/i);
  expect(alert).toHaveTextContent(/itinerary > problem flight id: select the disrupted connection/i);
  expect(alert).toHaveTextContent(/boarding pass: upload a boarding pass before submitting/i);
  expect(submitter).toHaveBeenCalledTimes(1);
});

test("shows a locked disruption stage in the flow and allows preview from review", async () => {
  const user = userEvent.setup();

  render(<CaseEntryPage initialDraft={buildValidDraft()} />);

  for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
    await user.click(screen.getByRole("button", { name: /continue to next step/i }));
  }

  const previewButton = screen.getByRole("button", {
    name: /preview case_03 locked steps/i,
  });

  expect(previewButton).toBeEnabled();
  await user.click(previewButton);

  expect(screen.getByRole("region", { name: /disruption evidence/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/locked disruption stage/i)).toBeInTheDocument();
});