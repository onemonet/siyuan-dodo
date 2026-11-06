<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { sql } from "@/api";
  import "./fomoMonthlyBar.css";
  import { HeatmapStatsService } from "../services/HeatmapStatsService";
  import { getFlomoHeatColor } from "../utils/colors";
  import {
    buildRecentMonthItems,
    getMonthlyBarMaxCount,
    MONTHLY_BAR_MONTH_COUNT,
    MONTHLY_BAR_PADDING,
    MONTHLY_BAR_SVG_HEIGHT,
    MONTHLY_BAR_SVG_WIDTH,
    type MonthlyBarItem,
  } from "../utils/monthlyStats";

  const dispatch = createEventDispatcher<{
    monthclick: { year: number; month: number };
  }>();

  const heatmapStatsService = new HeatmapStatsService({ querySQL: sql });

  let loading = true;
  let error = "";
  let months: MonthlyBarItem[] = [];

  async function loadData(): Promise<void> {
    loading = true;
    error = "";

    const result = await heatmapStatsService.queryMonthlyStats();
    if (result.error) {
      error = result.error;
      months = [];
      loading = false;
      return;
    }

    months = buildRecentMonthItems(result.data);
    loading = false;
  }

  function activateMonth(year: number, month: number): void {
    dispatch("monthclick", { year, month });
  }

  function handleBarKeydown(event: KeyboardEvent, year: number, month: number): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateMonth(year, month);
    }
  }

  $: maxCount = getMonthlyBarMaxCount(months);
  $: contentWidth =
    MONTHLY_BAR_SVG_WIDTH - MONTHLY_BAR_PADDING.left - MONTHLY_BAR_PADDING.right;
  $: contentHeight =
    MONTHLY_BAR_SVG_HEIGHT - MONTHLY_BAR_PADDING.top - MONTHLY_BAR_PADDING.bottom;
  $: stepWidth = months.length ? contentWidth / months.length : contentWidth;
  $: barWidth = Math.max(10, stepWidth * 0.62);

  onMount(() => {
    void loadData();
  });
</script>

<div class="monthly-bar">
  <div class="header">
    <span class="title">月度记录</span>
    <span class="meta">最近 {MONTHLY_BAR_MONTH_COUNT} 个月</span>
  </div>

  {#if loading}
    <div class="status">月度统计加载中...</div>
  {:else if error}
    <div class="status error">{error}</div>
  {:else}
    <svg
      viewBox={`0 0 ${MONTHLY_BAR_SVG_WIDTH} ${MONTHLY_BAR_SVG_HEIGHT}`}
      role="img"
      aria-label="Flomo 月度记录柱状图"
    >
      <line
        x1={MONTHLY_BAR_PADDING.left}
        y1={MONTHLY_BAR_PADDING.top}
        x2={MONTHLY_BAR_PADDING.left}
        y2={MONTHLY_BAR_PADDING.top + contentHeight}
        class="axis"
      />
      <line
        x1={MONTHLY_BAR_PADDING.left}
        y1={MONTHLY_BAR_PADDING.top + contentHeight}
        x2={MONTHLY_BAR_PADDING.left + contentWidth}
        y2={MONTHLY_BAR_PADDING.top + contentHeight}
        class="axis"
      />

      <text
        x={MONTHLY_BAR_PADDING.left - 8}
        y={MONTHLY_BAR_PADDING.top + 4}
        class="axis-label"
        text-anchor="end"
      >
        {maxCount}
      </text>
      <text
        x={MONTHLY_BAR_PADDING.left - 8}
        y={MONTHLY_BAR_PADDING.top + contentHeight + 4}
        class="axis-label"
        text-anchor="end"
      >
        0
      </text>

      {#each months as item, index}
        {@const x =
          MONTHLY_BAR_PADDING.left +
          index * stepWidth +
          (stepWidth - barWidth) / 2}
        {@const barHeight =
          maxCount > 0
            ? Math.max(2, (item.count / maxCount) * contentHeight)
            : 2}
        {@const y = MONTHLY_BAR_PADDING.top + contentHeight - barHeight}

        <g class="bar-group">
          <rect
            class="bar"
            role="button"
            tabindex="0"
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx="4"
            style={`fill:${getFlomoHeatColor(item.count, maxCount)};`}
            on:click={() => activateMonth(item.year, item.month)}
            on:keydown={(event) => handleBarKeydown(event, item.year, item.month)}
          >
            <title>{`${item.key} · ${item.count} 条`}</title>
          </rect>

          {#if index % 3 === 0}
            <text
              x={x + barWidth / 2}
              y={MONTHLY_BAR_SVG_HEIGHT - 14}
              class="month-label"
              text-anchor="middle"
            >
              {item.key.slice(2)}
            </text>
          {/if}
        </g>
      {/each}
    </svg>
  {/if}
</div>
