<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import IconButton from "@/components/IconButton.svelte";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Settings2 from "lucide-svelte/icons/settings-2";
  import {
    DAILY_REVIEW_COUNT_OPTIONS,
    DAILY_REVIEW_RANGE_OPTIONS,
  } from "../utils/dailyReview";
  import type { ReviewTimeRange } from "../utils/sql";

  const TEXT = {
    settings: "每日回顾设置",
    countLabel: "数量",
    rangeLabel: "范围",
    rerollLabel: "换一批",
  } as const;

  export let reviewCount: number;
  export let reviewTimeRange: ReviewTimeRange;
  export let saveError = "";

  const dispatch = createEventDispatcher<{
    expandchange: { expanded: boolean };
    countchange: { count: number };
    rangechange: { timeRange: ReviewTimeRange };
    reroll: void;
  }>();

  let shellElement: HTMLDivElement | null = null;
  let expanded = false;

  function setExpanded(nextExpanded: boolean): void {
    if (expanded === nextExpanded) {
      return;
    }

    expanded = nextExpanded;
    dispatch("expandchange", { expanded });
  }

  function handleCountChange(event: Event): void {
    dispatch("countchange", { count: reviewCount });
  }

  function handleOutsidePointerDown(event: PointerEvent): void {
    if (
      !expanded ||
      !shellElement ||
      !(event.target instanceof Node) ||
      shellElement.contains(event.target)
    ) {
      return;
    }

    setExpanded(false);
  }
</script>

<svelte:window on:pointerdown={handleOutsidePointerDown} />

<div class="flomo-main-toolbar-actions flomo-review-toolbar-actions">
  <button
    class="review-reroll-button"
    type="button"
    on:click={() => dispatch("reroll")}
  >
    <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
    {TEXT.rerollLabel}
  </button>

  <div class="review-settings-shell" bind:this={shellElement} class:expanded>
    <IconButton
      label={TEXT.settings}
      active={expanded}
      on:click={() => setExpanded(!expanded)}
    >
      <Settings2 size={20} strokeWidth={1.8} aria-hidden="true" />
    </IconButton>

    {#if expanded}
      <div class="review-settings-panel">
        <label class="setting-row">
          <span class="field-label">{TEXT.countLabel}</span>
          <select bind:value={reviewCount} on:change={handleCountChange}>
            {#each DAILY_REVIEW_COUNT_OPTIONS as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>

        <div class="setting-row">
          <span class="field-label">{TEXT.rangeLabel}</span>
          <div class="range-group">
            {#each DAILY_REVIEW_RANGE_OPTIONS as option}
              <button
                class:active={reviewTimeRange === option.value}
                type="button"
                on:click={() =>
                  dispatch("rangechange", { timeRange: option.value })}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        {#if saveError}
          <div class="status error">{saveError}</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .review-settings-shell {
    position: relative;
    flex: 0 0 auto;
  }

  .review-reroll-button,
  .review-settings-panel button,
  select {
    font: inherit;
  }

  .review-reroll-button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    white-space: nowrap;
  }

  .review-reroll-button:hover {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
  }

  .review-settings-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(420px, calc(100vw - 32px));
    min-width: min(360px, calc(100vw - 32px));
    max-width: calc(100vw - 32px);
    padding: 12px 14px;
    border: 1px solid var(--b3-border-color);
    border-radius: 12px;
    background: var(--b3-theme-surface);
    box-shadow: 0 12px 32px color-mix(in srgb, black 18%, transparent);
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .field-label,
  .status {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  select {
    min-width: 86px;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    color-scheme: light dark;
    padding: 6px 10px;
  }

  .range-group {
    display: inline-flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .range-group button {
    border: 1px solid var(--b3-border-color);
    border-radius: 999px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    padding: 6px 12px;
    cursor: pointer;
  }

  .range-group button.active {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 16%, transparent);
    color: var(--b3-theme-primary);
  }

  .status.error {
    color: var(--b3-theme-error, #d95c5c);
    opacity: 1;
  }

  @media (max-width: 720px) {
    .review-reroll-button {
      padding: 0 12px;
    }

    .review-settings-panel {
      right: 0;
      left: auto;
      width: min(420px, calc(100vw - 32px));
      min-width: 0;
    }
  }
</style>
