<script lang="ts">
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;

  const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  function daysForMonth(date: Date): Array<{ date: Date; inMonth: boolean }> {
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return { date: day, inMonth: day.getMonth() === month };
    });
  }

  function sameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function moveMonth(delta: number): void {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
  }

  function goToday(): void {
    cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  $: days = daysForMonth(cursor);
  $: title = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;
</script>

<div class="calendar-widget calendar-size-{widget.w}-{widget.h}">
  <div class="calendar-toolbar">
    <button type="button" aria-label="上个月" on:mousedown|stopPropagation on:click={() => moveMonth(-1)}>‹</button>
    <strong>{title}</strong>
    <div class="calendar-toolbar-actions">
      <button type="button" on:mousedown|stopPropagation on:click={goToday}>今天</button>
      <button type="button" aria-label="下个月" on:mousedown|stopPropagation on:click={() => moveMonth(1)}>›</button>
    </div>
  </div>

  <div class="calendar-weekdays">
    {#each WEEKDAYS as weekday}
      <span>{weekday}</span>
    {/each}
  </div>

  <div class="calendar-grid">
    {#each days as item}
      <div
        class="calendar-day"
        class:calendar-day-muted={!item.inMonth}
        class:calendar-day-today={sameDay(item.date, today)}
      >
        <span>{item.date.getDate()}</span>
      </div>
    {/each}
  </div>
</div>
