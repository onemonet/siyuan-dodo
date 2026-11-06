<script lang="ts">
  import type { BlockDOMQueryParams } from "../services/BlockDOMService";
  import type { AsyncResult, DashboardLayout, MemoItem } from "../types";
  import {
    buildMemoMasonryColumns,
    getMemoListLayoutClassName,
    isMasonryMemoListLayout,
    resolveMasonryColumnCount,
  } from "../utils/memoListLayout";
  import FomoMemoCard from "./FomoMemoCard.svelte";

  const DEFAULT_LOAD_BLOCK_DOM = async (): Promise<AsyncResult<string>> => {
    return {
      data: "",
      error: "FomoMemoCollection.loadBlockDOM 未注入",
    };
  };

  const DEFAULT_OPEN_MEMO = (): void => {
    return;
  };

  export let items: MemoItem[] = [];
  export let layout: DashboardLayout;
  export let loadBlockDOM: (
    params: BlockDOMQueryParams,
  ) => Promise<AsyncResult<string>> = DEFAULT_LOAD_BLOCK_DOM;
  export let onOpenMemo: (memoId: string) => void = DEFAULT_OPEN_MEMO;

  let masonryHostEl: HTMLDivElement | null = null;
  let masonryResizeObserver: ResizeObserver | null = null;
  let masonryColumnCount = 1;

  function updateMasonryColumnCount(): void {
    if (!isMasonryMemoListLayout(layout) || !masonryHostEl) {
      masonryColumnCount = 1;
      return;
    }

    const hostWidth = masonryHostEl.getBoundingClientRect().width;
    const nextColumnCount = resolveMasonryColumnCount(hostWidth);
    if (masonryColumnCount === nextColumnCount) {
      return;
    }

    masonryColumnCount = nextColumnCount;
  }

  function cleanupMasonryObserver(): void {
    masonryResizeObserver?.disconnect();
    masonryResizeObserver = null;
  }

  function initMasonryObserver(): void {
    cleanupMasonryObserver();

    if (!masonryHostEl) {
      masonryColumnCount = 1;
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      updateMasonryColumnCount();
      return;
    }

    masonryResizeObserver = new ResizeObserver(() => {
      updateMasonryColumnCount();
    });
    masonryResizeObserver.observe(masonryHostEl);
    updateMasonryColumnCount();
  }

  function masonryHostAction(node: HTMLDivElement) {
    masonryHostEl = node;
    initMasonryObserver();

    return {
      update() {
        masonryHostEl = node;
        updateMasonryColumnCount();
      },
      destroy() {
        if (masonryHostEl === node) {
          masonryHostEl = null;
        }
        cleanupMasonryObserver();
        masonryColumnCount = 1;
      },
    };
  }

  function handleOpen(memoId: string): void {
    onOpenMemo(memoId);
  }

  $: layoutClassName = getMemoListLayoutClassName(layout);
  $: isMasonryLayout = isMasonryMemoListLayout(layout);
  $: masonryColumns = buildMemoMasonryColumns(items, masonryColumnCount);
  $: masonryStyle = `--memo-masonry-column-count: ${masonryColumnCount};`;
  $: updateMasonryColumnCount();
</script>

{#if isMasonryLayout}
  <div
    class={`memo-list ${layoutClassName}`}
    data-layout={layout}
    style={masonryStyle}
    use:masonryHostAction
  >
    {#each masonryColumns as column, columnIndex (`masonry-column-${columnIndex}`)}
      <div class="memo-masonry-column">
        {#each column as item (item.id)}
          <div class="memo-list__item">
            <FomoMemoCard {item} onOpen={handleOpen} {loadBlockDOM} />
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <div class={`memo-list ${layoutClassName}`} data-layout={layout}>
    {#each items as item (item.id)}
      <div class="memo-list__item">
        <FomoMemoCard {item} onOpen={handleOpen} {loadBlockDOM} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .memo-list {
    min-width: 0;
  }

  .memo-list--list,
  .memo-list--card {
    display: grid;
    gap: var(--memo-list-gap);
  }

  .memo-list--list {
    grid-template-columns: minmax(0, 1fr);
  }

  .memo-list--card {
    grid-template-columns: repeat(
      auto-fit,
      minmax(var(--memo-card-min-width), 1fr)
    );
    align-items: start;
  }

  .memo-list--masonry {
    --memo-masonry-column-count: 1;
    display: grid;
    grid-template-columns: repeat(
      var(--memo-masonry-column-count),
      minmax(0, 1fr)
    );
    gap: var(--memo-list-gap);
    align-items: start;
  }

  .memo-masonry-column {
    display: flex;
    flex-direction: column;
    gap: var(--memo-list-gap);
    min-width: 0;
  }

  .memo-list__item {
    min-width: 0;
  }

  @media (max-width: 720px) {
    .memo-list--card,
    .memo-list--masonry {
      grid-template-columns: 1fr;
    }
  }
</style>
