<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import "./fomoFilterBar.css";
  import FomoFilterPanel from "./FomoFilterPanel.svelte";
  import type { MemoFilter } from "../utils/sql";
  import {
    buildFilterFromDraft,
    createFilterDraftFromFilter,
    type FilterDraft,
  } from "../utils/filterDraft";
  import {
    FILTER_BAR_KEYS,
    FILTER_BAR_LABELS,
    getFilterKey,
    shouldCollapseFilterPanel,
    syncFilterDraft,
    updateFilterKeyword,
  } from "../utils/filterBar";

  export let filter: MemoFilter;

  const dispatch = createEventDispatcher<{
    change: MemoFilter;
    customSQL: { sql: string };
    expandchange: { expanded: boolean };
  }>();

  let shellElement: HTMLDivElement | null = null;
  let customSQLDraft = "";
  let expanded = false;
  let draft: FilterDraft = createFilterDraftFromFilter(filter);
  let lastFilterKey = "";

  function syncDraftFromFilter(nextFilter: MemoFilter): void {
    const result = syncFilterDraft(nextFilter, lastFilterKey, draft);
    lastFilterKey = result.filterKey;
    draft = result.draft;
  }

  function setExpanded(nextExpanded: boolean): void {
    expanded = nextExpanded;
  }

  function applySearch(): void {
    dispatch("customSQL", { sql: customSQLDraft.trim() });
    dispatch("change", buildFilterFromDraft(filter, draft));
    expanded = false;
  }

  function handleKeywordInput(event: Event): void {
    draft = updateFilterKeyword(
      draft,
      (event.currentTarget as HTMLInputElement).value,
    );
  }

  function handleKeywordKeydown(event: KeyboardEvent): void {
    if (event.key !== FILTER_BAR_KEYS.enter) {
      return;
    }

    event.preventDefault();
    applySearch();
  }

  function handleOutsidePointerDown(event: PointerEvent): void {
    expanded = shouldCollapseFilterPanel(
      shellElement,
      expanded,
      event.target,
    )
      ? false
      : expanded;
  }

  function handleDraftChange(event: CustomEvent<{ draft: FilterDraft }>): void {
    draft = event.detail.draft;
  }

  function handleCustomSQLDraftChange(event: CustomEvent<{ sql: string }>): void {
    customSQLDraft = event.detail.sql;
  }

  function handlePanelApply(
    event: CustomEvent<{ filter: MemoFilter; customSQL: string }>,
  ): void {
    dispatch("customSQL", { sql: event.detail.customSQL });
    dispatch("change", event.detail.filter);
    lastFilterKey = getFilterKey(event.detail.filter);
    customSQLDraft = event.detail.customSQL;
    expanded = false;
  }

  function handlePanelReset(event: CustomEvent<{ filter: MemoFilter }>): void {
    dispatch("customSQL", { sql: "" });
    dispatch("change", event.detail.filter);
    lastFilterKey = getFilterKey(event.detail.filter);
    customSQLDraft = "";
    expanded = false;
  }

  $: syncDraftFromFilter(filter);
  $: dispatch("expandchange", { expanded });
</script>

<svelte:window on:pointerdown={handleOutsidePointerDown} />

<div class="flomo-filter-shell" bind:this={shellElement} class:expanded>
  <div class="flomo-filter-search-row">
    <div class="flomo-filter-search-box">
      <input
        class="flomo-filter-search-input"
        class:expanded
        type="text"
        value={draft.keyword}
        placeholder={FILTER_BAR_LABELS.searchPlaceholder}
        on:focus={() => setExpanded(true)}
        on:click={() => setExpanded(true)}
        on:input={handleKeywordInput}
        on:keydown={handleKeywordKeydown}
      />
    </div>
  </div>

  {#if expanded}
    <FomoFilterPanel
      {filter}
      {draft}
      {customSQLDraft}
      on:draftchange={handleDraftChange}
      on:customsqldraftchange={handleCustomSQLDraftChange}
      on:apply={handlePanelApply}
      on:reset={handlePanelReset}
    />
  {/if}
</div>
