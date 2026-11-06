<script lang="ts">
  import type { App } from "siyuan";
  import "./fomoDashboard.css";
  import {
    FLOMO_DEFAULT_LAYOUT,
    FLOMO_DEFAULT_TIME_FORMAT,
  } from "../config/constants";
  import FomoDashboardToolbar from "./components/FomoDashboardToolbar.svelte";
  import FomoDailyReview from "./components/FomoDailyReview.svelte";
  import FomoMainView from "./components/FomoMainView.svelte";
  import FomoStatsView from "./components/FomoStatsView.svelte";
  import type { DailyReviewConfig } from "./services/FlomoConfigStore";
  import { createDashboardDataBridge } from "./services/DashboardDataBridge";
  import type { AsyncResult } from "./types";
  import { FLOMO_DASHBOARD_COLOR_VARS } from "./utils/colors";
  import type { MemoFilter, ReviewTimeRange } from "./utils/sql";
  import { DASHBOARD_TABS, type DashboardTab } from "./utils/dashboardTabs";
  import {
    applyHeatmapDaySelection,
    applyReviewConfigToState,
    createDashboardState,
    deriveDashboardState,
    rerollDailyReview,
    selectDashboardTab,
    setCustomSQL,
    setDashboardExpandedState,
    setFilter,
    setReviewCount,
    setReviewTimeRange,
    setStatsYear,
    showStatsDayInMain,
    showStatsMonthInMain,
    toggleDashboardHeatmap,
    type DashboardDerivedState,
    type DashboardState,
  } from "./utils/dashboardState";

  interface DashboardPluginBridge {
    getMemoTimeFormat?: () => string;
    getDashboardBlockId?: () => string;
    getDailyReviewConfig?: () => DailyReviewConfig;
    setDailyReviewConfig?: (
      config: DailyReviewConfig,
    ) => Promise<AsyncResult<DailyReviewConfig>>;
  }

  export let app: App;
  export let pluginInstance: DashboardPluginBridge | null = null;

  const { loadMemos, loadBlockDOM, loadHeatmapDays, openMemo } =
    createDashboardDataBridge();

  let dashboardState: DashboardState = createDashboardState();
  let derivedState: DashboardDerivedState = deriveDashboardState(dashboardState);
  let memoTimeFormat: string = FLOMO_DEFAULT_TIME_FORMAT;
  let dashboardBlockId = "";
  let lastPluginInstance: DashboardPluginBridge | null = null;

  function handleHeatmapDayClick(
    event: CustomEvent<{
      dayKey: string;
      rangeStart: string;
      rangeEnd: string;
    }>,
  ): void {
    dashboardState = applyHeatmapDaySelection(dashboardState, event.detail);
  }

  function handleFilterChange(event: CustomEvent<MemoFilter>): void {
    dashboardState = setFilter(dashboardState, event.detail);
  }

  function handleCustomSQL(event: CustomEvent<{ sql: string }>): void {
    dashboardState = setCustomSQL(dashboardState, event.detail.sql);
  }

  function handleStatsDayClick(event: CustomEvent<{ dayKey: string }>): void {
    dashboardState = showStatsDayInMain(dashboardState, event.detail.dayKey);
  }

  function handleYearChange(event: CustomEvent<{ year: number }>): void {
    dashboardState = setStatsYear(dashboardState, event.detail.year);
  }

  function handleMonthClick(
    event: CustomEvent<{ year: number; month: number }>,
  ): void {
    dashboardState = showStatsMonthInMain(
      dashboardState,
      event.detail.year,
      event.detail.month,
    );
  }

  function handleTabChange(event: CustomEvent<{ tab: DashboardTab }>): void {
    dashboardState = selectDashboardTab(dashboardState, event.detail.tab);
  }

  function handleFilterExpandChange(
    event: CustomEvent<{ expanded: boolean }>,
  ): void {
    dashboardState = setDashboardExpandedState(
      dashboardState,
      "isFilterExpanded",
      event.detail.expanded,
    );
  }

  function handleReviewExpandChange(
    event: CustomEvent<{ expanded: boolean }>,
  ): void {
    dashboardState = setDashboardExpandedState(
      dashboardState,
      "isReviewSettingsExpanded",
      event.detail.expanded,
    );
  }

  function handleStatsExpandChange(
    event: CustomEvent<{ expanded: boolean }>,
  ): void {
    dashboardState = setDashboardExpandedState(
      dashboardState,
      "isStatsSettingsExpanded",
      event.detail.expanded,
    );
  }

  async function persistReviewSettings(
    nextCount: number,
    nextRange: ReviewTimeRange,
  ): Promise<AsyncResult<null>> {
    if (!pluginInstance?.setDailyReviewConfig) {
      return { data: null, error: null };
    }

    const result = await pluginInstance.setDailyReviewConfig({
      count: nextCount,
      timeRange: nextRange,
    });

    if (result.error) {
      return {
        data: null,
        error: result.error,
      };
    }

    dashboardState = applyReviewConfigToState(dashboardState, result.data);
    return { data: null, error: null };
  }

  function loadReviewConfig(): void {
    dashboardState = applyReviewConfigToState(
      dashboardState,
      pluginInstance?.getDailyReviewConfig?.(),
    );
  }

  async function applyReviewConfig(
    nextCount: number,
    nextRange: ReviewTimeRange,
    shouldPersist: boolean,
  ): Promise<AsyncResult<null>> {
    dashboardState = applyReviewConfigToState(
      dashboardState,
      { count: nextCount, timeRange: nextRange },
      { refresh: true, saveError: "" },
    );

    if (!shouldPersist) {
      return { data: null, error: null };
    }

    const result = await persistReviewSettings(nextCount, nextRange);
    if (result.error) {
      dashboardState = applyReviewConfigToState(
        dashboardState,
        { count: nextCount, timeRange: nextRange },
        { saveError: result.error },
      );
    }
    return result;
  }

  function handleReviewCountChange(event: CustomEvent<{ count: number }>): void {
    dashboardState = setReviewCount(dashboardState, event.detail.count, {
      saveError: "",
    });
    void applyReviewConfig(
      dashboardState.reviewCount,
      dashboardState.reviewTimeRange,
      true,
    );
  }

  function handleReviewRangeChange(
    event: CustomEvent<{ timeRange: ReviewTimeRange }>,
  ): void {
    dashboardState = setReviewTimeRange(
      dashboardState,
      event.detail.timeRange,
      { saveError: "" },
    );
    void applyReviewConfig(
      dashboardState.reviewCount,
      dashboardState.reviewTimeRange,
      true,
    );
  }

  function handleReviewReroll(): void {
    dashboardState = rerollDailyReview(dashboardState);
  }

  function toggleHeatmap(): void {
    dashboardState = toggleDashboardHeatmap(dashboardState);
  }

  $: if (pluginInstance !== lastPluginInstance) {
    lastPluginInstance = pluginInstance;
    loadReviewConfig();
  }
  $: derivedState = deriveDashboardState(dashboardState);
  $: memoTimeFormat =
    pluginInstance?.getMemoTimeFormat?.() ?? FLOMO_DEFAULT_TIME_FORMAT;
  $: dashboardBlockId = pluginInstance?.getDashboardBlockId?.()?.trim() ?? "";
