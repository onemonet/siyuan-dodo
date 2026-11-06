<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import IconButton from "@/components/IconButton.svelte";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Settings2 from "lucide-svelte/icons/settings-2";

  const TEXT = {
    settings: "统计设置",
    yearLabel: "年份",
    previousYear: "上一年",
    currentYear: "今年",
    nextYear: "下一年",
    yearSuffix: "年",
  } as const;

  export let statsYear: number;
  export let currentYear: number;

  const dispatch = createEventDispatcher<{
    expandchange: { expanded: boolean };
    yearchange: { year: number };
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

  function changeYear(year: number): void {
    dispatch("yearchange", { year });
  }
</script>

<svelte:window on:pointerdown={handleOutsidePointerDown} />

<div class="flomo-main-toolbar-actions flomo-stats-toolbar-actions">
  <div class="stats-settings-shell" bind:this={shellElement} class:expanded>
    <IconButton
      label={TEXT.settings}
      active={expanded}
      on:click={() => setExpanded(!expanded)}
    >
      <Settings2 size={20} strokeWidth={1.8} aria-hidden="true" />
    </IconButton>

    {#if expanded}
      <div class="stats-settings-panel">
        <div class="setting-row">
          <span class="field-label">{TEXT.yearLabel}</span>
          <span class="year-value">{statsYear} {TEXT.yearSuffix}</span>
        </div>

        <div class="year-actions">
          <button type="button" on:click={() => changeYear(statsYear - 1)}>
            <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
            {TEXT.previousYear}
          </button>
          <button
            class="today-btn"
            type="button"
            disabled={statsYear === currentYear}
            on:click={() => changeYear(currentYear)}
          >
            {TEXT.currentYear}
          </button>
          <button
            type="button"
            disabled={statsYear >= currentYear}
            on:click={() => changeYear(statsYear + 1)}
          >
            {TEXT.nextYear}
            <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .stats-settings-shell {
    position: relative;
    flex: 0 0 auto;
  }

  .stats-settings-panel button {
    font: inherit;
  }

  .stats-settings-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(360px, calc(100vw - 32px));
    min-width: min(320px, calc(100vw - 32px));
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
    justify-content: space-between;
    gap: 12px;
  }

  .field-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .year-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .year-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .year-actions button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--b3-border-color);
    border-radius: 999px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    padding: 6px 12px;
    cursor: pointer;
  }

  .year-actions button:hover:not(:disabled),
  .year-actions button:focus-visible:not(:disabled) {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
  }

  .year-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .year-actions .today-btn {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
  }

  @media (max-width: 720px) {
    .stats-settings-panel {
      right: 0;
      left: auto;
      width: min(360px, calc(100vw - 32px));
      min-width: 0;
    }
  }
</style>
