import type { ChartBlockConfig } from "../../lets-custom-block/chart/types";
import type { TimelineBlockConfig } from "../../lets-custom-block/timeline/types";
import type { GanttConfig } from "../gantt/gantt-model";
import type { CalendarConfig } from "../calendar/calendar-model";
import type { CustomViewConfig } from "../view-config-schema";

export type VisualKind = "chart" | "timeline" | "gantt" | "calendar" | "custom";
export interface VisualConfig {
  kind: VisualKind;
  enabled?: boolean;
  chart?: ChartBlockConfig;
  timeline?: Partial<TimelineBlockConfig>;
  gantt?: GanttConfig;
  calendar?: CalendarConfig;
  custom?: CustomViewConfig;
}