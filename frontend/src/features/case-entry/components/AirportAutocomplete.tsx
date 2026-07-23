import { useEffect, useState } from "react";

import { searchAirports } from "../api";
import type { AirportOption } from "../types";

interface AirportAutocompleteProps {
  label: string;
  value: AirportOption | null;
  error?: string;
  placeholder?: string;
  onSelect: (airport: AirportOption | null) => void;
}

export function AirportAutocomplete({
  error,
  label,
  onSelect,
  placeholder = "Search by airport, city, or code",
  value,
}: AirportAutocompleteProps) {
  const [query, setQuery] = useState(value?.displayLabel ?? "");
  const [results, setResults] = useState<AirportOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setQuery(value?.displayLabel ?? "");
  }, [value?.displayLabel]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || trimmedQuery === value?.displayLabel) {
      setResults([]);
      setMessage(null);
      setIsLoading(false);
      return undefined;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setMessage(null);

      try {
        const nextResults = await searchAirports(trimmedQuery);
        if (isCancelled) {
          return;
        }

        setResults(nextResults);
        setMessage(nextResults.length === 0 ? "No airports found for this search." : null);
      } catch {
        if (!isCancelled) {
          setResults([]);
          setMessage("Airport search is unavailable right now.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }, 220);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query, value?.displayLabel]);

  function handleSelect(option: AirportOption) {
    onSelect(option);
    setQuery(option.displayLabel);
    setResults([]);
    setMessage(null);
  }

  return (
    <label className="field airport-autocomplete">
      <span>{label}</span>
      <input
        className="text-input"
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);

          if (value && nextQuery !== value.displayLabel) {
            onSelect(null);
          }
        }}
        placeholder={placeholder}
        type="text"
        value={query}
      />

      {value && (
        <span className="field-support">
          Selected: {value.code} · {value.city}, {value.country}
        </span>
      )}

      {!value && isLoading && <span className="field-support">Searching airports…</span>}
      {!value && message && <span className="field-support">{message}</span>}
      {error && <p className="field-error">{error}</p>}

      {results.length > 0 && (
        <ul className="autocomplete-results" role="listbox">
          {results.map((result) => (
            <li key={`${result.code}-${result.name}`}>
              <button
                className="autocomplete-option"
                onClick={() => handleSelect(result)}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <strong>{result.code}</strong>
                <span>{result.displayLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}