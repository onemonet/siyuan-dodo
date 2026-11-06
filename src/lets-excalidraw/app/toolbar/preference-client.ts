import { normalizeToolbarPreferences, type ToolbarPreferences } from "../../toolbar-preferences";

/** Preference transport shared by embedded (SiYuan message) and standalone (local) canvas. */
export interface ToolbarPreferenceConnection {
  request(patch?: Partial<ToolbarPreferences>): Promise<ToolbarPreferences>;
  destroy(): void;
}

export type ToolbarPreferenceFactory = (onChange: (value: ToolbarPreferences) => void) => ToolbarPreferenceConnection;

export class PreferenceClient implements ToolbarPreferenceConnection {
  private pending = new Map<string, { resolve: (value: ToolbarPreferences) => void; reject: (error: Error) => void; timer: number }>();
  private onChange: (value: ToolbarPreferences) => void;
  constructor(onChange: (value: ToolbarPreferences) => void) {
    this.onChange = onChange;
    window.addEventListener("message", this.receive);
  }
  private receive = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    let message: any;
    try { message = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (message?.event === "enhancementPreferencesChanged") this.onChange(normalizeToolbarPreferences(message.preferences));
    if (message?.event !== "enhancementPreferencesResult") return;
    const request = this.pending.get(message.requestId);
    if (!request) return;
    window.clearTimeout(request.timer);
    this.pending.delete(message.requestId);
    if (message.error) request.reject(new Error(message.error));
    else {
      const value = normalizeToolbarPreferences(message.preferences);
      this.onChange(value);
      request.resolve(value);
    }
  };
  request(patch?: Partial<ToolbarPreferences>) {
    return new Promise<ToolbarPreferences>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = window.setTimeout(() => { this.pending.delete(requestId); reject(new Error("工具栏设置响应超时，请重新打开画布。")); }, 10000);
      this.pending.set(requestId, { resolve, reject, timer });
      window.parent.postMessage(JSON.stringify({ event: patch ? "enhancementPreferencesSave" : "enhancementPreferencesRequest", requestId, patch }), location.origin);
    });
  }
  destroy() {
    window.removeEventListener("message", this.receive);
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timer);
      request.reject(new Error("画布已关闭。"));
    }
    this.pending.clear();
  }
}
