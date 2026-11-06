<script lang="ts">
  import FomoHeatmapCalendar from "./FomoHeatmapCalendar.svelte";
  import type {
    HeatmapDayCell,
    HeatmapMonthLabel,
    HeatmapWeek,
  } from "../utils/heatmapCalendar";

  export let loading = true;
  export let error = "";
  export let weeks: HeatmapWeek[] = [];
  export let monthLabels: HeatmapMonthLabel[] = [];
  export let selectedDay = "";
  export let rangeStart = "";
  export let rangeEnd = "";
  export let previewStart = "";
  export let previewEnd = "";
  export let maxCount = 0;
  export let calendarElement: HTMLDivElement | null = null;
</script>

{#if loading}
  <div class="heatmap-status">加载中...</div>
{:else if error}
  <div class="heatmap-status error">{error}</div>
{:else}
  <FomoHeatmapCalendar
    {weeks}
    {monthLabels}
    {selectedDay}
    {rangeStart}
    {rangeEnd}
    {previewStart}
    {previewEnd}
    {maxCount}
    bind:calendarElement
    on:cellmousedown
    on:cellmouseenter
    on:dayclick
  />
{/if}
