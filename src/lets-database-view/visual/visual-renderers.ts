import type { VisualKind } from "./visual-types";
import type { VisualRenderBridge } from "./visual-render-bridge";
import { renderChartView } from "./chart-renderer";
import { renderGanttView } from "../gantt/gantt-renderer";
import { renderCalendarView } from "../calendar/calendar-renderer";
import { renderCustomView } from "../custom/renderer";

/** Adding a read-only renderer requires registration here, not changes to
 * the DOM observer, aggregation controller or refresh scheduler. */
export const visualRenderers: Record<VisualKind,
  (av: HTMLElement, bridge: VisualRenderBridge) => void | Promise<void>> = {
  chart: renderChartView,
  gantt: renderGanttView,
  calendar: renderCalendarView,
  custom: renderCustomView,
  timeline: (av, bridge) => {
    bridge.mounted().get(av)?.frame.contentWindow?.postMessage({
      type: "dodoVisualRefresh", query: bridge.search(av),
    }, location.origin);
  },
};

