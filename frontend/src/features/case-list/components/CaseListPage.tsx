import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { SessionActions } from "../../auth/components/SessionActions";
import { HttpError } from "../../../lib/http";
import { deleteCase, fetchCaseList } from "../api";
import type { DeleteCaseResponse, CaseListRow } from "../types";

interface CaseListPageProps {
  loader?: () => Promise<CaseListRow[]>;
  deleter?: (caseId: string) => Promise<DeleteCaseResponse>;
}

export function CaseListPage({ loader = fetchCaseList, deleter = deleteCase }: CaseListPageProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<CaseListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null);
  const selectedCaseId = searchParams.get("caseId");

  useEffect(() => {
    let cancelled = false;

    loader()
      .then((result) => {
        if (!cancelled) {
          setRows(result);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }

        if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
          setError("You do not have access to the case list.");
          return;
        }

        setError("Unable to load cases right now.");
      });

    return () => {
      cancelled = true;
    };
  }, [loader]);

  async function handleDelete(caseId: string) {
    setPendingCaseId(caseId);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await deleter(caseId);
      setRows((currentRows) => currentRows?.filter((row) => row.id !== caseId) ?? []);
      setStatusMessage(result.message);

      if (selectedCaseId === caseId) {
        setSearchParams({});
      }
    } catch (reason: unknown) {
      if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
        setError("You do not have access to delete cases.");
      } else {
        setError("Unable to delete the case right now.");
      }
    } finally {
      setPendingCaseId(null);
    }
  }

  return (
    <main className="user-list-page">
      <section className="user-list-frame" aria-labelledby="case-list-title">
        <header className="user-list-header">
          <SessionActions />
          <div className="new-user-heading-row">
            <div>
              <p className="eyebrow">System administration</p>
              <h1 id="case-list-title">Case View</h1>
            </div>
            <div className="new-user-heading-actions">
              <Link className="secondary-button new-user-back-link" to="/admin/users">
                Manage Users
              </Link>
            </div>
          </div>
          <p>Review all cases, inspect their references, and remove records that should no longer remain in the system.</p>
        </header>

        <div className="user-list-content">
          {rows === null && error === null ? <p role="status">Loading cases...</p> : null}
          {statusMessage ? (
            <div className="notice-banner notice-banner-success" role="status">
              {statusMessage}
            </div>
          ) : null}
          {selectedCaseId ? (
            <div className="notice-banner" role="status">
              Selected case: {selectedCaseId}
            </div>
          ) : null}
          {error ? (
            <div className="notice-banner notice-banner-error" role="alert">
              {error}
            </div>
          ) : null}
          {rows && rows.length === 0 ? (
            <div className="notice-banner" role="status">
              No cases found.
            </div>
          ) : null}
          {rows && rows.length > 0 ? (
            <div className="user-list-table-shell">
              <table className="user-list-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Case Date</th>
                    <th scope="col">Flight Number</th>
                    <th scope="col">Flight Date</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={selectedCaseId === row.id ? "user-list-row-selected" : undefined}>
                      <td>
                        <Link className="case-list-link" to={`/admin/cases?caseId=${encodeURIComponent(row.id)}`}>
                          {row.id}
                        </Link>
                      </td>
                      <td>{row.caseDate}</td>
                      <td>{row.flightNumber}</td>
                      <td>{row.flightDate ?? "-"}</td>
                      <td>{row.status}</td>
                      <td>
                        <div className="user-list-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={!row.actions.delete || pendingCaseId === row.id}
                            onClick={() => {
                              void handleDelete(row.id);
                            }}
                            aria-label={`Delete ${row.id}`}
                          >
                            {pendingCaseId === row.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}