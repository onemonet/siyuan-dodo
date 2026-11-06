import type { VisualKind } from "./visual-types";
import type { VisualWriteBridge } from "./visual-render-bridge";
import { createGanttMessageHandler } from "../gantt/gantt-interaction";
import { createCalendarMessageHandler } from "../calendar/calendar-interaction";
import { renderGanttView, saveGanttTimeStepView, saveGanttEditView } from "../gantt/gantt-renderer";
import { renderCalendarView, saveCalendarCreateView, saveCalendarEditView } from "../calendar/calendar-renderer";
import { createCustomMessageHandler } from "../custom/interaction";

export interface VisualInteractionBridge extends VisualWriteBridge {
  running(): boolean;
}

/** View-owned incoming iframe protocols. Ordinary view refreshes never need
 * a message handler; adding a new interactive mode registers its adapter here.
 */
export const visualInteractions: Partial<Record<VisualKind,
  (bridge: VisualInteractionBridge) => (event: MessageEvent) => void>> = {
  custom: bridge => createCustomMessageHandler(bridge),
  gantt: bridge => createGanttMessageHandler({
    running: () => bridge.running(),
    mounted: () => bridge.mounted(),
    currentView: header => bridge.currentView(header),
    render: av => renderGanttView(av, bridge),
    saveTimeStep: (av, mounted, requestId, timeStep, zoom) =>
      saveGanttTimeStepView(av, mounted, requestId, timeStep, zoom, bridge),
    saveEdit: (av, mounted, change) => saveGanttEditView(av, mounted, change, bridge),
    saving: bridge.ganttSaving,
  }),
  calendar: bridge => createCalendarMessageHandler({
    running: () => bridge.running(),
    mounted: () => bridge.mounted(),
    currentView: header => bridge.currentView(header),
    render: av => renderCalendarView(av, bridge),
    saveCreate: (av, mounted, message) => saveCalendarCreateView(av, mounted, message, bridge),
    saveEdit: (av, mounted, entry, message) =>
      saveCalendarEditView(av, mounted, entry, message, bridge),
    saving: bridge.calendarSaving,
  }),
};

