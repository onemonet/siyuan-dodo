const SQL_LIKE_ESCAPE_CHARACTER = "\\";
const HTTP_URL_PROTOCOLS = new Set(["http:", "https:"]);
const HASH_OR_QUERY_REGEX = /[?#]/;

export const SQL_LIKE_ESCAPE_CLAUSE = "ESCAPE '\\'";

export interface AbortSignalScope {
  signal: AbortSignal;
  dispose(): void;
}

export interface PathApi {
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
}

export interface SqlStatementScanResult {
  code: string;
  hasComment: boolean;
  hasMultipleStatements: boolean;
  hasUnclosedToken: boolean;
}

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function sqlString(value: string): string {
  return `'${escapeSqlString(value)}'`;
}

export function escapeSqlLikeValue(value: string): string {
  return escapeSqlString(value)
    .replace(/\\/g, `${SQL_LIKE_ESCAPE_CHARACTER}${SQL_LIKE_ESCAPE_CHARACTER}`)
    .replace(/%/g, `${SQL_LIKE_ESCAPE_CHARACTER}%`)
    .replace(/_/g, `${SQL_LIKE_ESCAPE_CHARACTER}_`);
}

export function sqlLikeContains(value: string): string {
  return `'%${escapeSqlLikeValue(value)}%'`;
}

export function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\A ")
    .replace(/\r/g, "\\D ")
    .replace(/\f/g, "\\C ");
}

export function cssUrl(value: string): string {
  return `url("${escapeCssString(value)}")`;
}

export function parseHttpUrl(value: string): URL | null {
  try {
    const parsedUrl = new URL(value);
    return HTTP_URL_PROTOCOLS.has(parsedUrl.protocol) ? parsedUrl : null;
  } catch {
    return null;
  }
}

export function stripHashAndQuery(value: string): string {
  const cutIndex = value.search(HASH_OR_QUERY_REGEX);
  return cutIndex >= 0 ? value.slice(0, cutIndex) : value;
}

export function decodeUriComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function hasSafePathSegments(value: string): boolean {
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isSubPath(pathApi: PathApi, parent: string, child: string): boolean {
  const relativePath = pathApi.relative(parent, child);
  return relativePath === "" || (
    !!relativePath &&
    !relativePath.startsWith("..") &&
    !pathApi.isAbsolute(relativePath)
  );
}

export function scanSqlStatement(statement: string): SqlStatementScanResult {
  const codeChars = statement.split("").map((char) => /\s/.test(char) ? char : " ");
  let quoteEnd: string | null = null;
  let hasComment = false;
  let hasUnclosedToken = false;

  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];
    const nextChar = statement[index + 1];

    if (quoteEnd) {
      if ((quoteEnd === "'" || quoteEnd === "\"") && char === quoteEnd && nextChar === quoteEnd) {
        index += 1;
        continue;
      }

      if (char === quoteEnd) {
        quoteEnd = null;
      }
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quoteEnd = char;
      continue;
    }

    if (char === "[") {
      quoteEnd = "]";
      continue;
    }

    if (char === "-" && nextChar === "-") {
      hasComment = true;
      index += 2;
      while (index < statement.length && statement[index] !== "\n" && statement[index] !== "\r") {
        index += 1;
      }
      index -= 1;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      hasComment = true;
      index += 2;
      while (index < statement.length && !(statement[index] === "*" && statement[index + 1] === "/")) {
        index += 1;
      }
      if (index >= statement.length) {
        hasUnclosedToken = true;
        break;
      }
      index += 1;
      continue;
    }

    codeChars[index] = char;
  }

  if (quoteEnd) {
    hasUnclosedToken = true;
  }

  const code = codeChars.join("");
  const lastNonWhitespaceIndex = findLastNonWhitespaceIndex(code);
  const semicolonIndexes = findCharacterIndexes(code, ";");
  const hasMultipleStatements = semicolonIndexes.some((index) => index < lastNonWhitespaceIndex);

  return {
    code,
    hasComment,
    hasMultipleStatements,
    hasUnclosedToken,
  };
}

function findLastNonWhitespaceIndex(value: string): number {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (!/\s/.test(value[index])) {
      return index;
    }
  }
  return -1;
}

function findCharacterIndexes(value: string, character: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === character) {
      indexes.push(index);
    }
  }
  return indexes;
}

export function createAbortSignalScope(
  externalSignal?: AbortSignal,
  timeoutMs = 60_000,
): AbortSignalScope {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  const timeoutId = timeoutMs > 0 ? setTimeout(abort, timeoutMs) : null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      abort();
    } else {
      externalSignal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    dispose() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      externalSignal?.removeEventListener("abort", abort);
    },
  };
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<Response> {
  const signalScope = createAbortSignalScope(init.signal ?? undefined, timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: signalScope.signal,
    });
  } finally {
    signalScope.dispose();
  }
}

/** Keep the abort deadline active while the response body is consumed. */
export async function fetchWithBodyTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
  readBody: (response: Response) => Promise<T>,
): Promise<{ response: Response; body: T }> {
  const signalScope = createAbortSignalScope(init.signal ?? undefined, timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: signalScope.signal,
    });
    const body = await readBody(response);
    return { response, body };
  } finally {
    signalScope.dispose();
  }
}

/** Bound APIs that do not expose an AbortSignal (for example Siyuan fetchSyncPost). */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation = "Operation timed out"): Promise<T> {
  if (!(timeoutMs > 0)) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(operation)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
