import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import { HttpError } from "../../../lib/http";
import { router as appRouter } from "../../../app/router";
import * as api from "../api";
import { UserListPage } from "../components/UserListPage";

describe("UserListPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders the user list route", async () => {
    vi.spyOn(api, "fetchUserList").mockResolvedValue([]);

    const router = createMemoryRouter(appRouter.routes, {
      initialEntries: ["/admin/users"],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: /user list/i })).toBeInTheDocument();
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  test("renders a loading state before users resolve", () => {
    vi.spyOn(api, "fetchUserList").mockReturnValue(new Promise(() => undefined));

    render(<UserListPage />);

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

    render(<UserListPage />);

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

    render(<UserListPage />);

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  test("renders access denied state for forbidden responses", async () => {
    vi.spyOn(api, "fetchUserList").mockRejectedValue(
      new HttpError(403, "Forbidden", { detail: "Forbidden" }),
    );

    render(<UserListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access/i);
  });

  test("renders a generic error state for unexpected failures", async () => {
    vi.spyOn(api, "fetchUserList").mockRejectedValue(new Error("Network down"));

    render(<UserListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load users right now/i);
  });
});