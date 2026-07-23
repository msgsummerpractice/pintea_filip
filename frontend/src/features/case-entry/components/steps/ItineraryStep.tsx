import type { AirportOption, ConnectingFlightInput, ItineraryInput } from "../../types";
import { AirportAutocomplete } from "../AirportAutocomplete";
import { ConnectingFlightsEditor } from "../ConnectingFlightsEditor";

interface ItineraryStepProps {
  itinerary: ItineraryInput;
  errors: Record<string, string[]>;
  onDepartureAirportChange: (airport: AirportOption | null) => void;
  onDestinationAirportChange: (airport: AirportOption | null) => void;
  onAddConnectingFlight: () => void;
  onUpdateConnectingFlight: (
    flightId: string,
    updater: ConnectingFlightInput | ((currentFlight: ConnectingFlightInput) => ConnectingFlightInput),
  ) => void;
  onRemoveConnectingFlight: (flightId: string) => void;
  onProblemFlightChange: (flightId: string | null) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

export function ItineraryStep({
  errors,
  itinerary,
  onAddConnectingFlight,
  onDepartureAirportChange,
  onDestinationAirportChange,
  onProblemFlightChange,
  onRemoveConnectingFlight,
  onUpdateConnectingFlight,
}: ItineraryStepProps) {
  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Map the passenger's route first.</strong>
        <p>
          The intake stays locked until the base itinerary is consistent. Connections can be
          added only when they matter to the disruption chain.
        </p>
      </section>

      <div className="form-grid">
        <AirportAutocomplete
          error={getError(errors, "itinerary.departureAirport")}
          label="Departure airport"
          onSelect={onDepartureAirportChange}
          value={itinerary.departureAirport}
        />
        <AirportAutocomplete
          error={getError(errors, "itinerary.destinationAirport")}
          label="Destination airport"
          onSelect={onDestinationAirportChange}
          value={itinerary.destinationAirport}
        />
      </div>

      <ConnectingFlightsEditor
        errors={errors}
        itinerary={itinerary}
        onAdd={onAddConnectingFlight}
        onProblemFlightChange={onProblemFlightChange}
        onRemove={onRemoveConnectingFlight}
        onUpdate={(flightId, field, value) =>
          onUpdateConnectingFlight(flightId, (currentFlight) => ({
            ...currentFlight,
            [field]: value,
          }))
        }
      />
    </div>
  );
}