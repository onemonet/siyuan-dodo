<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { sql } from "@/api";
  import "./fomoYearHeatmap.css";
  import { HeatmapStatsService } from "../services/HeatmapStatsService";
  import {
    buildYearHeatmapMonths,
    type YearHeatmapMonthBlock,
  } from "../utils/yearHeatmap";
  import FomoYearHeatmapGrid from "./FomoYearHeatmapGrid.svelte";
  import FomoYearHeatmapToolbar from "./FomoYearHeatmapToolbar.svelte";

  const ERROR_MESSAGES = {
    loadFailure: "年度热力图加载失败",
  } as const;

  export let year: number = new Date().getFullYear();

  const heatmapStatsService = new HeatmapStatsService({ querySQL: sql });
  const dispatch = createEventDispatcher<{
    dayclick: { dayKey: string };
  }>();

  let mounted = false;
  let loading = true;
  let error = "";
  let maxCount = 0;
  let months: YearHeatmapMonthBlock[] = [];

  async function loadData(targetYear: number): Promise<void> {
    loading = true;
    error = "";

    const result = await heatmapStatsService.queryYearHeatmapDays(targetYear);
    if (result.error) {
      error = result.error || ERROR_MESSAGES.loadFailure;
      months = [];
      maxCount = 0;
      loading = false;
      return;
    }

    const calendar = buildYearHeatmapMonths(targetYear, result.data);
    months = calendar.months;
    maxCount = calendar.maxCount;
    loading = false;
  }

  function handleDayClick(event: CustomEvent<{ dayKey: string }>): void {
    dispatch("dayclick", event.detail);
  }

  onMount(() => {
    mounted = true;
  });

  $: if (mounted) {
    void loadData(year);
  }
</script>

<div class="year-heatmap">
  <FomoYearHeatmapToolbar {year} />

  {#if loading}
    <div class="status">年度热力图加载中...</div>
  {:else if error}
    <div class="status error">{error}</div>
  {:else}
    <FomoYearHeatmapGrid {months} {maxCount} on:dayclick={handleDayClick} />
  {/if}
</div>
