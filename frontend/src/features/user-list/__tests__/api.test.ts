import { buildApiUrl } from "../../../lib/http";
import { deleteUser, fetchUserList } from "../api";

describe("user-list api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fetches the admin user list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              name: "Ada Admin",
              email: "admin@example.com",
              role: "System Admin",
              assigned_case_count: 0,
              actions: { edit: false, delete: false },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(fetchUserList()).resolves.toEqual([
      {
        id: 1,
        name: "Ada Admin",
        email: "admin@example.com",
        role: "System Admin",
        assignedCaseCount: 0,
        actions: { edit: false, delete: false },
      },
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl("/users/"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
  });

  test("deletes a user account", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 7, message: "User account deleted successfully." }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(deleteUser(7)).resolves.toEqual({
      id: 7,
      message: "User account deleted successfully.",
    });

    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      buildApiUrl("/users/7/"),
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
  });
});