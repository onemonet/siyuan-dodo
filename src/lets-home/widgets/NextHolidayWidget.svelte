<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { HomeWidget } from "../config";
  import {
    getUpcomingHolidays,
    type UpcomingHoliday,
  } from "./shared/holidays";

  export let widget: HomeWidget;

  type HolidayVariant =
    | "wide"
    | "list"
    | "primary"
    | "vertical"
    | "compact"
    | "tiny";

  let today = new Date();
  let refreshTimer: number | null = null;

  $: holidays = getUpcomingHolidays(today);
  $: nextHoliday = holidays[0] as UpcomingHoliday | undefined;
  $: variant = getVariant(widget.w, widget.h);

  function getVariant(width: number, height: number): HolidayVariant {
    if (width >= 4 && height >= 2) {
      return "wide";
    }
    if (width >= 3 && height >= 3) {
      return "list";
    }
    if (width >= 2 && height >= 2) {
      return "primary";
    }
    if (width === 1 && height >= 2) {
      return "vertical";
    }
    if (width === 1 && height === 1) {
      return "tiny";
    }
    if (height === 1) {
      return "compact";
    }
    if (width < 2) {
      return "vertical";
    }
    return "compact";
  }

  onMount(() => {
    refreshTimer = window.setInterval(() => {
      today = new Date();
    }, 60_000);
  });

  onDestroy(() => {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
    }
  });
</script>

{#if nextHoliday}
  <div
    class={`next-holiday-face next-holiday-${variant}`}
    data-widget-type={widget.id}
  >
    {#if variant === "wide"}
      <div class="next-holiday-primary">
        <span class="next-holiday-title">{nextHoliday.name}还有</span>
        <div class="next-holiday-days">
          <strong>{nextHoliday.daysUntil}</strong>
          <span>天</span>
        </div>
        <span class="next-holiday-date">{nextHoliday.dateLabel}</span>
      </div>
      <div class="next-holiday-list">
        {#each holidays.slice(1, 4) as holiday (holiday.start)}
          <div class="next-holiday-item">
            <div>
              <strong>{holiday.name}</strong>
              <span>{holiday.dateLabel}</span>
            </div>
            <div class="next-holiday-item-days">
              <strong>{holiday.daysUntil}</strong>
              <span>天</span>
            </div>
          </div>
        {/each}
      </div>
    {:else if variant === "list"}
      <div class="next-holiday-list next-holiday-list-full">
        {#each holidays.slice(0, 3) as holiday (holiday.start)}
          <div class="next-holiday-item">
            <div>
              <strong>{holiday.name}</strong>
              <span>{holiday.dateLabel}</span>
            </div>
            <div class="next-holiday-item-days">
              <strong>{holiday.daysUntil}</strong>
              <span>天</span>
            </div>
          </div>
        {/each}
      </div>
    {:else if variant === "primary"}
      <div class="next-holiday-primary next-holiday-primary-medium">
        <span class="next-holiday-title">{nextHoliday.name}</span>
        <div class="next-holiday-days">
          <strong>{nextHoliday.daysUntil}</strong>
          <span>天</span>
        </div>
        <span class="next-holiday-date">{nextHoliday.dateLabel}</span>
      </div>
    {:else if variant === "tiny"}
      <div class="next-holiday-primary next-holiday-primary-tiny">
        <span class="next-holiday-title">{nextHoliday.name}</span>
        <div class="next-holiday-days">
          <strong>{nextHoliday.daysUntil}</strong>
        </div>
      </div>
    {:else}
      <div class="next-holiday-primary">
        <span class="next-holiday-title">{nextHoliday.name}</span>
        <div class="next-holiday-days">
          <strong>{nextHoliday.daysUntil}</strong>
          <span>天</span>
        </div>
        <span class="next-holiday-date">{nextHoliday.dateLabel}</span>
      </div>
    {/if}
  </div>
{:else}
  <div class="next-holiday-empty" data-widget-type={widget.id}>
    <span>暂无假期数据</span>
  </div>
{/if}
