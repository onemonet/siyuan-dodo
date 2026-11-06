<script lang="ts">
  import type { MemoFilter } from "../utils/sql";
  import { FILTER_LIMIT_OPTIONS, type FilterDraft } from "../utils/filterDraft";
  import { createEventDispatcher } from "svelte";

  const CONSTANTS = {
    newestLabel: "最新",
    oldestLabel: "最早",
    quantityLabel: "数量",
    orderLabel: "排序",
  } as const;

  export let draft: FilterDraft;

  const dispatch = createEventDispatcher<{
    draftchange: { draft: FilterDraft };
  }>();

  function updateDraft(nextDraft: FilterDraft): void {
    dispatch("draftchange", { draft: nextDraft });
  }

  function setOrder(orderBy: MemoFilter["orderBy"]): void {
    updateDraft({ ...draft, orderBy });
  }

  function updateLimit(event: Event): void {
    updateDraft({ ...draft });
  }
</script>

<div class="filter-group filter-split-row">
  <div class="filter-inline-group">
    <span class="filter-group-label">{CONSTANTS.orderLabel}</span>
    <button
      class="filter-button"
      class:active={draft.orderBy === "desc"}
      type="button"
      on:click={() => setOrder("desc")}
    >
      {CONSTANTS.newestLabel}
    </button>
    <button
      class="filter-button"
      class:active={draft.orderBy === "asc"}
      type="button"
      on:click={() => setOrder("asc")}
    >
      {CONSTANTS.oldestLabel}
    </button>
  </div>

  <label class="filter-limit-select">
    <span class="filter-group-label">{CONSTANTS.quantityLabel}</span>
    <select class="filter-select" bind:value={draft.limit} on:change={updateLimit}>
      {#each FILTER_LIMIT_OPTIONS as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>
</div>
