<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { getFlomoHeatColor } from "../utils/colors";
  import {
    isDayInRange,
    type HeatmapDayCell,
    type HeatmapMonthLabel,
    type HeatmapWeek,
  } from "../utils/heatmapCalendar";

  const CONSTANTS = {
    monthLabelStepPx: 18,
  } as const;

  export let weeks: HeatmapWeek[] = [];
  export let monthLabels: HeatmapMonthLabel[] = [];
  export let selectedDay = "";
  export let rangeStart = "";
  export let rangeEnd = "";
  export let previewStart = "";
  export let previewEnd = "";
  export let maxCount = 0;
  export let calendarElement: HTMLDivElement | null = null;

  const dispatch = createEventDispatcher<{
    cellmousedown: { day: HeatmapDayCell; mouseEvent: MouseEvent };
    cellmouseenter: { day: HeatmapDayCell };
    dayclick: { day: HeatmapDayCell; mouseEvent: MouseEvent };
  }>();

  function colorForCount(count: number): string {
    return getFlomoHeatColor(count, maxCount);
  }

  function handleCellMouseDown(
    day: HeatmapDayCell,
    mouseEvent: MouseEvent,
  ): void {
    dispatch("cellmousedown", { day, mouseEvent });
  }

  function handleCellMouseEnter(day: HeatmapDayCell): void {
    dispatch("cellmouseenter", { day });
  }

  function handleDayClick(day: HeatmapDayCell, mouseEvent: MouseEvent): void {
    dispatch("dayclick", { day, mouseEvent });
  }

  $: isInSelectedRange = (dayKey: string): boolean =>
    isDayInRange(dayKey, rangeStart, rangeEnd);
  $: isInPreviewRange = (dayKey: string): boolean =>
    isDayInRange(dayKey, previewStart, previewEnd);
</script>

<div class="calendar-container" bind:this={calendarElement}>
  <div class="month-labels-container">
    {#each monthLabels as label, monthLabelIndex}
      <div
        class="month-label"
        style={`left: ${label.weekIndex * CONSTANTS.monthLabelStepPx}px`}
        title={`${label.year}年${label.month}`}
      >
        {#if monthLabelIndex === 0 || label.year !== monthLabels[monthLabelIndex - 1]?.year}
          {label.year}年
        {/if}
        {label.month}
      </div>
    {/each}
  </div>

  <div class="calendar-weeks" role="list">
    {#each weeks as week}
      <div class="week" role="listitem">
        {#each week as day}
          {#if day}
            <button
              class="heat-cell"
              class:selected={selectedDay === day.dayKey}
              class:in-range={isInSelectedRange(day.dayKey) ||
                isInPreviewRange(day.dayKey)}
              class:has-data={day.count > 0}
              title={`${day.date.toLocaleDateString("zh-CN")}  ${day.count} 条`}
              style={`background-color: ${colorForCount(day.count)}; background: ${colorForCount(day.count)};`}
              on:mousedown={(event) => handleCellMouseDown(day, event)}
              on:mouseenter={() => handleCellMouseEnter(day)}
              on:click={(event) => handleDayClick(day, event)}
              aria-pressed={selectedDay === day.dayKey}
            >
              <span class="visually-hidden">{day.dayKey}</span>
            </button>
          {:else}
            <div class="heat-cell empty" aria-hidden="true"></div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .calendar-container {
    position: relative;
    overflow: hidden;
    width: 100%;
    padding: 10px 2px 6px;
    box-sizing: border-box;
  }

  .month-labels-container {
    position: absolute;
    top: 0;
    left: 2px;
    height: 18px;
    width: 100%;
    pointer-events: none;
    z-index: 10;
  }

  .month-label {
    position: absolute;
    top: 0;
    font-size: 0.7rem;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
    white-space: nowrap;
    pointer-events: none;
    transform: translateX(-50%);
    font-weight: 500;
  }

  .calendar-weeks {
    display: flex;
    gap: 2px;
    align-items: flex-start;
    padding-top: 20px;
  }

  .week {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .heat-cell {
    width: 16px;
    height: 16px;
    border-radius: 0;
    background-color: var(--flomo-heat-0, #efefef);
    border: none;
    padding: 0;
    margin: 0;
    transition: opacity 120ms ease;
    cursor: pointer;
  }

  .heat-cell.has-data {
    border-color: transparent;
  }

  .heat-cell:hover {
    opacity: 0.7;
  }

  .heat-cell.empty {
    background: transparent;
    border: none;
    cursor: default;
    visibility: hidden;
  }

  .heat-cell.selected {
    outline: 2px solid var(--flomo-accent, #2e8b57);
    outline-offset: 1px;
    transform: scale(1.15);
  }

  .heat-cell.in-range {
    position: relative;
  }

  .heat-cell.in-range::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--flomo-accent-muted, #4ea87a);
    opacity: 0.32;
    pointer-events: none;
  }

  .visually-hidden {
    position: absolute;
    left: -9999px;
  }
</style>
