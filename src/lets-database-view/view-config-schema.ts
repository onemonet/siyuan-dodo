import type { MapBlockConfig } from "./map/map-data";
import type { ChartBlockConfig } from "../lets-custom-block/chart/types";
import type { TimelineBlockConfig } from "../lets-custom-block/timeline/types";
import type { GanttConfig } from "./gantt/gantt-model";
import type { CalendarConfig } from "./calendar/calendar-model";
export const DATABASE_VIEWS_ATTR = "custom-dodo-views";
export const DATABASE_VIEWS_SCHEMA = 1;
export type ViewMode = "table" | "map" | "chart" | "timeline" | "gantt" | "calendar" | "custom";

/** Refers to an HTML app stored in /data/storage/petal/siyuan-dodo/custom-views/. */
export interface CustomViewConfig {
  appId: string;
  height?: number;
  /** User-granted per-view capability; never inferred from Agent-generated HTML. */
  allowWrites?: boolean;
}

export interface StoredDatabaseView {
  mode: ViewMode;
  configs: {
    map?: MapBlockConfig;
    chart?: ChartBlockConfig;
    timeline?: Partial<TimelineBlockConfig>;
    /** View configuration only; all task data remains in native SiYuan AV. */
    gantt?: GanttConfig;
    calendar?: CalendarConfig;
    custom?: CustomViewConfig;
  };
  appearance?: { initialized?: boolean };
}
export interface DatabaseViewDocument {
  schemaVersion: 1;
  views: Record<string, StoredDatabaseView>;
}
const ID = /^\d{14}-[a-z0-9]{7}$/;
const allowed = new Set<ViewMode>(["table", "map", "chart", "timeline", "gantt", "calendar", "custom"]);

export function readDatabaseViewDocument(raw?: string): DatabaseViewDocument {
  if (!raw) return { schemaVersion: 1, views: {} };
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { throw new Error("数据库自定义视图 JSON 无效。"); }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      (decoded as any).schemaVersion !== DATABASE_VIEWS_SCHEMA) {
    throw new Error("数据库自定义视图配置版本不受支持。");
  }
  const source = (decoded as any).views;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("数据库自定义视图配置缺少 views 对象。");
  }
  const views: Record<string, StoredDatabaseView> = {};
  for (const [viewId, value] of Object.entries(source)) {
    if (!ID.test(viewId) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as StoredDatabaseView;
    if (!allowed.has(entry.mode) || !entry.configs || typeof entry.configs !== "object" ||
        Array.isArray(entry.configs)) continue;
    views[viewId] = entry;
  }
  return { schemaVersion: 1, views };
}

export function activeMapConfigs(doc: DatabaseViewDocument): Record<string, MapBlockConfig> {
  const result: Record<string, MapBlockConfig> = {};
  for (const [id, view] of Object.entries(doc.views)) {
    if (view.mode === "map" && view.configs.map) result[id] = view.configs.map;
  }
  return result;
}

export function activeVisualConfigs(doc: DatabaseViewDocument): Record<string, {
  kind: "chart" | "timeline" | "gantt" | "calendar" | "custom";
  enabled: true;
  chart?: ChartBlockConfig;
  timeline?: Partial<TimelineBlockConfig>;
  gantt?: GanttConfig;
  calendar?: CalendarConfig;
  custom?: CustomViewConfig;
}> {
  const result: ReturnType<typeof activeVisualConfigs> = {};
  for (const [id, view] of Object.entries(doc.views)) {
    if (view.mode === "chart" || view.mode === "timeline" || view.mode === "gantt" || view.mode === "calendar" || view.mode === "custom") {
      result[id] = { kind: view.mode, enabled: true, ...view.configs };
    }
  }
  return result;
}