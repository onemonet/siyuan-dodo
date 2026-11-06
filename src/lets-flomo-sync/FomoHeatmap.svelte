<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from "svelte";
  import { createLogger } from "../logger";
  import "./fomoHeatmap.css";
  import FomoHeatmapBody from "./components/FomoHeatmapBody.svelte";
  import FomoHeatmapHeader from "./components/FomoHeatmapHeader.svelte";
  import FomoHeatmapLegend from "./components/FomoHeatmapLegend.svelte";
  import type { AsyncResult, HeatmapDay } from "./types";
  import {
    buildHeatmapCalendar,
    type HeatmapDayCell,
    type HeatmapMonthLabel,
    type HeatmapWeek,
  } from "./utils/heatmapCalendar";
  import {
    canStartHeatmapRangeDrag,
    clearHeatmapSelection,
    completeHeatmapRangeDrag,
    previewHeatmapRangeDrag,
    selectHeatmapDay,
    startHeatmapRangeDrag,
    type HeatmapSelectionEvent,
    type HeatmapSelectionState,
  } from "./utils/heatmapSelection";

  const CONSTANTS = {
    loadErrorPrefix: "FomoHeatmap.loadHeatmap",
  } as const;
  const logger = createLogger("FomoHeatmap");

  export let selectedDay = "";
  export let rangeStart = "";
  export let rangeEnd = "";
  export let loadHeatmapDays: () => Promise<AsyncResult<HeatmapDay[]>>;

  const dispatch = createEventDispatcher<{
    dayclick: {
      dayKey: string;
      rangeStart: string;
      rangeEnd: string;
      date: Date | null;
    };
  }>();

  let maxCount = 0;
  let weeks: HeatmapWeek[] = [];
  let calendarElement: HTMLDivElement | null = null;
  let monthLabels: HeatmapMonthLabel[] = [];
  let totalCount = 0;
  let loading = true;
  let error = "";
  let selectionState: HeatmapSelectionState = {
    selectedDay,
    rangeStart,
    rangeEnd,
    lastClickedDay: "",
    isDraggingRange: false,
    dragAnchorDay: "",
    previewStart: "",
    previewEnd: "",
  };

  function clearCalendar(): void {
    weeks = [];
    monthLabels = [];
    totalCount = 0;
    maxCount = 0;
  }

  function applyCalendar(days: HeatmapDay[]): void {
    const calendar = buildHeatmapCalendar(days, new Date());
    weeks = calendar.weeks;
    monthLabels = calendar.monthLabels;
    totalCount = calendar.totalCount;
    maxCount = calendar.maxCount;
  }

  function dispatchDaySelection(selection: HeatmapSelectionEvent | null): void {
    if (!selection) {
      return;
    }

    dispatch("dayclick", selection);
  }

  function syncSelectionState(): void {
    selectedDay = selectionState.selectedDay;
    rangeStart = selectionState.rangeStart;
    rangeEnd = selectionState.rangeEnd;
  }

  function updateSelectionState(nextState: HeatmapSelectionState): void {
    selectionState = nextState;
    syncSelectionState();
  }

  function syncExternalSelection(): void {
    if (
      selectionState.selectedDay === selectedDay &&
      selectionState.rangeStart === rangeStart &&
      selectionState.rangeEnd === rangeEnd
    ) {
      return;
    }

    selectionState = {
      ...selectionState,
      selectedDay,
      rangeStart,
      rangeEnd,
      previewStart: "",
      previewEnd: "",
      isDraggingRange: false,
    };
  }

  function clearSelection(): void {
    const result = clearHeatmapSelection(selectionState);
    updateSelectionState(result.state);
    dispatchDaySelection(result.selection);
  }

  function handleCellMouseDown(
    day: HeatmapDayCell,
    event: MouseEvent,
  ): void {
    if (!canStartHeatmapRangeDrag(selectionState, day, event)) {
      return;
    }

    event.preventDefault();
    updateSelectionState(startHeatmapRangeDrag(selectionState, day));
  }

  function handleCellMouseEnter(day: HeatmapDayCell): void {
    updateSelectionState(previewHeatmapRangeDrag(selectionState, day));
  }

  function handleGlobalMouseUp(): void {
    const result = completeHeatmapRangeDrag(selectionState);
    updateSelectionState(result.state);
    dispatchDaySelection(result.selection);
  }

  function handleDayClick(day: HeatmapDayCell, event: MouseEvent): void {
    const result = selectHeatmapDay(selectionState, day, event);
    updateSelectionState(result.state);
    dispatchDaySelection(result.selection);
  }

  function handleCalendarCellMouseDown(
    event: CustomEvent<{ day: HeatmapDayCell; mouseEvent: MouseEvent }>,
  ): void {
    handleCellMouseDown(event.detail.day, event.detail.mouseEvent);
  }

  function handleCalendarCellMouseEnter(
    event: CustomEvent<{ day: HeatmapDayCell }>,
  ): void {
    handleCellMouseEnter(event.detail.day);
  }

  function handleCalendarDayClick(
    event: CustomEvent<{ day: HeatmapDayCell; mouseEvent: MouseEvent }>,
  ): void {
    handleDayClick(event.detail.day, event.detail.mouseEvent);
  }

  function scrollCalendarToEnd(): void {
    if (!calendarElement) {
      return;
    }

    if (calendarElement.scrollTo) {
      calendarElement.scrollTo({ left: calendarElement.scrollWidth });
      return;
    }

    calendarElement.scrollLeft = calendarElement.scrollWidth;
  }

  async function loadHeatmap(): Promise<void> {
    loading = true;
    error = "";

    const result = await loadHeatmapDays();
    if (result.error) {
      error = result.error;
      clearCalendar();
      logger.warn(CONSTANTS.loadErrorPrefix, { error: result.error });
      loading = false;
      return;
    }

    applyCalendar(result.data);
    loading = false;
    await tick();
    scrollCalendarToEnd();
  }

  onMount(() => {
    void loadHeatmap();
    window.addEventListener("mouseup", handleGlobalMouseUp);
  });

  onDestroy(() => {
    window.removeEventListener("mouseup", handleGlobalMouseUp);
  });

  $: canClearSelection = Boolean(selectedDay || (rangeStart && rangeEnd));
  $: syncExternalSelection();
</script>

<div class="fomo-heatmap">
  <FomoHeatmapHeader {totalCount} />

  <FomoHeatmapBody
    {loading}
    {error}
    {weeks}
    {monthLabels}
    {selectedDay}
    {rangeStart}
    {rangeEnd}
    previewStart={selectionState.previewStart}
    previewEnd={selectionState.previewEnd}
    {maxCount}
    bind:calendarElement
    on:cellmousedown={handleCalendarCellMouseDown}
    on:cellmouseenter={handleCalendarCellMouseEnter}
    on:dayclick={handleCalendarDayClick}
  />

  <FomoHeatmapLegend {canClearSelection} on:clear={clearSelection} />
</div>
