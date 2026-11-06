import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { InteractionFeature } from "../toolbar/types";
import {
  DEFAULT_DRAWING_INITIAL_STYLE,
  captureCurrentDrawingStyle,
  normalizeDrawingStyle,
  type DrawingStyle,
} from "../../drawing-style";

/** Last-used drawing styles stay on THIS browser, independent from SiYuan's
 * synchronized default preset saved in dodo-config.
 */
export const LOCAL_DRAWING_STYLE_KEY = "siyuan-embed-excalidraw.tool-state";

function readLastUsedStyle(): DrawingStyle {
  try {
    const raw = localStorage.getItem(LOCAL_DRAWING_STYLE_KEY);
    return raw ? normalizeDrawingStyle(JSON.parse(raw)) : {};
  } catch { return {}; }
}

export interface DrawingStyleSession {
  setRememberLastUsed(enabled: boolean): void;
  destroy(): void;
}

/** Apply defaults exactly once on canvas open, then (optionally) remember edits.
 * Only Excalidraw's currentItem* appState is patched, never existing elements.
 * Priority: SiYuan synced initialization -> localStorage if enabled.
 */
export function startDrawingStyleSession(
  api: any, syncedInitialization: unknown, rememberLastUsed: boolean,
): DrawingStyleSession {
  const initialization = {
    ...DEFAULT_DRAWING_INITIAL_STYLE,
    ...normalizeDrawingStyle(syncedInitialization),
    ...(rememberLastUsed ? readLastUsedStyle() : {}),
  };
  api.updateScene({
    appState: initialization,
    captureUpdate: CaptureUpdateAction.NEVER,
  });

  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "";
  let disposed = false;
  const flush = () => {
    if (!last) return;
    try { localStorage.setItem(LOCAL_DRAWING_STYLE_KEY, last); }
    catch { /* localStorage disabled, session remains usable */ }
  };
  const onChange = (_elements?: unknown, appState?: Record<string, unknown>) => {
    if (disposed) return;
    const next = JSON.stringify(captureCurrentDrawingStyle(appState || api.getAppState()));
    if (last === next) return;
    last = next;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, 500);
  };
  const setRememberLastUsed = (enabled: boolean) => {
    if (disposed) return;
    if (enabled === Boolean(unsubscribe)) return;
    if (enabled) {
      // Switching ON inside a canvas remembers its CURRENT style, rather than
      // unexpectedly loading the previous session's local override.
      unsubscribe = api.onChange(onChange);
      onChange(undefined, api.getAppState());
    } else {
      unsubscribe?.();
      unsubscribe = undefined;
      if (timer !== null) { clearTimeout(timer); timer = null; flush(); }
    }
  };
  setRememberLastUsed(rememberLastUsed);
  return {
    setRememberLastUsed,
    destroy() {
      if (disposed) return;
      setRememberLastUsed(false);
      disposed = true;
    },
  };
}

// The ToolbarHost owns the single style controller for initialization +
// browser-local persistence. Keep this feature only as a settings toggle.
const feature: InteractionFeature = {
  id: "toolStatePersistence",
  label: "默认样式持久化",
  description: "记住本机上次使用的颜色、描边、字体和箭头样式，存入 localStorage；关闭后仍使用插件同步的初始化预设。",
  defaultEnabled: false,
  mount() { return () => {}; },
};
export default feature;
