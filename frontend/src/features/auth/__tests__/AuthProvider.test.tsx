import { render, screen, waitFor } from "@testing-library/react";

import { AuthProvider, useAuth } from "../AuthProvider";

function AuthProbe() {
  const { isLoading, user } = useAuth();
  return <p>{isLoading ? "loading" : user ? user.email : "anonymous"}</p>;
}

describe("AuthProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("restores the current session on mount", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 3,
          email: "session@example.com",
          name: "Session User",
          role: "Passenger",
          mustChangePasswordOnFirstLogin: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("session@example.com")).toBeInTheDocument();
    });
  });
});