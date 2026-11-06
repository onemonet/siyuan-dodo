import type { AvRenderData } from "../../shared/av/av-data-adapter";
import { makeScheduleResult, avRows, avCell, resolvedScheduleKeys, groupLabel,
  type ScheduleConfig, type ScheduledRecord } from "../core/schedule-model";
export {
  SCHEDULE_FIELD_TYPES as GANTT_FIELD_TYPES,
  SCHEDULE_FIELDS as GANTT_FIELDS,
  isValidAvID as isValidGanttID,
  prepareScheduleMapping as prepareGanttMapping,
  resolvedScheduleKeys as resolvedGanttKeys,
  avRows as ganttRows,
  avCell as ganttCell,
  formatDate as formatGanttDate,
  formatMinute as formatGanttMinute,
  minuteMode as ganttMinuteMode,
  addMinutes as addGanttMinutes,
  parseWallTime as parseGanttWallTime,
  addDays as addGanttDays,
  makeDateValue as makeGanttDateValue,
  makeProgressValue as makeGanttProgressValue
} from "../core/schedule-model";

export type { ScheduleField as GanttField, ScheduleMapping as GanttMapping } from "../core/schedule-model";

export interface GanttConfig extends ScheduleConfig {
  zoom?: "hour" | "day" | "week" | "month";
  demo?: boolean;
}
export interface GanttTask extends ScheduledRecord {
  parent?: string; type?: string; readonly?: boolean; open?: boolean;
}
export interface GanttResult {
  data: GanttTask[]; links: []; mapping: import("../core/schedule-model").ScheduleMapping;
  skipped: number; warning: string;
}

/** Group headers are Gantt presentation, never native database records. */
export function makeGanttResult(raw: AvRenderData, config: GanttConfig): GanttResult {
  const result = makeScheduleResult(raw, config);
  const keys = resolvedScheduleKeys(raw, result.mapping);
  if (!keys.group) return { ...result, links: [] };
  const rows = new Map(avRows(raw).map(row => [row.id, row]));
  const groups = new Map<string, GanttTask[]>();
  for (const task of result.data) {
    const category = groupLabel(avCell(rows.get(task.id)!, keys.group)) || "未分组";
    const members = groups.get(category) || [];
    members.push(task); groups.set(category, members);
  }
  const data: GanttTask[] = [];
  let index = 0;
  for (const [label, members] of groups) {
    const dates = members.map(task => task.start_date).sort();
    const ends = members.map(task => task.end_date).sort();
    const id = "dodo-group-" + index++;
    data.push({ id, text: label, type: "project", start_date: dates[0],
      end_date: ends[ends.length - 1],
      progress: members.reduce((sum, task) => sum + task.progress, 0) / members.length,
      readonly: true, open: true });
    for (const task of members) data.push({ ...task, parent: id });
  }
  return { ...result, data, links: [] };
}
