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
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "/api";
  return configuredBaseUrl.endsWith("/")
    ? configuredBaseUrl.slice(0, -1)
    : configuredBaseUrl;
})();

function buildHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has("Accept")) {
    mergedHeaders.set("Accept", "application/json");
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