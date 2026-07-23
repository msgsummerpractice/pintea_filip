import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MAX_CONNECTING_FLIGHTS } from "../schema";
import { ConnectingFlightsEditor } from "../components/ConnectingFlightsEditor";
import {
  createDraftId,
  createEmptyConnectingFlight,
  type ItineraryInput,
} from "../types";

function buildItinerary(connectionCount = 0): ItineraryInput {
  return {
    departureAirport: null,
    destinationAirport: null,
    connectingFlights: Array.from({ length: connectionCount }, (_, index) => ({
      ...createEmptyConnectingFlight(),
      id: `${createDraftId()}-${index}`,
      flightNumber: `RO10${index}`,
    })),
    problemFlightId: null,
  };
}

test("disables adding connections after the four-flight cap", async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();

  render(
    <ConnectingFlightsEditor
      errors={{}}
      itinerary={buildItinerary(MAX_CONNECTING_FLIGHTS)}
      onAdd={onAdd}
      onProblemFlightChange={vi.fn()}
      onRemove={vi.fn()}
      onUpdate={vi.fn()}
    />,
  );

  const addButton = screen.getByRole("button", { name: /add connecting flight/i });
  expect(addButton).toBeDisabled();
  expect(screen.getAllByTestId("connecting-flight-card")).toHaveLength(MAX_CONNECTING_FLIGHTS);

  await user.click(addButton);
  expect(onAdd).not.toHaveBeenCalled();
});

test("marks the selected connection as the problem flight", async () => {
  const user = userEvent.setup();
  const onProblemFlightChange = vi.fn();
  const itinerary = buildItinerary(2);

  render(
    <ConnectingFlightsEditor
      errors={{}}
      itinerary={itinerary}
      onAdd={vi.fn()}
      onProblemFlightChange={onProblemFlightChange}
      onRemove={vi.fn()}
      onUpdate={vi.fn()}
    />,
  );

  const radios = screen.getAllByRole("radio", { name: /problem flight/i });
  await user.click(radios[1]);

  expect(onProblemFlightChange).toHaveBeenCalledWith(itinerary.connectingFlights[1].id);
});