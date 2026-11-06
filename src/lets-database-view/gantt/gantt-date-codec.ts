/** Compatibility names for the Gantt renderer. */
export {
  formatNativeDate as formatNativeGanttDate,
  parseCalendarDay as parseGanttCalendarDay,
  parseCalendarMinute as parseGanttCalendarMinute,
  canonicalNativeMinute as canonicalNativeGanttMinute,
  toNativeTimestamp as toNativeGanttTimestamp,
  shiftNativeRangeEnd as shiftNativeGanttRangeEnd
} from "../core/date-codec";
