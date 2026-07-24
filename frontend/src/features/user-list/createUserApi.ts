import { HttpError, requestJson } from "../../lib/http";

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  initialPassword: string;
}

export interface CreateUserSuccess {
  id: number;
  email: string;
  role: "Colleague";
  message: string;
}

export type CreateUserFieldErrors = Partial<Record<keyof CreateUserRequest, string>>;

export class CreateUserValidationError extends Error {
  readonly fieldErrors: CreateUserFieldErrors;

  constructor(fieldErrors: CreateUserFieldErrors) {
    super("Validation failed.");
    this.name = "CreateUserValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const createUserFields = ["firstName", "lastName", "email", "initialPassword"] as const;

function mapValidationErrors(body: unknown): CreateUserFieldErrors {
  if (typeof body !== "object" || body === null) {
    return {};
  }

  const responseBody = body as Partial<Record<(typeof createUserFields)[number], unknown>>;
  const fieldErrors: CreateUserFieldErrors = {};

  for (const fieldName of createUserFields) {
    const value = responseBody[fieldName];
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }

    const firstMessage = value.find((entry) => typeof entry === "string");
    if (typeof firstMessage === "string") {
      fieldErrors[fieldName] = firstMessage;
    }
  }

  return fieldErrors;
}

export async function createUser(payload: CreateUserRequest): Promise<CreateUserSuccess> {
  try {
    return await requestJson<CreateUserSuccess>("/users/create/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (reason: unknown) {
    if (reason instanceof HttpError && reason.status === 400) {
      const fieldErrors = mapValidationErrors(reason.body);
      if (Object.keys(fieldErrors).length > 0) {
        throw new CreateUserValidationError(fieldErrors);
      }
    }

    throw reason;
  }
}