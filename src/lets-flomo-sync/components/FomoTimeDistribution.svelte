<script lang="ts">
  import { onMount } from "svelte";
  import { sql } from "@/api";
  import { getFlomoHeatColor } from "../utils/colors";
  import { buildTimeDistributionSQL } from "../utils/sql";

  interface HourItem {
    hour: number;
    count: number;
  }

  let loading = true;
  let error = "";
  let hours: HourItem[] = [];

  function padHour(hour: number): string {
    return String(hour).padStart(2, "0");
  }

  function colorForCount(count: number, maxCount: number): string {
    return getFlomoHeatColor(count, maxCount);
  }

  async function loadData(): Promise<void> {
    loading = true;
    error = "";

    try {
      const rows = await sql(buildTimeDistributionSQL());
      const countMap = new Map<number, number>();

      rows.forEach((row) => {
        const hour = Number(row.hour);
        const count = Number(row.cnt || 0);
        if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
          countMap.set(hour, count);
        }
      });

      hours = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: countMap.get(hour) || 0,
      }));
    } catch (err) {
      error = err instanceof Error ? err.message : "时段统计加载失败";
      hours = [];
    } finally {
      loading = false;
    }
  }

  $: maxCount = hours.reduce((max, item) => Math.max(max, item.count), 0);
  $: mostActiveHour = hours.find((item) => item.count === maxCount && maxCount > 0) || null;

  onMount(() => {
    void loadData();
  });
</script>

<div class="time-distribution">
  <div class="header">
    <span class="title">时间分布</span>
    <span class="meta">
      {#if mostActiveHour}
        最活跃时段：{padHour(mostActiveHour.hour)}:00 - {padHour(mostActiveHour.hour)}:59（{mostActiveHour.count} 条）
      {:else}
        暂无时段数据
      {/if}
    </span>
  </div>

  {#if loading}
    <div class="status">时段统计加载中...</div>
  {:else if error}
    <div class="status error">{error}</div>
  {:else}
    <div class="rows">
      {#each hours as item}
        {@const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0}
        <div class="row" class:active={item.count === maxCount && item.count > 0}>
          <span class="hour">{padHour(item.hour)}</span>
          <div class="track">
            <div
              class="fill"
              style={`width:${pct}%;background:${colorForCount(item.count, maxCount)};`}
            ></div>
          </div>
          <span class="count">{item.count}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .time-distribution {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--b3-border-color);
    border-radius: 12px;
    background: var(--b3-theme-surface);
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .meta,
  .status {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.65;
  }

  .status.error {
    color: var(--b3-theme-error, #d95c5c);
    opacity: 1;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    display: grid;
    grid-template-columns: 32px 1fr 42px;
    gap: 10px;
    align-items: center;
  }

  .row.active .hour,
  .row.active .count {
    color: var(--flomo-accent, #2E8B57);
    font-weight: 600;
  }

  .hour,
  .count {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
  }

  .track {
    position: relative;
    height: 12px;
    border-radius: 999px;
    background: var(--flomo-heat-0, #EFEFEF);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    transition: width 160ms ease;
  }
</style>
