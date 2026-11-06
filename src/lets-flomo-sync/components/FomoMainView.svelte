<script lang="ts">
  import type { App } from "siyuan";
  import { createEventDispatcher } from "svelte";
  import FomoHeatmap from "../FomoHeatmap.svelte";
  import type { AsyncResult, HeatmapDay } from "../types";
  import NativeQueryEmbed from "./NativeQueryEmbed.svelte";

  const CONSTANTS = {
    customSqlNotice: "当前使用自定义 SQL，清空后会恢复可视筛选。",
  } as const;

  export let app: App;
  export let blockId = "";
  export let customSQL: string | null = null;
  export let customSQLError = "";
  export let finalSQL = "";
  export let selectedDay = "";
  export let selectedRangeStart = "";
  export let selectedRangeEnd = "";
  export let heatmapExpanded = false;
  export let loadHeatmapDays: () => Promise<AsyncResult<HeatmapDay[]>>;

  const dispatch = createEventDispatcher<{
    dayclick: { dayKey: string; rangeStart: string; rangeEnd: string };
  }>();

  function handleHeatmapDayClick(
    event: CustomEvent<{
      dayKey: string;
      rangeStart: string;
      rangeEnd: string;
    }>,
  ): void {
    dispatch("dayclick", event.detail);
  }
</script>

<section class="main-view">
  {#if customSQL}
    <div class:error={customSQLError} class="custom-sql-notice">
      {customSQLError || CONSTANTS.customSqlNotice}
    </div>
  {/if}

  {#if heatmapExpanded}
    <div class="heatmap-panel">
      <FomoHeatmap
        {selectedDay}
        rangeStart={selectedRangeStart}
        rangeEnd={selectedRangeEnd}
        {loadHeatmapDays}
        on:dayclick={handleHeatmapDayClick}
      />
    </div>
  {/if}

  <div class="memo-section">
    <NativeQueryEmbed
      {app}
      {blockId}
      sqlStatement={finalSQL}
      sqlError={customSQLError}
    />
  </div>
</section>

<style>
  .main-view {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    min-height: 0;
    margin: 0 auto;
  }

  .custom-sql-notice {
    font-size: 12px;
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--b3-theme-primary) 26%, transparent);
    border-radius: 10px;
    padding: 10px 12px;
  }

  .custom-sql-notice.error {
    color: var(--b3-theme-error, #d95c5c);
    background: color-mix(in srgb, var(--b3-theme-error, #d95c5c) 10%, transparent);
    border-color: color-mix(in srgb, var(--b3-theme-error, #d95c5c) 28%, transparent);
  }

  .heatmap-panel,
  .memo-section {
    width: 100%;
  }

  .memo-section {
    flex: 1;
    min-height: 360px;
    overflow: hidden;
  }
</style>
