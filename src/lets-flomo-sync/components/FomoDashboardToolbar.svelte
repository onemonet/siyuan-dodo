<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import "./fomoDashboardToolbar.css";
  import FomoDashboardTabs from "./FomoDashboardTabs.svelte";
  import FomoDailyReviewToolbarActions from "./FomoDailyReviewToolbarActions.svelte";
  import FomoMainToolbarActions from "./FomoMainToolbarActions.svelte";
  import FomoStatsToolbarActions from "./FomoStatsToolbarActions.svelte";
  import {
    DASHBOARD_TABS,
    type DashboardTab,
  } from "../utils/dashboardTabs";
  import type { MemoFilter, ReviewTimeRange } from "../utils/sql";

  export let activeTab: DashboardTab = DASHBOARD_TABS.main;
  export let isFilterExpanded = false;
  export let heatmapExpanded = false;
  export let filter: MemoFilter;
  export let reviewCount: number;
  export let reviewTimeRange: ReviewTimeRange;
  export let reviewSaveError = "";
  export let statsYear: number;
  export let currentYear: number;

  const dispatch = createEventDispatcher<{
    tabchange: { tab: DashboardTab };
    heatmaptoggle: void;
    filterchange: MemoFilter;
    customSQL: { sql: string };
    filterexpandchange: { expanded: boolean };
    reviewexpandchange: { expanded: boolean };
    reviewcountchange: { count: number };
    reviewrangechange: { timeRange: ReviewTimeRange };
    reviewreroll: void;
    statsexpandchange: { expanded: boolean };
    statsyearchange: { year: number };
  }>();

  function handleTabClick(tab: DashboardTab): void {
    dispatch("tabchange", { tab });
  }

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

  function handleReviewExpandChange(
    event: CustomEvent<{ expanded: boolean }>,
  ): void {
    dispatch("reviewexpandchange", event.detail);
  }

  function handleStatsExpandChange(
    event: CustomEvent<{ expanded: boolean }>,
  ): void {
    dispatch("statsexpandchange", event.detail);
  }
</script>

<div
  class="flomo-dashboard-toolbar-row"
  class:filter-expanded-mobile={isFilterExpanded}
>
  <FomoDashboardTabs
    {activeTab}
    isHiddenMobile={isFilterExpanded}
    on:tabchange={(event) => handleTabClick(event.detail.tab)}
  />

  {#if activeTab === DASHBOARD_TABS.main}
    <FomoMainToolbarActions
      {heatmapExpanded}
      {filter}
      on:heatmaptoggle={() => dispatch("heatmaptoggle")}
      on:filterchange={handleFilterChange}
      on:customSQL={handleCustomSQL}
      on:filterexpandchange={handleFilterExpandChange}
    />
  {:else if activeTab === DASHBOARD_TABS.review}
    <FomoDailyReviewToolbarActions
      {reviewCount}
      {reviewTimeRange}
      saveError={reviewSaveError}
      on:expandchange={handleReviewExpandChange}
    on:countchange={(event) => dispatch("reviewcountchange", event.detail)}
    on:rangechange={(event) => dispatch("reviewrangechange", event.detail)}
    on:reroll={() => dispatch("reviewreroll")}
  />
  {:else if activeTab === DASHBOARD_TABS.stats}
    <FomoStatsToolbarActions
      {statsYear}
      {currentYear}
      on:expandchange={handleStatsExpandChange}
      on:yearchange={(event) => dispatch("statsyearchange", event.detail)}
    />
  {/if}
</div>
