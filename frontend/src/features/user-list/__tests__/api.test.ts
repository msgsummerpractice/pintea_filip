import { buildApiUrl } from "../../../lib/http";
import { fetchUserList } from "../api";

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
});