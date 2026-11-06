import { normalizeToolbarPreferences, toolbarDefaults, toolbarPatch, type ToolbarPreferences } from "../../toolbar-preferences";
import type { ToolbarPreferenceConnection, ToolbarPreferenceFactory } from "./preference-client";

const preferenceKey = "dodo-excalidraw-browser:toolbar-preferences:v1";

/** Direct browser editor has no SiYuan plugin parent to answer postMessage.
 * Read the installed plugin's settings for initial defaults. Changes are kept
 * in this browser only: never overwrite the shared plugin config from a
 * second window while the SiYuan plugin may be writing it simultaneously.
 */
export class BrowserPreferenceClient implements ToolbarPreferenceConnection {
  private preferences: ToolbarPreferences = normalizeToolbarPreferences(toolbarDefaults);
  private ready: Promise<void> | null = null;
  private readonly onChange: (value: ToolbarPreferences) => void;
  constructor(onChange: (value: ToolbarPreferences) => void) {
    this.onChange = onChange;
  }
  private async initialize() {
    let base: unknown = {};
    try {
      const pluginName = location.pathname.split("/")[2];
      const response = await fetch("/api/file/getFile", {
        method: "POST",
        body: JSON.stringify({ path: `/data/storage/petal/${pluginName}/dodo-config` }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const config = await response.json();
      if (typeof config?.code === "number") throw new Error(config.msg || `API ${config.code}`);
      base = config?.excalidraw ?? {};
    } catch (error) {
      console.warn("读取思源画板工具栏设置失败，使用本地设置", error);
    }
    let overrides: unknown;
    try {
      const value = localStorage.getItem(preferenceKey);
      if (value) overrides = JSON.parse(value);
    } catch (error) {
      console.warn("读取浏览器工具栏设置失败", error);
    }
    // Synced initialization always comes from the SiYuan plugin config.
    // Browser-local toolbar overrides must never shadow this shared preset.
    const baseConfig = base && typeof base === "object" ? base as Record<string, unknown> : {};
    const localConfig = overrides && typeof overrides === "object" ? overrides as Record<string, unknown> : {};
    const { drawingInitialStyle: _ignoredBrowserInitial, ...localToolbar } = localConfig;
    this.preferences = normalizeToolbarPreferences({
      ...toolbarDefaults,
      ...baseConfig,
      ...localToolbar,
    });
  }
  async request(patch?: Partial<ToolbarPreferences>) {
    this.ready ??= this.initialize();
    await this.ready;
    if (patch) {
      if (Object.prototype.hasOwnProperty.call(patch, "drawingInitialStyle")) {
        throw new Error("初始化样式需要保存到思源插件配置，请在思源画布内操作。");
      }
      const next = normalizeToolbarPreferences({ ...this.preferences, ...toolbarPatch(patch) });
      localStorage.setItem(preferenceKey, JSON.stringify(next));
      this.preferences = next;
    }
    this.onChange(this.preferences);
    return this.preferences;
  }
  destroy() {}
}

export const browserPreferenceFactory: ToolbarPreferenceFactory = onChange => new BrowserPreferenceClient(onChange);
