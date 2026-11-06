<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import IconButton from "@/components/IconButton.svelte";
  import ChartSpline from "lucide-svelte/icons/chart-spline";
  import FomoFilterBar from "./FomoFilterBar.svelte";
  import type { MemoFilter } from "../utils/sql";

  const TOOLBAR_LABELS = {
    heatmap: "热力图",
    collapseHeatmap: "收起热力图",
  } as const;

  export let heatmapExpanded = false;
  export let filter: MemoFilter;

  const dispatch = createEventDispatcher<{
    heatmaptoggle: void;
    filterchange: MemoFilter;
    customSQL: { sql: string };
    filterexpandchange: { expanded: boolean };
  }>();

  function handleFilterChange(event: CustomEvent<MemoFilter>): void {
    dispatch("filterchange", event.detail);
  }

  function handleCustomSQL(event: CustomEvent<{ sql: string }>): void {
    dispatch("customSQL", event.detail);
  }

  function handleFilterExpandChange(
    event: CustomEvent<{ expanded: boolean }>,
  ): void {
    dispatch("filterexpandchange", event.detail);
  }

  $: heatmapButtonLabel = heatmapExpanded
    ? TOOLBAR_LABELS.collapseHeatmap
    : TOOLBAR_LABELS.heatmap;
</script>

<div class="flomo-main-toolbar-actions">
  <IconButton
    label={heatmapButtonLabel}
    active={heatmapExpanded}
    on:click={() => dispatch("heatmaptoggle")}
  >
    <ChartSpline size={20} strokeWidth={1.8} aria-hidden="true" />
  </IconButton>

  <div class="flomo-toolbar-filter">
    <FomoFilterBar
      {filter}
      on:change={handleFilterChange}
      on:customSQL={handleCustomSQL}
      on:expandchange={handleFilterExpandChange}
    />
  </div>
</div>
