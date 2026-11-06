const DEBUG_STORAGE_KEY = "siyuan-dodo:custom-block-debug";

export function isCustomBlockDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function logCustomBlockDebug(scope: string, payload?: unknown) {
  if (!isCustomBlockDebugEnabled()) {
    return;
  }

  if (payload === undefined) {
    console.log(`[custom-block][${scope}]`);
    return;
  }

  console.log(`[custom-block][${scope}]`, payload);
}

export function startCustomBlockTimer(scope: string, payload?: unknown) {
  if (!isCustomBlockDebugEnabled()) {
    return () => undefined;
  }

  const startedAt = performance.now();
  logCustomBlockDebug(`${scope}:start`, payload);

  return (endPayload?: unknown) => {
    const duration = Number((performance.now() - startedAt).toFixed(2));
    logCustomBlockDebug(`${scope}:end`, {
      durationMs: duration,
      ...(endPayload && typeof endPayload === "object"
        ? (endPayload as Record<string, unknown>)
        : endPayload !== undefined
          ? { value: endPayload }
          : {}),
    });
  };
}

export function waitForNextPaint(): Promise<number> {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve(Number((performance.now() - startedAt).toFixed(2)));
    });
  });
}

export { DEBUG_STORAGE_KEY };
