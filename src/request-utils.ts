import { fetchWithTimeout } from "./security-utils";

export interface JsonRequestOptions {
  timeoutMs?: number;
  errorPrefix?: string;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readJsonResponse<T>(
  response: Response,
  errorPrefix = "request",
): Promise<T> {
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`${errorPrefix} HTTP ${response.status}${statusText}`);
  }

  try {
    return await response.json() as T;
  } catch (error) {
    throw new Error(`${errorPrefix} invalid JSON: ${getErrorMessage(error)}`);
  }
}

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: JsonRequestOptions = {},
): Promise<T> {
  const response = await fetchWithTimeout(input, init, options.timeoutMs);
  return readJsonResponse<T>(response, options.errorPrefix);
}

export async function postJsonWithTimeout<T>(
  input: RequestInfo | URL,
  body: unknown,
  init: RequestInit = {},
  options: JsonRequestOptions = {},
): Promise<T> {
  return fetchJsonWithTimeout<T>(
    input,
    {
      ...init,
      method: init.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
      body: JSON.stringify(body),
    },
    options,
  );
}
