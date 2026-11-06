<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import FomoMonthlyBar from "./FomoMonthlyBar.svelte";
  import FomoTimeDistribution from "./FomoTimeDistribution.svelte";
  import FomoYearHeatmap from "./FomoYearHeatmap.svelte";

  export let statsYear: number;

  const dispatch = createEventDispatcher<{
    dayclick: { dayKey: string };
    monthclick: { year: number; month: number };
  }>();

  function handleDayClick(event: CustomEvent<{ dayKey: string }>): void {
    dispatch("dayclick", event.detail);
  }

  function handleMonthClick(
    event: CustomEvent<{ year: number; month: number }>,
  ): void {
    dispatch("monthclick", event.detail);
  }
</script>

<section class="stats-view">
  <FomoYearHeatmap
    year={statsYear}
    on:dayclick={handleDayClick}
  />

  <div class="stats-grid">
    <FomoMonthlyBar on:monthclick={handleMonthClick} />
    <FomoTimeDistribution />
  </div>
</section>

<style>
  .stats-view {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 14px;
  }

  @media (max-width: 960px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
