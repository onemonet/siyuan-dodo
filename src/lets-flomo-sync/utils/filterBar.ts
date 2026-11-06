import type { MemoFilter } from "./sql";
import {
  createFilterDraftFromFilter,
  type FilterDraft,
} from "./filterDraft";

export const FILTER_BAR_LABELS = {
  searchPlaceholder: "搜索 memo 关键词",
} as const;

export const FILTER_BAR_KEYS = {
  enter: "Enter",
} as const;

export interface SyncedFilterDraft {
  draft: FilterDraft;
  filterKey: string;
}

export function getFilterKey(filter: MemoFilter): string {
  return JSON.stringify(filter);
}

export function syncFilterDraft(
  filter: MemoFilter,
  lastFilterKey: string,
  currentDraft: FilterDraft,
): SyncedFilterDraft {
  const filterKey = getFilterKey(filter);
  if (filterKey === lastFilterKey) {
    return {
      draft: currentDraft,
      filterKey: lastFilterKey,
    };
  }

  return {
    draft: createFilterDraftFromFilter(filter),
    filterKey,
  };
}

export function updateFilterKeyword(
  draft: FilterDraft,
  keyword: string,
): FilterDraft {
  return {
    ...draft,
    keyword,
  };
}

export function shouldCollapseFilterPanel(
  shellElement: HTMLElement | null,
  isExpanded: boolean,
  target: EventTarget | null,
): boolean {
  if (!isExpanded || !shellElement || !(target instanceof Node)) {
    return false;
  }

  return !shellElement.contains(target);
}
