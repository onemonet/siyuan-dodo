<script lang="ts">
  import { onDestroy } from "svelte";
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;

  type TimerMode = "focus" | "short" | "long";

  const MODES: Record<TimerMode, { label: string; seconds: number }> = {
    focus: { label: "专注", seconds: 25 * 60 },
    short: { label: "短休息", seconds: 5 * 60 },
    long: { label: "长休息", seconds: 15 * 60 },
  };
  const MODE_OPTIONS: Array<{ id: TimerMode; label: string }> = [
    { id: "focus", label: MODES.focus.label },
    { id: "short", label: MODES.short.label },
    { id: "long", label: MODES.long.label },
  ];

  let mode: TimerMode = "focus";
  let remaining = MODES.focus.seconds;
  let running = false;
  let rounds = 0;
  let timer: number | null = null;

  function stopTimer(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    running = false;
  }

  function setMode(nextMode: TimerMode): void {
    stopTimer();
    mode = nextMode;
    remaining = MODES[nextMode].seconds;
  }

  function reset(): void {
    stopTimer();
    remaining = MODES[mode].seconds;
  }

  function toggle(): void {
    if (running) {
      stopTimer();
      return;
    }

    if (remaining <= 0) {
      remaining = MODES[mode].seconds;
    }

    running = true;
    timer = window.setInterval(() => {
      if (remaining <= 1) {
        if (mode === "focus") {
          rounds += 1;
        }
        stopTimer();
        remaining = 0;
        return;
      }
      remaining -= 1;
    }, 1000);
  }

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  $: total = MODES[mode].seconds;
  $: progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

  onDestroy(stopTimer);
</script>

<div class="pomodoro-widget pomodoro-size-{widget.w}-{widget.h}">
  <div class="pomodoro-modes" role="group" aria-label="计时模式">
    {#each MODE_OPTIONS as item}
      <button
        type="button"
        class:active={mode === item.id}
        aria-pressed={mode === item.id}
        on:mousedown|stopPropagation
        on:click={() => setMode(item.id)}
      >{item.label}</button>
    {/each}
  </div>

  <div class="pomodoro-clock">
    <strong>{formatTime(remaining)}</strong>
    <span>{running ? "进行中" : remaining === 0 ? "完成" : "准备就绪"}</span>
  </div>

  <div class="pomodoro-progress" aria-hidden="true">
    <span style:width={`${progress}%`}></span>
  </div>

  <div class="pomodoro-actions">
    <button class="pomodoro-primary" type="button" on:mousedown|stopPropagation on:click={toggle}>
      {running ? "暂停" : remaining === 0 ? "重新开始" : "开始"}
    </button>
    <button type="button" on:mousedown|stopPropagation on:click={reset}>重置</button>
    <span>完成 {rounds} 轮</span>
  </div>
</div>
