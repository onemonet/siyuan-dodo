import {
  sortDayRange,
  type HeatmapDayCell,
} from "./heatmapCalendar";

export const HEATMAP_PRIMARY_MOUSE_BUTTON = 0;

export interface HeatmapSelectionState {
  selectedDay: string;
  rangeStart: string;
  rangeEnd: string;
  lastClickedDay: string;
  isDraggingRange: boolean;
  dragAnchorDay: string;
  previewStart: string;
  previewEnd: string;
}

export interface HeatmapSelectionEvent {
  dayKey: string;
  rangeStart: string;
  rangeEnd: string;
  date: Date | null;
}

export interface HeatmapSelectionResult {
  state: HeatmapSelectionState;
  selection: HeatmapSelectionEvent | null;
}

export function canStartHeatmapRangeDrag(
  state: HeatmapSelectionState,
  day: HeatmapDayCell,
  mouseEvent: MouseEvent,
): boolean {
  if (mouseEvent.button !== HEATMAP_PRIMARY_MOUSE_BUTTON) {
    return false;
  }

  return !(mouseEvent.shiftKey && state.lastClickedDay && state.lastClickedDay !== day.dayKey);
}

export function startHeatmapRangeDrag(
  state: HeatmapSelectionState,
  day: HeatmapDayCell,
): HeatmapSelectionState {
  return {
    ...state,
    isDraggingRange: true,
    dragAnchorDay: day.dayKey,
    previewStart: day.dayKey,
    previewEnd: day.dayKey,
  };
}

export function previewHeatmapRangeDrag(
  state: HeatmapSelectionState,
  day: HeatmapDayCell,
): HeatmapSelectionState {
  if (!state.isDraggingRange) {
    return state;
  }

  const [previewStart, previewEnd] = sortDayRange(
    state.dragAnchorDay,
    day.dayKey,
  );

  return {
    ...state,
    previewStart,
    previewEnd,
  };
}

export function completeHeatmapRangeDrag(
  state: HeatmapSelectionState,
): HeatmapSelectionResult {
  if (!state.isDraggingRange) {
    return { state, selection: null };
  }

  const baseState = {
    ...state,
    isDraggingRange: false,
    previewStart: "",
    previewEnd: "",
  };

  if (!state.previewStart || !state.previewEnd || state.previewStart === state.previewEnd) {
    return { state: baseState, selection: null };
  }

  const nextState = applyRangeSelection(
    baseState,
    state.previewStart,
    state.previewEnd,
  );

  return {
    state: nextState,
    selection: createRangeSelectionEvent(state.previewStart, state.previewEnd),
  };
}

export function selectHeatmapDay(
  state: HeatmapSelectionState,
  day: HeatmapDayCell,
  mouseEvent: MouseEvent,
): HeatmapSelectionResult {
  if (mouseEvent.shiftKey && state.lastClickedDay && state.lastClickedDay !== day.dayKey) {
    const [rangeStart, rangeEnd] = sortDayRange(
      state.lastClickedDay,
      day.dayKey,
    );

    return {
      state: applyRangeSelection(state, rangeStart, rangeEnd),
      selection: createRangeSelectionEvent(rangeStart, rangeEnd),
    };
  }

  const selectedDay = state.selectedDay === day.dayKey ? "" : day.dayKey;
  const nextState = {
    ...state,
    selectedDay,
    rangeStart: "",
    rangeEnd: "",
    previewStart: "",
    previewEnd: "",
    isDraggingRange: false,
    lastClickedDay: day.dayKey,
  };

  return {
    state: nextState,
    selection: {
      dayKey: selectedDay,
      rangeStart: "",
      rangeEnd: "",
      date: day.date,
    },
  };
}

export function clearHeatmapSelection(
  state: HeatmapSelectionState,
): HeatmapSelectionResult {
  return {
    state: {
      ...state,
      selectedDay: "",
      rangeStart: "",
      rangeEnd: "",
      previewStart: "",
      previewEnd: "",
      lastClickedDay: "",
      isDraggingRange: false,
    },
    selection: {
      dayKey: "",
      rangeStart: "",
      rangeEnd: "",
      date: null,
    },
  };
}

function applyRangeSelection(
  state: HeatmapSelectionState,
  rangeStart: string,
  rangeEnd: string,
): HeatmapSelectionState {
  return {
    ...state,
    selectedDay: "",
    rangeStart,
    rangeEnd,
    lastClickedDay: "",
    previewStart: "",
    previewEnd: "",
    isDraggingRange: false,
  };
}

function createRangeSelectionEvent(
  rangeStart: string,
  rangeEnd: string,
): HeatmapSelectionEvent {
  return {
    dayKey: "",
    rangeStart,
    rangeEnd,
    date: null,
  };
}
