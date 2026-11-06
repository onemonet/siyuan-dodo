<script lang="ts">
  import type { BlockDOMQueryParams } from "../services/BlockDOMService";
  import type { MemoQueryParams } from "../services/MemoQueryService";
  import type { AsyncResult, MemoItem } from "../types";
  import { DAILY_REVIEW_LAYOUT } from "../utils/dailyReview";
  import FomoMemoList from "./FomoMemoList.svelte";

  const CONSTANTS = {
    loadMemosError: "FomoDailyReview.loadMemos 未注入",
    loadBlockDOMError: "FomoDailyReview.loadBlockDOM 未注入",
  } as const;

  const DEFAULT_LOAD_MEMOS = async (): Promise<AsyncResult<MemoItem[]>> => {
    return { data: [], error: CONSTANTS.loadMemosError };
  };

  const DEFAULT_LOAD_BLOCK_DOM = async (): Promise<AsyncResult<string>> => {
    return { data: "", error: CONSTANTS.loadBlockDOMError };
  };

  const DEFAULT_OPEN_MEMO = (): void => {
    return;
  };

  export let sqlStatement = "";
  export let saveError = "";
  export let timeFormat = "";
  export let loadMemos: (
    params: MemoQueryParams,
  ) => Promise<AsyncResult<MemoItem[]>> = DEFAULT_LOAD_MEMOS;
  export let loadBlockDOM: (
    params: BlockDOMQueryParams,
  ) => Promise<AsyncResult<string>> = DEFAULT_LOAD_BLOCK_DOM;
  export let onOpenMemo: (memoId: string) => void = DEFAULT_OPEN_MEMO;
</script>

<div class="daily-review">
  {#if saveError}
    <div class="status error">{saveError}</div>
  {/if}

  <div class="review-list">
    <FomoMemoList
      {sqlStatement}
      {timeFormat}
      layout={DAILY_REVIEW_LAYOUT}
      {loadMemos}
      {loadBlockDOM}
      {onOpenMemo}
    />
  </div>
</div>

<style>
  .daily-review {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 752px;
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .status {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.65;
  }

  .status.error {
    color: var(--b3-theme-error, #d95c5c);
    opacity: 1;
  }

  .review-list {
    flex: 1;
    min-height: 360px;
  }
</style>
