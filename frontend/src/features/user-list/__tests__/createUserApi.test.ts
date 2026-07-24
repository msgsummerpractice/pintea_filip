import { buildApiUrl } from "../../../lib/http";
import { createUser } from "../createUserApi";

describe("createUser api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  test("posts the create user payload and returns the success response", async () => {
    document.cookie = "csrftoken=test-token; path=/";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 17,
          email: "colleague@example.com",
          role: "Colleague",
          message: "User account created successfully.",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      createUser({
        firstName: "Cora",
        lastName: "Colleague",
        email: "colleague@example.com",
        initialPassword: "Start123!",
      }),
    ).resolves.toEqual({
      id: 17,
      email: "colleague@example.com",
      role: "Colleague",
      message: "User account created successfully.",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl("/users/create/"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.any(Headers),
        body: JSON.stringify({
          firstName: "Cora",
          lastName: "Colleague",
          email: "colleague@example.com",
          initialPassword: "Start123!",
        }),
      }),
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect((fetchSpy.mock.calls[0]?.[1]?.headers as Headers).get("X-CSRFToken")).toBe("test-token");
  });

  test("bootstraps csrf before posting when the cookie is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 17,
            email: "colleague@example.com",
            role: "Colleague",
            message: "User account created successfully.",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );

    await createUser({
      firstName: "Cora",
      lastName: "Colleague",
      email: "colleague@example.com",
      initialPassword: "Start123!",
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      buildApiUrl("/csrf/"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      buildApiUrl("/users/create/"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("maps backend validation errors to field-keyed frontend errors", async () => {
    document.cookie = "csrftoken=test-token; path=/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          email: ["A user with this e-mail already exists."],
          initialPassword: ["This field is required."],
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      createUser({
        firstName: "Cora",
        lastName: "Colleague",
        email: "existing@example.com",
        initialPassword: "",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "CreateUserValidationError",
        fieldErrors: {
          email: "A user with this e-mail already exists.",
          initialPassword: "This field is required.",
        },
      }),
    );
  });
});