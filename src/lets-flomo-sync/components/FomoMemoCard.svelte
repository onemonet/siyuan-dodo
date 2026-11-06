<script lang="ts">
  import { tick } from "svelte";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChevronUp from "lucide-svelte/icons/chevron-up";
  import ExternalLink from "lucide-svelte/icons/external-link";
  import type { AsyncResult, MemoItem } from "../types";
  import MemoReadonlyDOM from "./MemoReadonlyDOM.svelte";

  const CONSTANTS = {
    collapseAriaLabel: "收起 memo 内容",
    collapseButtonText: "收起",
    expandAriaLabel: "展开 memo 内容",
    expandButtonText: "展开",
    openAriaLabel: "打开原文",
    openButtonTitle: "打开原文",
  } as const;

  const DEFAULT_LOAD_BLOCK_DOM = async (): Promise<AsyncResult<string>> => {
    return {
      data: "",
      error: "FomoMemoCard.loadBlockDOM 未注入",
    };
  };

  export let item: MemoItem;
  export let onOpen: (memoId: string) => void;
  export let loadBlockDOM: (params: {
    blockId: string;
  }) => Promise<AsyncResult<string>> = DEFAULT_LOAD_BLOCK_DOM;

  let domContent = "";
  let domError = "";
  let loading = true;
  let loadVersion = 0;
  let contentFrameElement: HTMLDivElement | null = null;
  let expanded = false;
  let expandable = false;
  let measureVersion = 0;

  function handleOpen(): void {
    onOpen(item.id);
  }

  function parseCSSNumber(value: string): number | null {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function resolveCSSLength(value: string, fontSize: number): number | null {
    const trimmedValue = value.trim();
    const numericValue = parseCSSNumber(trimmedValue);
    if (numericValue === null) {
      return null;
    }

    if (trimmedValue.endsWith("em")) {
      return numericValue * fontSize;
    }
    if (trimmedValue.endsWith("px")) {
      return numericValue;
    }
    if (!Number.isNaN(Number(trimmedValue))) {
      return numericValue * fontSize;
    }
    return null;
  }

  function getCollapsedHeight(element: HTMLElement): number {
    const styles = window.getComputedStyle(element);
    const fontSize = parseCSSNumber(styles.fontSize) || 14;
    const lineCount =
      parseCSSNumber(styles.getPropertyValue("--memo-collapse-lines")) || 10;
    const lineHeight =
      resolveCSSLength(
        styles.getPropertyValue("--memo-collapse-line-height"),
        fontSize,
      ) ||
      resolveCSSLength(styles.lineHeight, fontSize) ||
      fontSize * 1.625;

    return lineHeight * lineCount;
  }

  async function restoreBlockDOM(blockId: string): Promise<void> {
    const currentVersion = loadVersion + 1;
    loadVersion = currentVersion;
    loading = true;
    domError = "";
    domContent = "";
    expanded = false;
    expandable = false;

    const result = await loadBlockDOM({ blockId });
    if (currentVersion !== loadVersion) {
      return;
    }

    domContent = result.data;
    domError = result.error || "";
    loading = false;
    void measureOverflow();
  }

  async function measureOverflow(): Promise<void> {
    const currentMeasureVersion = measureVersion + 1;
    measureVersion = currentMeasureVersion;

    await tick();
    if (currentMeasureVersion !== measureVersion || !contentFrameElement) {
      return;
    }

    expandable =
      !loading &&
      !domError &&
      Boolean(domContent) &&
      contentFrameElement.scrollHeight > getCollapsedHeight(contentFrameElement) + 2;
  }

  function toggleExpanded(): void {
    expanded = !expanded;
  }

  $: if (item.id) {
    void restoreBlockDOM(item.id);
  }

  $: if (!loading && domContent) {
    void measureOverflow();
  }
</script>

<article
  class="memo-card"
>
  <div class="memo-main">
    <header class="memo-header">
      <div class="memo-meta">
        <span class="memo-time">{item.memoTimeLabel}</span>
      </div>
      <button
        class="memo-open"
        type="button"
        aria-label={CONSTANTS.openAriaLabel}
        title={CONSTANTS.openButtonTitle}
        on:click|preventDefault|stopPropagation={handleOpen}
      >
        <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </header>

    <div
      class:collapsed={!expanded && expandable}
      class="memo-content-frame"
      bind:this={contentFrameElement}
    >
      <MemoReadonlyDOM {loading} error={domError} {domContent} />
    </div>

    {#if expandable}
      <button
        class="memo-expand"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded
          ? CONSTANTS.collapseAriaLabel
          : CONSTANTS.expandAriaLabel}
        on:click|preventDefault|stopPropagation={toggleExpanded}
      >
        <span class="memo-expand__icon" aria-hidden="true">
          {#if expanded}
            <ChevronUp size={14} strokeWidth={2} />
          {:else}
            <ChevronDown size={14} strokeWidth={2} />
          {/if}
        </span>
        <span>
          {expanded
            ? CONSTANTS.collapseButtonText
            : CONSTANTS.expandButtonText}
        </span>
      </button>
    {/if}
  </div>
</article>

<style>
  .memo-card {
    width: 100%;
    outline: none;
  }

  .memo-main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--b3-border-color);
    border-radius: 12px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    text-align: left;
    transition:
      border-color 120ms ease,
      transform 120ms ease,
      background 120ms ease;
  }

  .memo-main:hover {
    border-color: var(--b3-theme-primary);
    background: color-mix(
      in srgb,
      var(--b3-theme-primary) 5%,
      var(--b3-theme-surface)
    );
  }

  .memo-header {
    display: flex;
    gap: 8px 12px;
    align-items: center;
    justify-content: space-between;
  }

  .memo-meta {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1;
  }

  .memo-time {
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-primary);
  }

  .memo-content-frame {
    --memo-collapse-line-height: 1.72em;
    --memo-collapse-lines: 10;
    position: relative;
    min-width: 0;
  }

  .memo-content-frame.collapsed {
    max-height: calc(
      var(--memo-collapse-line-height) * var(--memo-collapse-lines)
    );
    overflow: hidden;
  }

  .memo-content-frame.collapsed::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 42px;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      transparent,
      color-mix(in srgb, var(--b3-theme-surface) 92%, transparent) 76%,
      var(--b3-theme-surface)
    );
  }

  .memo-open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    padding: 6px;
    min-width: 28px;
    min-height: 28px;
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
    cursor: pointer;
    line-height: 1;
    flex-shrink: 0;
    opacity: 0;
    transform: translateY(-2px);
    pointer-events: none;
    transition:
      opacity 120ms ease,
      transform 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .memo-card:hover .memo-open,
  .memo-card:focus-within .memo-open {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .memo-open:hover,
  .memo-open:focus-visible {
    background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
  }

  .memo-open:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--b3-theme-primary) 26%, transparent);
    outline-offset: 2px;
  }

  .memo-expand {
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid
      color-mix(in srgb, var(--b3-theme-on-surface) 12%, transparent);
    border-radius: 999px;
    padding: 5px 10px;
    background: color-mix(in srgb, var(--b3-theme-on-surface) 9%, transparent);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .memo-expand:hover,
  .memo-expand:focus-visible {
    border-color: color-mix(
      in srgb,
      var(--b3-theme-primary) 34%,
      transparent
    );
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
  }

  .memo-expand:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
    outline-offset: 2px;
  }

  .memo-expand__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

</style>
