import { buildApiUrl } from "../../../lib/http";
import { deleteCase, fetchCaseList } from "../api";

describe("case-list api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fetches the admin case list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "CASE-ABC123DEF456",
              case_date: "2026-07-24",
              flight_number: "RO201",
              flight_date: "2026-07-20",
              status: "NEW",
              actions: { delete: true },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(fetchCaseList()).resolves.toEqual([
      {
        id: "CASE-ABC123DEF456",
        caseDate: "2026-07-24",
        flightNumber: "RO201",
        flightDate: "2026-07-20",
        status: "NEW",
        actions: { delete: true },
      },
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl("/cases/"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
  });

  test("deletes a case", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "CASE-ABC123DEF456", message: "Case deleted successfully." }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(deleteCase("CASE-ABC123DEF456")).resolves.toEqual({
      id: "CASE-ABC123DEF456",
      message: "Case deleted successfully.",
    });

    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      buildApiUrl("/cases/CASE-ABC123DEF456/"),
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
  });
});