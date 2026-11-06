<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    getCurrentMonthRange,
    getFilterDateSummary,
    isCurrentMonthRange,
    type FilterDraft,
  } from "../utils/filterDraft";

  const CONSTANTS = {
    allDateLabel: "全部",
    recent7Label: "最近7天",
    recent30Label: "近30天",
    recent90Label: "近90天",
    currentMonthLabel: "本月",
    timeLabel: "时间",
  } as const;

  export let draft: FilterDraft;

  const dispatch = createEventDispatcher<{
    draftchange: { draft: FilterDraft };
  }>();

  function updateDraft(nextDraft: FilterDraft): void {
    dispatch("draftchange", { draft: nextDraft });
  }

  function setAllDates(): void {
    updateDraft({
      ...draft,
      dateMode: "all",
      recentDays: undefined,
      day: undefined,
      rangeStart: undefined,
      rangeEnd: undefined,
    });
  }

  function setRecentDays(days: number): void {
    updateDraft({
      ...draft,
      dateMode: "recent",
      recentDays: days,
      day: undefined,
      rangeStart: undefined,
      rangeEnd: undefined,
    });
  }

  function setCurrentMonth(): void {
    const currentMonth = getCurrentMonthRange();
    updateDraft({
      ...draft,
      dateMode: "range",
      recentDays: undefined,
      day: undefined,
      rangeStart: currentMonth.start,
      rangeEnd: currentMonth.end,
    });
  }

  $: dateSummary = getFilterDateSummary(draft);
</script>

<div class="filter-summary">{dateSummary}</div>

<div class="filter-group">
  <span class="filter-group-label">{CONSTANTS.timeLabel}</span>
  <button
    class="filter-button"
    class:active={draft.dateMode === "all"}
    type="button"
    on:click={setAllDates}
  >
    {CONSTANTS.allDateLabel}
  </button>
  <button
    class="filter-button"
    class:active={draft.dateMode === "recent" && draft.recentDays === 7}
    type="button"
    on:click={() => setRecentDays(7)}
  >
    {CONSTANTS.recent7Label}
  </button>
  <button
    class="filter-button"
    class:active={draft.dateMode === "recent" && draft.recentDays === 30}
    type="button"
    on:click={() => setRecentDays(30)}
  >
    {CONSTANTS.recent30Label}
  </button>
  <button
    class="filter-button"
    class:active={draft.dateMode === "recent" && draft.recentDays === 90}
    type="button"
    on:click={() => setRecentDays(90)}
  >
    {CONSTANTS.recent90Label}
  </button>
  <button
    class="filter-button"
    class:active={isCurrentMonthRange(draft)}
    type="button"
    on:click={setCurrentMonth}
  >
    {CONSTANTS.currentMonthLabel}
  </button>
</div>
