import type { SubPlugin } from "../types/plugin";
import { settings } from "../settings";
import { DatabaseMapViews } from "./map/map-view-service";
import { DatabaseVisualViews } from "./visual/visual-view-service";
import { MAP_GLOBAL_SETTINGS_CHANGED, MAP_SETTING_KEYS } from "./global-settings";
import { createMapMessageHandler } from "./map/map-interaction";
import { createTimelineMessageHandler } from "./visual/timeline-interaction";
import databaseViewStyles from "./database-view.css?inline";
import { registerCustomViewAgentCapabilities } from "./custom/agent-tools";
import { startCurrentDatabaseTracking } from "./custom/current-target";
import { NativeDatabaseViewReconciler } from "./core/native-view-reconcile";
import { createSiYuanSkillRuntime } from "../lets-excalidraw/libs/skill-runtime";
import { plugin } from "../utils";

const MODULE_NAME = "database-view";
const STYLE_ID = "dodo-database-view-styles";

/** Native SiYuan table views remain the data source; the module owns custom renderers. */
export default class DatabaseViewPlugin implements SubPlugin {
  name = MODULE_NAME;
  displayName = "数据库视图";
  enabled = true;
  private active = false;
  private capabilitiesRegistered = false;
  private stopCurrentTracking: (() => void) | null = null;
  private readonly nativeViewReconciler = new NativeDatabaseViewReconciler();
  private readonly mapViews = new DatabaseMapViews();
  private readonly visualViews = new DatabaseVisualViews(
    this.mapViews,
    () => settings.getBySpace(this.name, "map-view-enabled") !== false,
    () => settings.getBySpace(this.name, "chart-view-enabled") !== false,
    () => settings.getBySpace(this.name, "timeline-view-enabled") !== false,
    () => settings.getBySpace(this.name, "gantt-view-enabled") !== false,
    () => settings.getBySpace(this.name, "calendar-view-enabled") !== false,
    () => settings.getBySpace(this.name, "custom-view-enabled") !== false,
  );

  private readonly handleMapMessage = createMapMessageHandler(this.mapViews);
  private readonly handleTimelineMessage = createTimelineMessageHandler(
    source => this.visualViews.getTimelineFrameContext(source));

  /** One-time copy of map provider credentials and styles, without changing AV attributes. */
  private async migrateMapSettings(): Promise<void> {
    if (settings.getBySpace(this.name, "legacy-map-settings-migrated") === true) return;
    for (const key of MAP_SETTING_KEYS) {
      const oldValue = settings.getBySpace("custom-block", key);
      if (oldValue !== undefined) settings.setBySpace(this.name, key, oldValue);
    }
    settings.setBySpace(this.name, "legacy-map-settings-migrated", true);
    await settings.save();
  }

  async onload(): Promise<void> {
    this.active = true;
    this.stopCurrentTracking = startCurrentDatabaseTracking();
    this.nativeViewReconciler.start();
    if (!this.capabilitiesRegistered) this.capabilitiesRegistered =
      registerCustomViewAgentCapabilities(plugin, () => this.active,
        () => this.visualViews.refreshFrames(),
        (blockId,viewId,avID) => this.visualViews.ensureCustomViewForAgent(blockId,viewId,avID));
    // Bundling SKILL.md only exposes the raw files under data/plugins.
    // The SiYuan Agent skill picker scans data/storage/ai/agent/skills.
    // Reuse the same ownership-aware installer as Dodo Excalidraw.
    const skills = createSiYuanSkillRuntime({ pluginName: plugin.name });
    const skill = await skills.registerPluginSkill("skills/dodo-custom-view")
      .catch(error => ({ok:false,code:"REGISTER_FAILED",error:String(error)}));
    if ("code" in skill) console.warn(
      `[Dodo 自定义视图] 无法注册 Agent Skill：${skill.code} ${skill.error || ""}`);
    await this.migrateMapSettings();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = databaseViewStyles;
    window.addEventListener("message", this.handleMapMessage);
    window.addEventListener("message", this.handleTimelineMessage);
    this.syncViewEnableState();
    // Refresh any already-open legacy map if the new settings were just migrated.
    window.dispatchEvent(new Event(MAP_GLOBAL_SETTINGS_CHANGED));
  }

  onLayoutReady(): void { this.mapViews.refresh(); this.visualViews.refresh(); }
  onProtyleLoaded(): void { this.mapViews.refresh(); this.visualViews.refresh(); }

  onDataChanged(): void {
    this.syncViewEnableState();
    this.mapViews.refreshFrames();
    this.visualViews.refreshFrames();
    window.dispatchEvent(new Event(MAP_GLOBAL_SETTINGS_CHANGED));
  }

  private syncViewEnableState(): void {
    const map = settings.getBySpace(this.name, "map-view-enabled") !== false;
    const chart = settings.getBySpace(this.name, "chart-view-enabled") !== false;
    const timeline = settings.getBySpace(this.name, "timeline-view-enabled") !== false;
    const gantt = settings.getBySpace(this.name, "gantt-view-enabled") !== false;
    const calendar = settings.getBySpace(this.name, "calendar-view-enabled") !== false;
    const custom = settings.getBySpace(this.name, "custom-view-enabled") !== false;
    if (map) this.mapViews.start();
    else this.mapViews.stop();
    // The shared native-view picker is owned by visualViews.
    if (map || chart || timeline || gantt || calendar || custom) this.visualViews.start();
    else this.visualViews.stop();
  }

  onunload(): void {
    this.active = false;
    this.stopCurrentTracking?.();
    this.stopCurrentTracking = null;
    this.nativeViewReconciler.stop();
    window.removeEventListener("message", this.handleMapMessage);
    window.removeEventListener("message", this.handleTimelineMessage);
    this.mapViews.stop();
    this.visualViews.stop();
    document.getElementById(STYLE_ID)?.remove();
  }
}
