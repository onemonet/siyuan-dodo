const DEBUG_STORAGE_KEY = "siyuan-dodo-debug";

function isDebugEnabled(): boolean {
  try {
    const value = globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY);
    return import.meta.env.DEV || value === "1" || value === "true";
  } catch {
    return import.meta.env.DEV;
  }
}

function withScope(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

export function createLogger(scope: string) {
  return {
    debug(message: string, payload?: unknown): void {
      if (!isDebugEnabled()) {
        return;
      }
      if (payload === undefined) {
        console.debug(withScope(scope, message));
      } else {
        console.debug(withScope(scope, message), payload);
      }
    },
    info(message: string, payload?: unknown): void {
      if (!isDebugEnabled()) {
        return;
      }
      if (payload === undefined) {
        console.info(withScope(scope, message));
      } else {
        console.info(withScope(scope, message), payload);
      }
    },
    warn(message: string, payload?: unknown): void {
      if (payload === undefined) {
        console.warn(withScope(scope, message));
      } else {
        console.warn(withScope(scope, message), payload);
      }
    },
    error(message: string, payload?: unknown): void {
      if (payload === undefined) {
        console.error(withScope(scope, message));
      } else {
        console.error(withScope(scope, message), payload);
      }
    },
  };
}
