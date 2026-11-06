import type { AvRenderData } from "../../shared/av/av-data-adapter";
import {
  avCell, avRows, makeScheduleResult, resolvedScheduleKeys,
  type ScheduleMapping,
} from "../core/schedule-model";

export type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";
export const CALENDAR_VIEWS: CalendarView[] = ["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek"];
export interface CalendarConfig {
  fieldMapping?: Partial<ScheduleMapping>;
  defaultView?: CalendarView;
}
export interface CalendarEntry {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  editable: boolean;
  backgroundColor?: string;
  borderColor?: string;
  blockId?: string;
  valueId?: string;
  before: { start_date: string; end_date: string; progress: number };
}
export function makeCalendarResult(raw: AvRenderData, config: CalendarConfig) {
  // Share SiYuan keyID resolution, group-row traversal, native date interpretation,
  // colors and malformed-range safeguards with the existing Gantt renderer.
  const result = makeScheduleResult(raw, { fieldMapping: config.fieldMapping, timeStep: 15 });
  const keys = resolvedScheduleKeys(raw, result.mapping);
  const rows = new Map(avRows(raw).map(row => [row.id, row]));
  const events: CalendarEntry[] = [];
  for (const task of result.data) {
    const row = rows.get(task.id);
    if (!row) continue;
    const start = avCell(row, keys.start)?.date;
    const end = keys.end && keys.end !== keys.start
      ? avCell(row, keys.end)?.date : start;
    // A native all-day date must remain all-day after a move or resize.
    const allDay = start?.isNotTime !== false && end?.isNotTime !== false;
    const before = {
      start_date: allDay ? task.start_date.slice(0, 10) : task.start_date,
      end_date: allDay ? task.end_date.slice(0, 10) : task.end_date,
      progress: task.progress,
    };
    events.push({
      id: task.id,
      title: task.text,
      start: allDay ? before.start_date : task.start_date.replace(" ", "T"),
      end: allDay ? before.end_date : task.end_date.replace(" ", "T"),
      allDay,
      editable: !task.dateLocked,
      ...(task.color ? { backgroundColor: task.color, borderColor: task.color } : {}),
      blockId: task.blockId,
      valueId: task.valueId,
      before,
    });
  }
  return { events, mapping: result.mapping, warning: result.warning };
}
