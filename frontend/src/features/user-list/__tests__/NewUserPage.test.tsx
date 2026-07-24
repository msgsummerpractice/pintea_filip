import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";

import { router as appRouter } from "../../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
import { HttpError } from "../../../lib/http";
import {
  CreateUserValidationError,
  type CreateUserRequest,
  type CreateUserSuccess,
} from "../createUserApi";
import { NewUserPage } from "../components/NewUserPage";

type Submitter = (payload: CreateUserRequest) => Promise<CreateUserSuccess>;
type AccessProbe = () => Promise<unknown>;

function renderPage(options?: { accessProbe?: AccessProbe; submitter?: Submitter }) {
  render(
    <MemoryRouter>
      <NewUserPage accessProbe={options?.accessProbe} submitter={options?.submitter} />
    </MemoryRouter>,
  );
}

describe("NewUserPage", () => {
  test("renders the new user route", async () => {
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ results: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const router = createMemoryRouter(appRouter.routes, {
      initialEntries: ["/admin/users/new"],
    });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: /new user/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /create user/i })).toBeInTheDocument();
  });

  test("shows a success confirmation and resets the form after create", async () => {
    const user = userEvent.setup();
    const accessProbe = vi.fn().mockResolvedValue([]);
    const submitter = vi.fn().mockResolvedValue({
      id: 17,
      email: "colleague@example.com",
      role: "Colleague",
      message: "User account created successfully.",
    });

    renderPage({ accessProbe, submitter });

    await screen.findByRole("button", { name: /create user/i });
    await user.type(screen.getByLabelText(/first name/i), "Cora");
    await user.type(screen.getByLabelText(/last name/i), "Colleague");
    await user.type(screen.getByLabelText(/e-mail/i), "colleague@example.com");
    await user.type(screen.getByLabelText(/initial password/i), "Start123!");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(submitter).toHaveBeenCalledWith({
      firstName: "Cora",
      lastName: "Colleague",
      email: "colleague@example.com",
      initialPassword: "Start123!",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/created successfully/i);
    expect(screen.getByLabelText(/first name/i)).toHaveValue("");
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue("");
  });

  test("shows inline field errors for backend validation failures", async () => {
    const user = userEvent.setup();
    const accessProbe = vi.fn().mockResolvedValue([]);
    const submitter = vi.fn().mockRejectedValue(
      new CreateUserValidationError({
        email: "A user with this e-mail already exists.",
        initialPassword: "This field is required.",
      }),
    );

    renderPage({ accessProbe, submitter });

    await screen.findByRole("button", { name: /create user/i });
    await user.type(screen.getByLabelText(/first name/i), "Cora");
    await user.type(screen.getByLabelText(/e-mail/i), "existing@example.com");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByText(/this field is required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue("existing@example.com");
  });

  test("shows a stable access denied message when page access is forbidden", async () => {
    const accessProbe = vi.fn().mockRejectedValue(
      new HttpError(403, "Forbidden", { detail: "Forbidden" }),
    );

    renderPage({ accessProbe });

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access to create users/i);
    expect(screen.queryByRole("button", { name: /create user/i })).not.toBeInTheDocument();
  });

  test("keeps entered values on unexpected errors", async () => {
    const user = userEvent.setup();
    const accessProbe = vi.fn().mockResolvedValue([]);
    const submitter = vi.fn().mockRejectedValue(new Error("Network down"));

    renderPage({ accessProbe, submitter });

    await screen.findByRole("button", { name: /create user/i });
    await user.type(screen.getByLabelText(/first name/i), "Cora");
    await user.type(screen.getByLabelText(/last name/i), "Colleague");
    await user.type(screen.getByLabelText(/e-mail/i), "colleague@example.com");
    await user.type(screen.getByLabelText(/initial password/i), "Start123!");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to create the user right now/i);
    expect(screen.getByLabelText(/first name/i)).toHaveValue("Cora");
    expect(screen.getByLabelText(/initial password/i)).toHaveValue("Start123!");
  });

  test("disables submit while the request is pending", async () => {
    const user = userEvent.setup();
    const accessProbe = vi.fn().mockResolvedValue([]);
    let resolveRequest: ((value: {
      id: number;
      email: string;
      role: "Colleague";
      message: string;
    }) => void) | undefined;
    const submitter: Submitter = vi.fn(
      () =>
        new Promise<{
          id: number;
          email: string;
          role: "Colleague";
          message: string;
        }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    renderPage({ accessProbe, submitter });

    await screen.findByRole("button", { name: /create user/i });
    await user.type(screen.getByLabelText(/first name/i), "Cora");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(screen.getByRole("button", { name: /creating user/i })).toBeDisabled();

    resolveRequest?.({
      id: 17,
      email: "colleague@example.com",
      role: "Colleague",
      message: "User account created successfully.",
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create user/i })).toBeEnabled();
    });
  });

  test("shows a loading state while checking access", () => {
    const accessProbe = vi.fn().mockReturnValue(new Promise(() => undefined));

    renderPage({ accessProbe });

    expect(screen.getByRole("status")).toHaveTextContent(/checking access/i);
  });
});