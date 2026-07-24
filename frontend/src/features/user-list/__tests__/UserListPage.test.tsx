import { render, screen } from "@testing-library/react";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";

import { HttpError } from "../../../lib/http";
import { router as appRouter } from "../../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
import * as api from "../api";
import { UserListPage } from "../components/UserListPage";

function renderPage() {
  render(
    <MemoryRouter>
      <UserListPage />
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
    vi.spyOn(api, "fetchUserList").mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(/loading users/i);
  });

  test("renders fetched users and disabled actions", async () => {
    vi.spyOn(api, "fetchUserList").mockResolvedValue([
      {
        id: 1,
        name: "Ada Admin",
        email: "admin@example.com",
        role: "System Admin",
        assignedCaseCount: 0,
        actions: { edit: false, delete: false },
      },
    ]);

    renderPage();

    expect(await screen.findByRole("cell", { name: /ada admin/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /e-mail/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /role/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /assigned cases/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit admin@example.com/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete admin@example.com/i })).toBeDisabled();
  });

  test("renders the empty state", async () => {
    vi.spyOn(api, "fetchUserList").mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  test("renders access denied state for forbidden responses", async () => {
    vi.spyOn(api, "fetchUserList").mockRejectedValue(
      new HttpError(403, "Forbidden", { detail: "Forbidden" }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access/i);
  });

  test("renders a generic error state for unexpected failures", async () => {
    vi.spyOn(api, "fetchUserList").mockRejectedValue(new Error("Network down"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load users right now/i);
  });
});