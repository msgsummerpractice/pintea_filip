import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../AuthProvider";
import { ChangePasswordPage } from "../components/ChangePasswordPage";
import { ColleagueHomePage } from "../components/ColleagueHomePage";
import { LoginPage } from "../components/LoginPage";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { UserListPage } from "../../user-list/components/UserListPage";

function renderAuthRouter(initialEntries: string[]) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin/users"
            element={(
              <ProtectedRoute allow={(testUser) => testUser.role === "System Admin"}>
                <UserListPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/colleague"
            element={(
              <ProtectedRoute allow={(testUser) => testUser.role === "Colleague"}>
                <ColleagueHomePage />
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

describe("LoginPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("redirects admin users to the admin user list after login", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Authentication credentials were not provided." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 11,
            email: "admin@example.com",
            name: "Ada Admin",
            role: "System Admin",
            mustChangePasswordOnFirstLogin: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    renderAuthRouter(["/login"]);

    await screen.findByRole("heading", { name: /sign in/i });
    await user.type(screen.getByLabelText(/e-mail/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "StrongPass123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /user list/i })).toBeInTheDocument();
    });
  });

  test("redirects forced-change users to the change-password page", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Authentication credentials were not provided." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 12,
            email: "forced@example.com",
            name: "Fran Forced",
            role: "Passenger",
            mustChangePasswordOnFirstLogin: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    renderAuthRouter(["/login"]);

    await screen.findByRole("heading", { name: /sign in/i });
    await user.type(screen.getByLabelText(/e-mail/i), "forced@example.com");
    await user.type(screen.getByLabelText(/password/i), "StrongPass123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /change password/i })).toBeInTheDocument();
    });
  });
});