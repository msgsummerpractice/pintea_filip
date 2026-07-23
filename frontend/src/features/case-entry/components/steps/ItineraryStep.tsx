import { useEffect, useRef, useState } from "react";

import { calculateCompensation } from "../../api";
import type { AirportOption, CompensationPreview, ConnectingFlightInput, ItineraryInput } from "../../types";
import { AirportAutocomplete } from "../AirportAutocomplete";
import { ConnectingFlightsEditor } from "../ConnectingFlightsEditor";

interface ItineraryStepProps {
  itinerary: ItineraryInput;
  compensationPreview: CompensationPreview | null;
  errors: Record<string, string[]>;
  onDepartureAirportChange: (airport: AirportOption | null) => void;
  onDestinationAirportChange: (airport: AirportOption | null) => void;
  onCompensationPreviewChange: (preview: CompensationPreview | null) => void;
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
  compensationPreview,
  errors,
  itinerary,
  onAddConnectingFlight,
  onCompensationPreviewChange,
  onDepartureAirportChange,
  onDestinationAirportChange,
  onProblemFlightChange,
  onRemoveConnectingFlight,
  onUpdateConnectingFlight,
}: ItineraryStepProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const departureCode = itinerary.departureAirport?.code ?? null;
  const destinationCode = itinerary.destinationAirport?.code ?? null;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!departureCode || !destinationCode) {
      onCompensationPreviewChange(null);
      setCalcError(null);
      setIsCalculating(false);
      return;
    }

    setIsCalculating(true);
    setCalcError(null);

    debounceRef.current = setTimeout(() => {
      calculateCompensation(departureCode, destinationCode)
        .then((result) => {
          onCompensationPreviewChange(result);
          setCalcError(null);
        })
        .catch(() => {
          onCompensationPreviewChange(null);
          setCalcError("Could not calculate compensation. You can still proceed.");
        })
        .finally(() => setIsCalculating(false));
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [departureCode, destinationCode]);

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

      {isCalculating && (
        <section className="compensation-panel compensation-panel-loading" aria-live="polite">
          <div className="compensation-panel-header">
            <p className="section-card-label">Compensation estimate</p>
            <strong>Calculating route distance</strong>
          </div>
          <p className="compensation-panel-copy">
            We are checking the orthodromic distance between the selected airports.
          </p>
          <div className="compensation-skeleton-grid" aria-hidden="true">
            <span className="compensation-skeleton" />
            <span className="compensation-skeleton compensation-skeleton-wide" />
          </div>
        </section>
      )}

      {!isCalculating && compensationPreview && (
        <section className="compensation-panel" aria-live="polite">
          <div className="compensation-panel-header">
            <div>
              <p className="section-card-label">Compensation estimate</p>
              <strong>Live compensation preview</strong>
            </div>
            <span className="compensation-panel-badge">AirportGap verified</span>
          </div>

          <div className="compensation-stat-grid">
            <article className="compensation-stat-card">
              <span className="compensation-stat-label">Orthodromic distance</span>
              <strong className="compensation-stat-value">
                {compensationPreview.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span> km</span>
              </strong>
              <p>Measured from the starting airport to the final destination only.</p>
            </article>

            <article className="compensation-stat-card compensation-stat-card-highlight">
              <span className="compensation-stat-label">Estimated compensation</span>
              <strong className="compensation-stat-value compensation-stat-value-eur">
                €{compensationPreview.compensationEur}
              </strong>
              <p>Based on the current EU compensation distance thresholds.</p>
            </article>
          </div>
        </section>
      )}

      {!isCalculating && calcError && (
        <section className="compensation-panel compensation-panel-warning" aria-live="polite">
          <div className="compensation-panel-header">
            <p className="section-card-label">Compensation estimate</p>
            <strong>Preview unavailable</strong>
          </div>
          <p className="compensation-panel-copy">{calcError}</p>
        </section>
      )}

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