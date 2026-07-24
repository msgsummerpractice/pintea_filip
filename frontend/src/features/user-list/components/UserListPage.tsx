import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SessionActions } from "../../auth/components/SessionActions";
import { HttpError } from "../../../lib/http";
import { deleteUser, fetchUserList } from "../api";
import type { DeleteUserResponse, UserListRow } from "../types";

interface UserListPageProps {
  loader?: () => Promise<UserListRow[]>;
  deleter?: (userId: number) => Promise<DeleteUserResponse>;
}

export function UserListPage({ loader = fetchUserList, deleter = deleteUser }: UserListPageProps = {}) {
  const [rows, setRows] = useState<UserListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

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
          setError("You do not have access to the user list.");
          return;
        }

        setError("Unable to load users right now.");
      });

    return () => {
      cancelled = true;
    };
  }, [loader]);

  async function handleDelete(userId: number) {
    setPendingUserId(userId);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await deleter(userId);
      setRows((currentRows) => currentRows?.filter((row) => row.id !== userId) ?? []);
      setStatusMessage(result.message);
    } catch (reason: unknown) {
      if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
        setError("You do not have access to delete users.");
      } else {
        setError("Unable to delete the user right now.");
      }
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <main className="user-list-page">
      <section className="user-list-frame" aria-labelledby="user-list-title">
        <header className="user-list-header">
          <SessionActions />
          <div className="new-user-heading-row">
            <div>
              <p className="eyebrow">System administration</p>
              <h1 id="user-list-title">User List</h1>
            </div>
            <div className="new-user-heading-actions">
              <Link className="ghost-button new-user-back-link" to="/admin/cases">
                Case View
              </Link>
              <Link className="secondary-button new-user-back-link" to="/admin/users/new">
                New User
              </Link>
            </div>
          </div>
          <p>Review all system users, their role, and passenger-linked case counts.</p>
        </header>

        <div className="user-list-content">
          {rows === null && error === null ? <p role="status">Loading users...</p> : null}
          {statusMessage ? (
            <div className="notice-banner notice-banner-success" role="status">
              {statusMessage}
            </div>
          ) : null}
          {error ? (
            <div className="notice-banner notice-banner-error" role="alert">
              {error}
            </div>
          ) : null}
          {rows && rows.length === 0 ? (
            <div className="notice-banner" role="status">
              No users found.
            </div>
          ) : null}
          {rows && rows.length > 0 ? (
            <div className="user-list-table-shell">
              <table className="user-list-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">E-Mail</th>
                    <th scope="col">Role</th>
                    <th scope="col">Assigned Cases</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.email}</td>
                      <td>{row.role}</td>
                      <td>{row.assignedCaseCount}</td>
                      <td>
                        <div className="user-list-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={!row.actions.edit}
                            aria-label={`Edit ${row.email}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={!row.actions.delete || pendingUserId === row.id}
                            onClick={() => {
                              void handleDelete(row.id);
                            }}
                            aria-label={`Delete ${row.email}`}
                          >
                            {pendingUserId === row.id ? "Deleting..." : "Delete"}
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