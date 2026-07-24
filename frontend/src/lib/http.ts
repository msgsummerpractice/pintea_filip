export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

const apiBaseUrl = (() => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const fallbackBaseUrl = import.meta.env.DEV ? "http://localhost:8000/api" : "/api";
  const resolvedBaseUrl = configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : fallbackBaseUrl;

  return resolvedBaseUrl.endsWith("/")
    ? resolvedBaseUrl.slice(0, -1)
    : resolvedBaseUrl;
})();

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieValue = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  if (!cookieValue) {
    return null;
  }

  return decodeURIComponent(cookieValue.slice(name.length + 1));
}

let csrfBootstrapRequest: Promise<void> | null = null;

function requiresCsrfProtection(method: string | undefined): boolean {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(normalizedMethod);
}

async function ensureCsrfCookie(): Promise<void> {
  if (readCookie("csrftoken")) {
    return;
  }

  if (!csrfBootstrapRequest) {
    csrfBootstrapRequest = fetch(buildApiUrl("/csrf/"), {
      credentials: "include",
      headers: buildHeaders(),
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to initialize CSRF protection: ${response.status}`);
      }
    }).finally(() => {
      csrfBootstrapRequest = null;
    });
  }

  await csrfBootstrapRequest;
}

function buildHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has("Accept")) {
    mergedHeaders.set("Accept", "application/json");
  }

  const csrfToken = readCookie("csrftoken");
  if (csrfToken && !mergedHeaders.has("X-CSRFToken")) {
    mergedHeaders.set("X-CSRFToken", csrfToken);
  }

  return mergedHeaders;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function requestJson<TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  if (requiresCsrfProtection(init.method)) {
    await ensureCsrfCookie();
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: buildHeaders(init.headers),
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : `Request failed with status ${response.status}.`;
    throw new HttpError(response.status, message, body);
  }

  return body as TResponse;
}