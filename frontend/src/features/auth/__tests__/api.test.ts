import { ChangePasswordValidationError, changePassword, fetchSession, getDefaultRoute, logout } from "../api";
import type { SessionUser } from "../types";

function buildUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 7,
    email: "passenger@example.com",
    name: "Pat Passenger",
    role: "Passenger",
    mustChangePasswordOnFirstLogin: false,
    ...overrides,
  };
}

describe("auth api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fetchSession returns null when the backend responds with 401", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Authentication credentials were not provided." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchSession()).resolves.toBeNull();
  });

  test("changePassword maps backend field validation errors", async () => {
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ currentPassword: ["Current password is incorrect."] }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      changePassword({
        currentPassword: "wrong",
        newPassword: "NewPass123!",
        confirmNewPassword: "NewPass123!",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ChangePasswordValidationError>>({
        fieldErrors: { currentPassword: "Current password is incorrect." },
      }),
    );
  });

  test("logout posts to the backend with credentials", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await logout();

    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.stringContaining("/auth/logout/"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  test("getDefaultRoute returns the role destination unless password change is required", () => {
    expect(getDefaultRoute(buildUser())).toBe("/");
    expect(getDefaultRoute(buildUser({ role: "Colleague" }))).toBe("/colleague");
    expect(getDefaultRoute(buildUser({ role: "System Admin" }))).toBe("/admin/users");
    expect(getDefaultRoute(buildUser({ role: "System Admin", mustChangePasswordOnFirstLogin: true }))).toBe("/change-password");
  });
});