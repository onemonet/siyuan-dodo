<script lang="ts">
  import { createEventDispatcher } from "svelte";

  const CONSTANTS = {
    lessLabel: "少",
    moreLabel: "多",
    clearFilterLabel: "清除筛选 ×",
    heatLevels: [0, 1, 2, 3, 4, 5],
  } as const;

  export let canClearSelection = false;

  const dispatch = createEventDispatcher<{
    clear: void;
  }>();
</script>

<div class="heatmap-footer">
  <div class="heatmap-legend">
    <span>{CONSTANTS.lessLabel}</span>
    {#each CONSTANTS.heatLevels as heatLevel}
      <div
        class="legend-box"
        style={`background: var(--flomo-heat-${heatLevel})`}
      ></div>
    {/each}
    <span>{CONSTANTS.moreLabel}</span>
  </div>

  {#if canClearSelection}
    <button class="clear-filter" on:click={() => dispatch("clear")}>
      {CONSTANTS.clearFilterLabel}
    </button>
  {/if}
</div>

<style>
  .heatmap-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
  }

  .legend-box {
    width: 13px;
    height: 13px;
    border-radius: 0;
  }

  .clear-filter {
    font-size: 0.75rem;
    padding: 2px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: none;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .clear-filter:hover {
    opacity: 1;
  }
</style>
