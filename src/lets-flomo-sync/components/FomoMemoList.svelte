<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    FLOMO_DEFAULT_LAYOUT,
    FLOMO_LIST_LOAD_MORE_ROOT_MARGIN,
    FLOMO_LIST_PAGE_SIZE,
  } from "../../config/constants";
  import type { BlockDOMQueryParams } from "../services/BlockDOMService";
  import type { MemoQueryParams } from "../services/MemoQueryService";
  import type { AsyncResult, DashboardLayout, MemoItem } from "../types";
  import {
    FLOMO_MEMO_LIST_GAP,
    FLOMO_MEMO_LIST_MASONRY_MIN_COLUMN_WIDTH,
    resolveMemoListLayout,
  } from "../utils/memoListLayout";
  import FomoMemoCollection from "./FomoMemoCollection.svelte";

  const CONSTANTS = {
    loadingText: "正在加载 memo 列表...",
    emptyText: "暂无匹配的 memo 记录",
    observerThreshold: 0.1,
    statementSeparator: "::",
  } as const;

  const DEFAULT_LOAD_MEMOS = async (): Promise<AsyncResult<MemoItem[]>> => {
    return {
      data: [],
      error: "FomoMemoList.loadMemos 未注入",
    };
  };

  const DEFAULT_OPEN_MEMO = (): void => {
    return;
  };

  const DEFAULT_LOAD_BLOCK_DOM = async (): Promise<AsyncResult<string>> => {
    return {
      data: "",
      error: "FomoMemoList.loadBlockDOM 未注入",
    };
  };

  const SHELL_STYLE = `--memo-list-gap: ${FLOMO_MEMO_LIST_GAP}px; --memo-masonry-column-width: ${FLOMO_MEMO_LIST_MASONRY_MIN_COLUMN_WIDTH}px;`;

  export let sqlStatement = "";
  export let timeFormat = "YYYY-MM-DD HH:mm:ss";
  export let layout: DashboardLayout = FLOMO_DEFAULT_LAYOUT;
  export let loadMemos: (
    params: MemoQueryParams,
  ) => Promise<AsyncResult<MemoItem[]>> = DEFAULT_LOAD_MEMOS;
  export let loadBlockDOM: (
    params: BlockDOMQueryParams,
  ) => Promise<AsyncResult<string>> = DEFAULT_LOAD_BLOCK_DOM;
  export let onOpenMemo: (memoId: string) => void = DEFAULT_OPEN_MEMO;

  let items: MemoItem[] = [];
  let visibleItems: MemoItem[] = [];
  let loading = true;
  let error = "";
  let mounted = false;
  let lastQueryKey = "";
  let visibleCount = FLOMO_LIST_PAGE_SIZE;
  let sentinelEl: HTMLDivElement | null = null;
  let observer: IntersectionObserver | null = null;

  function updateVisibleItems(): void {
    visibleItems = items.slice(0, visibleCount);
  }

  function resetVisibleItems(): void {
    visibleCount = Math.min(items.length, FLOMO_LIST_PAGE_SIZE);
    updateVisibleItems();
  }

  function loadMore(): void {
    const nextVisibleCount = Math.min(
      items.length,
      visibleCount + FLOMO_LIST_PAGE_SIZE,
    );
    visibleCount = nextVisibleCount;
    updateVisibleItems();
  }

  function cleanupObserver(): void {
    observer?.disconnect();
    observer = null;
  }

  function initObserver(): void {
    cleanupObserver();

    if (!sentinelEl || visibleCount >= items.length) {
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        const matchedEntry = entries[0];
        if (matchedEntry?.isIntersecting && visibleCount < items.length) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: FLOMO_LIST_LOAD_MORE_ROOT_MARGIN,
        threshold: CONSTANTS.observerThreshold,
      },
    );
    observer.observe(sentinelEl);
  }

  async function loadItems(): Promise<AsyncResult<MemoItem[]>> {
    const normalizedStatement = sqlStatement.trim();
    if (!normalizedStatement) {
      items = [];
      error = "";
      loading = false;
      resetVisibleItems();
      cleanupObserver();
      return { data: [], error: null };
    }

    loading = true;
    error = "";

    const result = await loadMemos({
      statement: normalizedStatement,
      timeFormat,
    });

    items = result.data;
    error = result.error || "";
    loading = false;
    resetVisibleItems();
    await tick();
    initObserver();

    return result;
  }

  function handleOpen(memoId: string): void {
    onOpenMemo(memoId);
  }

  onMount(() => {
    mounted = true;
  });

  onDestroy(() => {
    cleanupObserver();
  });

  $: resolvedLayout = resolveMemoListLayout(layout);
  $: queryKey = `${sqlStatement}${CONSTANTS.statementSeparator}${timeFormat}`;
  $: if (mounted && queryKey !== lastQueryKey) {
    lastQueryKey = queryKey;
    void loadItems();
  }
</script>

<div class="memo-list-shell" style={SHELL_STYLE}>
  {#if loading}
    <div class="status">{CONSTANTS.loadingText}</div>
  {:else if error}
    <div class="status error">{error}</div>
  {:else if visibleItems.length === 0}
    <div class="status empty">{CONSTANTS.emptyText}</div>
  {:else}
    <FomoMemoCollection
      items={visibleItems}
      layout={resolvedLayout}
      {loadBlockDOM}
      onOpenMemo={handleOpen}
    />
    <div bind:this={sentinelEl} class="memo-sentinel" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .memo-list-shell {
    --memo-card-min-width: 280px;
    --memo-masonry-column-width: 280px;
    display: flex;
    flex-direction: column;
    gap: var(--memo-list-gap);
    min-height: 360px;
  }

  .status {
    padding: 16px;
    border: 1px dashed var(--b3-border-color);
    border-radius: 12px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    opacity: 0.75;
  }

  .status.error {
    color: var(--b3-theme-error, #d95c5c);
    opacity: 1;
  }

  .memo-sentinel {
    height: 1px;
  }
</style>
