import { adaptAttributeViewRender, type AvRenderData } from "../../shared/av/av-data-adapter";
import { materializeTimelineFieldMapping } from "../../lets-custom-block/timeline/services/field-mapping";
import { prepareGanttMapping } from "../gantt/gantt-model";
import { prepareScheduleMapping } from "../core/schedule-model";
import type { StoredDatabaseView } from "../view-config-schema";
import type { VisualKind } from "./visual-types";
import chartSvg from "../assets/lucide-chart-no-axes-column.svg?raw";
import timelineSvg from "../assets/lucide-calendar-range.svg?raw";
import ganttSvg from "../assets/lucide-gantt-chart.svg?raw";

type ViewConfigs = StoredDatabaseView["configs"];
export const visualAppearance: Record<VisualKind, {
  name: string; iconFile: string; iconSvg: string; fallback: string;
}> = {
  chart: { name: "图表", iconFile: "dodo-lucide-chart.svg", iconSvg: chartSvg, fallback: "1f4ca" },
  timeline: { name: "时间线", iconFile: "dodo-lucide-calendar-range.svg", iconSvg: timelineSvg, fallback: "1f4c5" },
  gantt: { name: "甘特", iconFile: "dodo-lucide-gantt-chart.svg", iconSvg: ganttSvg, fallback: "1f4c8" },
  calendar: { name: "日历", iconFile: "dodo-lucide-calendar-range.svg", iconSvg: timelineSvg, fallback: "1f4c5" },
  custom: { name: "自定义", iconFile: "dodo-lucide-custom-html.svg",
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="m9 9-3 3 3 3m6-6 3 3-3 3"/></svg>', fallback: "1f4bb" },
};

/** Each built-in provides its first-use config. Unrelated saved view types
 * are never overwritten, including when a user returns to native table mode.
 */
const initializers: Record<VisualKind,
  (raw: AvRenderData, existing: ViewConfigs) => Partial<ViewConfigs>> = {
  chart(raw, existing) {
    if (existing.chart) return { chart: existing.chart };
    const metric = raw.view?.columns?.find(c => c.type === "number") ||
      raw.view?.columns?.find(c => c.type === "mSelect");
    if (!metric?.id) throw new Error("请先添加数字或多选列以生成图表。");
    const category = raw.view?.columns?.find(c => c.id !== metric.id &&
      (c.type === "select" || c.type === "mSelect" || c.type === "block"));
    return { chart: {type: "bar-basic", x: category?.id ? {column: category.id} : undefined,
      y: {column: metric.id, agg: metric.type === "mSelect" ? "count" : "value"}} };
  },
  timeline(raw, existing) {
    return { timeline: existing.timeline ||
      { fieldMapping: materializeTimelineFieldMapping(adaptAttributeViewRender(raw), {}).mapping } };
  },
  gantt(raw, existing) {
    return { gantt: { ...existing.gantt,
      fieldMapping: existing.gantt?.fieldMapping || prepareGanttMapping(raw, existing.gantt?.fieldMapping) } };
  },
  calendar(raw, existing) {
    return { calendar: { ...existing.calendar,
      fieldMapping: prepareScheduleMapping(raw, existing.calendar?.fieldMapping),
      defaultView: existing.calendar?.defaultView || "dayGridMonth" } };
  },
  custom(_raw, existing) {
    return existing.custom ? { custom: existing.custom } : {};
  },
};

export function prepareVisualConfigs(kind: VisualKind, existing: ViewConfigs, raw?: AvRenderData): Partial<ViewConfigs> {
  const prepared = raw ? initializers[kind](raw, existing) : {};
  if (kind !== "gantt") return prepared;
  const gantt = { ...existing.gantt, ...prepared.gantt };
  return { gantt: {
    ...gantt, fieldMapping: gantt.fieldMapping || {},
    progressMax: gantt.progressMax === 1 ? 1 : 100,
    timeStep: gantt.timeStep === 15 ? 15 : gantt.timeStep === 30 ? 30 : 0,
    demo: false,
  }};
}

