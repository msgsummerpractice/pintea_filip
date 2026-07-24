import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";

import { router as appRouter } from "../../../app/router";
import { HttpError } from "../../../lib/http";
import { AuthProvider } from "../../auth/AuthProvider";
import { CaseListPage } from "../components/CaseListPage";
import type { CaseListRow } from "../types";

function buildCaseRow(overrides: Partial<CaseListRow> = {}): CaseListRow {
  return {
    id: "CASE-ABC123DEF456",
    caseDate: "2026-07-24",
    flightNumber: "RO201",
    flightDate: "2026-07-20",
    status: "NEW",
    actions: { delete: true },
    ...overrides,
  };
}

function renderPage(loader?: () => Promise<CaseListRow[]>, deleter?: (caseId: string) => Promise<{ id: string; message: string }>) {
  render(
    <MemoryRouter>
      <CaseListPage loader={loader} deleter={deleter} />
    </MemoryRouter>,
  );
}

describe("CaseListPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders the case list route", async () => {
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

    const loader = vi.fn().mockResolvedValue([]);
    const router = createMemoryRouter(appRouter.routes, {
      initialEntries: ["/admin/cases"],
    });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(loader).not.toHaveBeenCalled();
    });
  });

  test("renders a loading state before cases resolve", () => {
    renderPage(() => new Promise(() => undefined));

    expect(screen.getByRole("status")).toHaveTextContent(/loading cases/i);
  });

  test("renders fetched cases and a linked case id", async () => {
    renderPage(vi.fn().mockResolvedValue([buildCaseRow()]));

    expect(await screen.findByRole("link", { name: /case-abc123def456/i })).toHaveAttribute(
      "href",
      "/admin/cases?caseId=CASE-ABC123DEF456",
    );
    expect(screen.getByRole("columnheader", { name: /id/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /case date/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /flight number/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /flight date/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete case-abc123def456/i })).toBeEnabled();
  });

  test("deletes a case and shows a confirmation message", async () => {
    const user = userEvent.setup();
    const deleter = vi.fn().mockResolvedValue({
      id: "CASE-ABC123DEF456",
      message: "Case deleted successfully.",
    });

    renderPage(vi.fn().mockResolvedValue([buildCaseRow()]), deleter);

    await user.click(await screen.findByRole("button", { name: /delete case-abc123def456/i }));

    expect(deleter).toHaveBeenCalledWith("CASE-ABC123DEF456");
    expect(await screen.findByText(/case deleted successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/no cases found/i)).toBeInTheDocument();
  });

  test("renders access denied state for forbidden responses", async () => {
    renderPage(vi.fn().mockRejectedValue(new HttpError(403, "Forbidden", { detail: "Forbidden" })));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access to the case list/i);
  });

  test("renders a generic error state for unexpected failures", async () => {
    renderPage(vi.fn().mockRejectedValue(new Error("Network down")));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load cases right now/i);
  });
});