</script>

<div class="fomo-dashboard" style={FLOMO_DASHBOARD_COLOR_VARS}>
  <FomoDashboardToolbar
    activeTab={dashboardState.activeTab}
    isFilterExpanded={derivedState.isAnySettingsExpanded}
    heatmapExpanded={dashboardState.heatmapExpanded}
    filter={dashboardState.filter}
    reviewCount={dashboardState.reviewCount}
    reviewTimeRange={dashboardState.reviewTimeRange}
    reviewSaveError={dashboardState.reviewSaveError}
    statsYear={dashboardState.statsYear}
    currentYear={dashboardState.currentStatsYear}
    on:tabchange={handleTabChange}
    on:heatmaptoggle={toggleHeatmap}
    on:filterchange={handleFilterChange}
    on:customSQL={handleCustomSQL}
    on:filterexpandchange={handleFilterExpandChange}
    on:reviewexpandchange={handleReviewExpandChange}
    on:reviewcountchange={handleReviewCountChange}
    on:reviewrangechange={handleReviewRangeChange}
    on:reviewreroll={handleReviewReroll}
    on:statsexpandchange={handleStatsExpandChange}
    on:statsyearchange={handleYearChange}
  />

  {#if dashboardState.activeTab === DASHBOARD_TABS.main}
    <section class="panel">
      <FomoMainView
        app={app}
        blockId={dashboardBlockId}
        customSQL={dashboardState.customSQL}
        customSQLError={derivedState.customSQLError}
        finalSQL={derivedState.finalSQL}
        selectedDay={derivedState.selectedDay}
        selectedRangeStart={derivedState.selectedRangeStart}
        selectedRangeEnd={derivedState.selectedRangeEnd}
        heatmapExpanded={dashboardState.heatmapExpanded}
        {loadHeatmapDays}
        on:dayclick={handleHeatmapDayClick}
      />
    </section>
  {:else if dashboardState.activeTab === DASHBOARD_TABS.review}
    <section class="panel">
      <FomoDailyReview
        sqlStatement={derivedState.reviewSQL}
        saveError={dashboardState.reviewSaveError}
        timeFormat={memoTimeFormat}
        {loadMemos}
        {loadBlockDOM}
        onOpenMemo={openMemo}
      />
    </section>
  {:else}
    <section class="panel">
      <FomoStatsView
        statsYear={dashboardState.statsYear}
        on:dayclick={handleStatsDayClick}
        on:monthclick={handleMonthClick}
      />
    </section>
  {/if}
</div>
