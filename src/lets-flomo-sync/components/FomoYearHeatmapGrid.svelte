<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { getFlomoHeatColor } from "../utils/colors";
  import {
    YEAR_HEATMAP_WEEKDAY_LABELS,
    type YearHeatmapMonthBlock,
  } from "../utils/yearHeatmap";

  export let months: YearHeatmapMonthBlock[] = [];
  export let maxCount = 0;

  const dispatch = createEventDispatcher<{
    dayclick: { dayKey: string };
  }>();

  function colorForCount(count: number): string | null {
    return getFlomoHeatColor(count, maxCount);
  }
</script>

<div class="months-grid">
  {#each months as month}
    <section class="month-card">
      <header>{month.label}</header>

      <div class="weekday-row">
        {#each YEAR_HEATMAP_WEEKDAY_LABELS as weekday}
          <span>{weekday}</span>
        {/each}
      </div>

      <div class="day-grid">
        {#each month.cells as cell}
          {#if cell}
            <button
              class="day-cell"
              title={`${cell.dayKey} · ${cell.count} 条`}
              style={`background: ${colorForCount(cell.count)}`}
              type="button"
              on:click={() => dispatch("dayclick", { dayKey: cell.dayKey })}
            >
              {cell.dayNumber}
            </button>
          {:else}
            <div class="day-cell empty"></div>
          {/if}
        {/each}
      </div>
    </section>
  {/each}
</div>
