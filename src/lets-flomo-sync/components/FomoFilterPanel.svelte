<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import "./fomoFilterPanel.css";
  import FomoCustomSqlPanel from "./FomoCustomSqlPanel.svelte";
  import FomoDateQuickFilters from "./FomoDateQuickFilters.svelte";
  import FomoFilterActions from "./FomoFilterActions.svelte";
  import FomoFilterSortLimit from "./FomoFilterSortLimit.svelte";
  import FomoTagCloud from "./FomoTagCloud.svelte";
  import type { MemoFilter } from "../utils/sql";
  import {
    buildFilterFromDraft,
    createDefaultFilterDraft,
    type FilterDraft,
    type TagMode,
  } from "../utils/filterDraft";

  const CONSTANTS = {
    tagLabel: "标签",
  } as const;

  export let filter: MemoFilter;
  export let draft: FilterDraft;
  export let customSQLDraft = "";

  const dispatch = createEventDispatcher<{
    draftchange: { draft: FilterDraft };
    customsqldraftchange: { sql: string };
    apply: { filter: MemoFilter; customSQL: string };
    reset: { filter: MemoFilter };
  }>();

  let showCustomSQL = false;

  function updateDraft(nextDraft: FilterDraft): void {
    draft = nextDraft;
    dispatch("draftchange", { draft: nextDraft });
  }

  function updateCustomSQLDraft(sql: string): void {
    customSQLDraft = sql;
    dispatch("customsqldraftchange", { sql });
  }

  function getDraftFilter(nextDraft: FilterDraft = draft): MemoFilter {
    return buildFilterFromDraft(filter, nextDraft);
  }

  function applyPanel(): void {
    dispatch("apply", {
      filter: getDraftFilter(),
      customSQL: customSQLDraft.trim(),
    });
  }

  function resetPanel(): void {
    const nextDraft = createDefaultFilterDraft();
    updateDraft(nextDraft);
    updateCustomSQLDraft("");
    showCustomSQL = false;
    dispatch("reset", { filter: getDraftFilter(nextDraft) });
  }

  function handleTagChange(
    event: CustomEvent<{ tags: string[]; mode: TagMode }>,
  ): void {
    updateDraft({
      ...draft,
      tags: [...event.detail.tags],
      tagMode: event.detail.mode,
    });
  }

  function handleDraftChange(event: CustomEvent<{ draft: FilterDraft }>): void {
    updateDraft(event.detail.draft);
  }

  function handleCustomSQLChange(event: CustomEvent<{ sql: string }>): void {
    updateCustomSQLDraft(event.detail.sql);
  }

  $: draftFilter = getDraftFilter();
</script>

<div class="fomo-filter-panel floating-panel">
  <FomoDateQuickFilters {draft} on:draftchange={handleDraftChange} />

  <div class="tag-panel">
    <span class="filter-group-label">{CONSTANTS.tagLabel}</span>
    <FomoTagCloud
      filter={draftFilter}
      selectedTags={draft.tags}
      mode={draft.tagMode}
      on:tagchange={handleTagChange}
    />
  </div>

  <FomoFilterSortLimit {draft} on:draftchange={handleDraftChange} />

  <FomoFilterActions
    {showCustomSQL}
    on:togglesql={() => (showCustomSQL = !showCustomSQL)}
    on:reset={resetPanel}
    on:apply={applyPanel}
  />

  {#if showCustomSQL}
    <FomoCustomSqlPanel
      {customSQLDraft}
      on:change={handleCustomSQLChange}
    />
  {/if}
</div>
