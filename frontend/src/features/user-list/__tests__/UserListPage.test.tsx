import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";

import { HttpError } from "../../../lib/http";
import { router as appRouter } from "../../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
import * as api from "../api";
import { UserListPage } from "../components/UserListPage";
import type { UserListRow } from "../types";

function buildUserRow(overrides: Partial<UserListRow> = {}): UserListRow {
  return {
    id: 1,
    name: "Ada Admin",
    email: "admin@example.com",
    role: "System Admin",
    assignedCaseCount: 0,
    actions: { edit: false, delete: false },
    ...overrides,
  };
}

function renderPage(
  loader?: () => Promise<UserListRow[]>,
  deleter?: (userId: number) => Promise<{ id: number; message: string }>,
) {
  render(
    <MemoryRouter>
      <UserListPage loader={loader} deleter={deleter} />
    </MemoryRouter>,
  );
}

describe("UserListPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders the user list route", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 9,
          email: "admin@example.com",
          name: "Ada Admin",
          role: "System Admin",
          mustChangePasswordOnFirstLogin: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.spyOn(api, "fetchUserList").mockResolvedValue([]);

    const router = createMemoryRouter(appRouter.routes, {
      initialEntries: ["/admin/users"],
    });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: /user list/i })).toBeInTheDocument();
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  test("renders a loading state before users resolve", () => {
    renderPage(() => new Promise(() => undefined));

    expect(screen.getByRole("status")).toHaveTextContent(/loading users/i);
  });

  test("renders fetched users with enabled delete actions for deletable rows", async () => {
    renderPage(
      vi.fn().mockResolvedValue([
        buildUserRow(),
        buildUserRow({
          id: 2,
          name: "Paula Passenger",
          email: "passenger@example.com",
          role: "Passenger",
          assignedCaseCount: 1,
          actions: { edit: false, delete: true },
        }),
      ]),
    );

    expect(await screen.findByRole("cell", { name: /ada admin/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /e-mail/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /role/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /assigned cases/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit admin@example.com/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete admin@example.com/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete passenger@example.com/i })).toBeEnabled();
  });

  test("renders the empty state", async () => {
    renderPage(vi.fn().mockResolvedValue([]));

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  test("deletes a user and shows a confirmation message", async () => {
    const user = userEvent.setup();
    const deleter = vi.fn().mockResolvedValue({
      id: 2,
      message: "User account deleted successfully.",
    });

    renderPage(
      vi.fn().mockResolvedValue([
        buildUserRow({
          id: 2,
          name: "Paula Passenger",
          email: "passenger@example.com",
          role: "Passenger",
          assignedCaseCount: 1,
          actions: { edit: false, delete: true },
        }),
      ]),
      deleter,
    );

    await user.click(await screen.findByRole("button", { name: /delete passenger@example.com/i }));

    expect(deleter).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/user account deleted successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/no users found/i)).toBeInTheDocument();
  });

  test("renders access denied state for forbidden responses", async () => {
    renderPage(vi.fn().mockRejectedValue(new HttpError(403, "Forbidden", { detail: "Forbidden" })));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access/i);
  });

  test("renders a generic error state for unexpected failures", async () => {
    renderPage(vi.fn().mockRejectedValue(new Error("Network down")));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load users right now/i);
  });

  test("renders a delete-specific access error when deletion is forbidden", async () => {
    const user = userEvent.setup();
    const deleter = vi.fn().mockRejectedValue(new HttpError(403, "Forbidden", { detail: "Forbidden" }));

    renderPage(
      vi.fn().mockResolvedValue([
        buildUserRow({
          id: 2,
          name: "Paula Passenger",
          email: "passenger@example.com",
          role: "Passenger",
          assignedCaseCount: 1,
          actions: { edit: false, delete: true },
        }),
      ]),
      deleter,
    );

    await user.click(await screen.findByRole("button", { name: /delete passenger@example.com/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access to delete users/i);
  });
});