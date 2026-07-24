import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";

import { router as appRouter } from "../../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
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

test("renders the case entry route on the root path", async () => {
  vi.spyOn(window, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 5,
          email: "passenger@example.com",
          name: "Pat Passenger",
          role: "Passenger",
          mustChangePasswordOnFirstLogin: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  const router = createMemoryRouter(appRouter.routes, {
    initialEntries: ["/"],
  });

  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );

  expect(await screen.findByRole("heading", { name: /my cases/i })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /add your journey/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create new case/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
});

test("logged-in passengers see their cases and a create new case button", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 5,
          email: "passenger@example.com",
          name: "Pat Passenger",
          role: "Passenger",
          mustChangePasswordOnFirstLogin: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "CASE-ABC123DEF456",
              case_date: "2026-07-24",
              flight_number: "RO201",
              flight_date: "2026-07-20",
              status: "NEW",
              actions: { delete: false },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  const draft = buildValidDraft();
  draft.passengerDetails = {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    address: "",
    postalCode: "",
  };

  render(
    <AuthProvider>
      <MemoryRouter>
        <CaseEntryPage initialDraft={draft} />
      </MemoryRouter>
    </AuthProvider>,
  );

  expect(await screen.findByRole("cell", { name: /case-abc123def456/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create new case/i })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /add your journey/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /create new case/i }));
  expect(screen.getByRole("region", { name: /add your journey/i })).toBeInTheDocument();
  for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
    await user.click(screen.getByRole("button", { name: /continue to next step/i }));
  }
  expect(screen.getByLabelText(/first name/i)).toHaveValue("Pat");
  expect(screen.getByLabelText(/last name/i)).toHaveValue("Passenger");
  expect(screen.getByLabelText(/email/i)).toHaveValue("passenger@example.com");
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
    status: "NEW",
    message: "Your intake package is ready for review.",
    caseId: "CASE-ABC123DEF456",
    createdAt: "2026-07-23T15:30:00+00:00",
  });

  render(<CaseEntryPage initialDraft={buildValidDraft()} submitter={submitter} />);

  for (let stepIndex = 0; stepIndex < 7; stepIndex += 1) {
    await user.click(screen.getByRole("button", { name: /continue to next step/i }));
  }

  expect(screen.getByText(/disruption summary/i)).toBeInTheDocument();
  expect(screen.getByText(/final arrival outcome/i)).toBeInTheDocument();
  expect(screen.getAllByText(/never arrived/i)).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: /submit case/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/case submitted successfully/i);
  expect(screen.getByRole("status")).toHaveTextContent(/your intake package is ready for review/i);
  expect(screen.getByRole("status")).toHaveTextContent(/status: new/i);
  expect(screen.getByRole("status")).toHaveTextContent(/case id: case-abc123def456/i);
  expect(screen.getByRole("region", { name: /add your journey/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /continue to next step/i })).toBeDisabled();
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

  for (let stepIndex = 0; stepIndex < 7; stepIndex += 1) {
    await user.click(screen.getByRole("button", { name: /continue to next step/i }));
  }

  await user.click(screen.getByRole("button", { name: /submit case/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/unable to submit the case/i);
  expect(alert).toHaveTextContent(/itinerary > problem flight id: select the disrupted connection/i);
  expect(alert).toHaveTextContent(/boarding pass: upload a boarding pass before submitting/i);
  expect(submitter).toHaveBeenCalledTimes(1);
});