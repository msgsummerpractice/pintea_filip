import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../AuthProvider";
import { CaseEntryPage } from "../../case-entry/components/CaseEntryPage";
import { ChangePasswordPage } from "../components/ChangePasswordPage";
import { LoginPage } from "../components/LoginPage";
import { ProtectedRoute } from "../components/ProtectedRoute";

function renderRouter(initialEntries: string[]) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={(
              <ProtectedRoute allow={(testUser) => testUser.role === "Passenger"}>
                <CaseEntryPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/change-password"
            element={(
              <ProtectedRoute allow={() => true}>
                <ChangePasswordPage />
              </ProtectedRoute>
            )}
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ChangePasswordPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("redirects users to their normal destination after a successful password change", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 6,
            email: "passenger@example.com",
            name: "Pat Passenger",
            role: "Passenger",
            mustChangePasswordOnFirstLogin: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 6,
            email: "passenger@example.com",
            name: "Pat Passenger",
            role: "Passenger",
            mustChangePasswordOnFirstLogin: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    renderRouter(["/change-password"]);

    await screen.findByRole("heading", { name: /change password/i });
    await user.type(screen.getByLabelText(/current password/i), "StrongPass123!");
    await user.type(screen.getByLabelText(/^new password$/i), "EvenStronger123!");
    await user.type(screen.getByLabelText(/confirm new password/i), "EvenStronger123!");
    await user.click(screen.getByRole("button", { name: /save password/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /start your compensation case/i })).toBeInTheDocument();
    });
  });

  test("renders inline validation errors returned by the backend", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 6,
            email: "passenger@example.com",
            name: "Pat Passenger",
            role: "Passenger",
            mustChangePasswordOnFirstLogin: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ currentPassword: ["Current password is incorrect."] }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );

    renderRouter(["/change-password"]);

    await screen.findByRole("heading", { name: /change password/i });
    await user.type(screen.getByLabelText(/current password/i), "bad-pass");
    await user.type(screen.getByLabelText(/^new password$/i), "EvenStronger123!");
    await user.type(screen.getByLabelText(/confirm new password/i), "EvenStronger123!");
    await user.click(screen.getByRole("button", { name: /save password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});