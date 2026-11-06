<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { HomeWidget } from "../config";
  import {
    formatClockDate,
    formatClockHours,
    formatClockMinutes,
    formatClockMonthDay,
    formatClockTime,
    formatClockWeekday,
    shouldShowClockSeconds,
  } from "./shared/clock";

  export let widget: HomeWidget;

  let currentTime = new Date();
  let clockTimer: number | null = null;

  onMount(() => {
    clockTimer = window.setInterval(() => {
      currentTime = new Date();
    }, 1000);
  });

  onDestroy(() => {
    if (clockTimer !== null) {
      window.clearInterval(clockTimer);
    }
  });
</script>

<div class="clock-face clock-size-{widget.w}-{widget.h}">
  {#if widget.w === 1 && widget.h >= 2}
    <div class="clock-vertical-time">
      <span>{formatClockHours(currentTime)}</span>
      <span>{formatClockMinutes(currentTime)}</span>
    </div>
  {:else}
    <div class="clock-main">
      <strong>{formatClockTime(currentTime, shouldShowClockSeconds(widget.w, widget.h))}</strong>
    </div>
  {/if}
  {#if widget.h >= 2}
    {#if widget.w === 1}
      <div class="clock-date clock-date-vertical">
        <span>{formatClockMonthDay(currentTime)}</span>
        <span>{formatClockWeekday(currentTime)}</span>
      </div>
    {:else}
      <span class="clock-date">{formatClockDate(currentTime)}</span>
    {/if}
  {/if}
</div>
