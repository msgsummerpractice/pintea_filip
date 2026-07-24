import { MAX_CONNECTING_FLIGHTS } from "../schema";
import type { AirportOption, ItineraryInput } from "../types";
import { AirportAutocomplete } from "./AirportAutocomplete";

interface ConnectingFlightsEditorProps {
  itinerary: ItineraryInput;
  errors: Record<string, string[]>;
  onAdd: () => void;
  onRemove: (flightId: string) => void;
  onProblemFlightChange: (flightId: string | null) => void;
  onUpdate: (flightId: string, field: string, value: string | AirportOption | null) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function ConnectingFlightsEditor({
  errors,
  itinerary,
  onAdd,
  onProblemFlightChange,
  onRemove,
  onUpdate,
}: ConnectingFlightsEditorProps) {
  const remainingSlots = MAX_CONNECTING_FLIGHTS - itinerary.connectingFlights.length;

  return (
    <section className="section-card">
      <div className="section-card-header">
        <div>
          <p className="section-card-label">Dynamic fields</p>
          <h3>Connecting flights</h3>
        </div>
        <div className="section-card-actions">
          <span className="field-support">Up to {MAX_CONNECTING_FLIGHTS} connections</span>
          <button
            className="secondary-button"
            disabled={itinerary.connectingFlights.length >= MAX_CONNECTING_FLIGHTS}
            onClick={onAdd}
            type="button"
          >
            Add connecting flight
          </button>
        </div>
      </div>

      <p className="field-support">
        {remainingSlots > 0
          ? `${remainingSlots} connection slots remaining.`
          : "Connection limit reached for this request."}
      </p>

      {getError(errors, "itinerary.problemFlightId") && (
        <p className="field-error">{getError(errors, "itinerary.problemFlightId")}</p>
      )}

      {itinerary.connectingFlights.length === 0 ? (
        <div className="empty-state-inline">
          <strong>No connecting flights added.</strong>
          <p>Add a connection only when the itinerary includes a transfer leg.</p>
        </div>
      ) : (
        <div className="connecting-flight-list">
          {itinerary.connectingFlights.map((flight, index) => (
            <article className="connection-card" data-testid="connecting-flight-card" key={flight.id}>
              <div className="connection-card-header">
                <div>
                  <p className="section-card-label">Connection {index + 1}</p>
                  <h4>{flight.flightNumber || "Unscheduled connection"}</h4>
                </div>
                <div className="connection-card-actions">
                  <label className="choice-inline">
                    <input
                      checked={itinerary.problemFlightId === flight.id}
                      name="problem-flight"
                      onChange={() => onProblemFlightChange(flight.id)}
                      type="radio"
                    />
                    <span>Problem flight</span>
                  </label>
                  <button className="ghost-button" onClick={() => onRemove(flight.id)} type="button">
                    Remove
                  </button>
                </div>
              </div>

              <div className="form-grid form-grid-tight">
                <label className="field">
                  <span>Flight date</span>
                  <input
                    className="text-input"
                    onChange={(event) => onUpdate(flight.id, "flightDate", event.target.value)}
                    type="date"
                    value={flight.flightDate}
                  />
                  {getError(errors, `itinerary.connectingFlights.${index}.flightDate`) && (
                    <p className="field-error">
                      {getError(errors, `itinerary.connectingFlights.${index}.flightDate`)}
                    </p>
                  )}
                </label>

                <label className="field">
                  <span>Flight number</span>
                  <input
                    className="text-input"
                    onChange={(event) => onUpdate(flight.id, "flightNumber", event.target.value)}
                    type="text"
                    value={flight.flightNumber}
                  />
                  {getError(errors, `itinerary.connectingFlights.${index}.flightNumber`) && (
                    <p className="field-error">
                      {getError(errors, `itinerary.connectingFlights.${index}.flightNumber`)}
                    </p>
                  )}
                </label>

                <label className="field">
                  <span>Airline</span>
                  <input
                    className="text-input"
                    onChange={(event) => onUpdate(flight.id, "airline", event.target.value)}
                    type="text"
                    value={flight.airline}
                  />
                  {getError(errors, `itinerary.connectingFlights.${index}.airline`) && (
                    <p className="field-error">
                      {getError(errors, `itinerary.connectingFlights.${index}.airline`)}
                    </p>
                  )}
                </label>

                <AirportAutocomplete
                  error={getError(errors, `itinerary.connectingFlights.${index}.departureAirport`)}
                  label="Departure airport"
                  onSelect={(airport) => onUpdate(flight.id, "departureAirport", airport)}
                  value={flight.departureAirport}
                />

                <AirportAutocomplete
                  error={getError(errors, `itinerary.connectingFlights.${index}.destinationAirport`)}
                  label="Destination airport"
                  onSelect={(airport) => onUpdate(flight.id, "destinationAirport", airport)}
                  value={flight.destinationAirport}
                />

                <label className="field">
                  <span>Planned departure time</span>
                  <input
                    className="text-input"
                    onChange={(event) =>
                      onUpdate(flight.id, "plannedDepartureTime", event.target.value)
                    }
                    type="time"
                    value={flight.plannedDepartureTime}
                  />
                  {getError(errors, `itinerary.connectingFlights.${index}.plannedDepartureTime`) && (
                    <p className="field-error">
                      {getError(errors, `itinerary.connectingFlights.${index}.plannedDepartureTime`)}
                    </p>
                  )}
                </label>

                <label className="field">
                  <span>Planned arrival time</span>
                  <input
                    className="text-input"
                    onChange={(event) => onUpdate(flight.id, "plannedArrivalTime", event.target.value)}
                    type="time"
                    value={flight.plannedArrivalTime}
                  />
                  {getError(errors, `itinerary.connectingFlights.${index}.plannedArrivalTime`) && (
                    <p className="field-error">
                      {getError(errors, `itinerary.connectingFlights.${index}.plannedArrivalTime`)}
                    </p>
                  )}
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}