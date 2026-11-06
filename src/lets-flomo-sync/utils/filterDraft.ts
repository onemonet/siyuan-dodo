import {
  FLOMO_DASHBOARD_LIMIT_OPTIONS,
  FLOMO_DEFAULT_SEARCH_LIMIT,
} from "../../config/constants";
import type { MemoFilter } from "./sql";

export type TagMode = "include_and" | "include_or" | "exclude";

export interface FilterDraft {
  keyword: string;
  dateMode: MemoFilter["dateMode"];
  recentDays?: number;
  day?: string;
  rangeStart?: string;
  rangeEnd?: string;
  tagMode: TagMode;
  tags: string[];
  orderBy: MemoFilter["orderBy"];
  limit: number;
}

export const FILTER_LIMIT_OPTIONS = FLOMO_DASHBOARD_LIMIT_OPTIONS;
export const DEFAULT_FILTER_LIMIT = FLOMO_DEFAULT_SEARCH_LIMIT;
export const DEFAULT_FILTER_DRAFT: FilterDraft = {
  keyword: "",
  dateMode: "all",
  recentDays: undefined,
  day: undefined,
  rangeStart: undefined,
  rangeEnd: undefined,
  tagMode: "include_and",
  tags: [],
  orderBy: "desc",
  limit: DEFAULT_FILTER_LIMIT,
};

export function createFilterDraftFromFilter(filter: MemoFilter): FilterDraft {
  return {
    keyword: filter.keyword || "",
    dateMode: filter.dateMode,
    recentDays: filter.recentDays,
    day: filter.day,
    rangeStart: filter.rangeStart,
    rangeEnd: filter.rangeEnd,
    tagMode: getFilterTagMode(filter.tagMode),
    tags: filter.tags ? [...filter.tags] : [],
    orderBy: filter.orderBy,
    limit: filter.limit,
  };
}

export function createDefaultFilterDraft(): FilterDraft {
  return {
    ...DEFAULT_FILTER_DRAFT,
    tags: [],
  };
}

export function buildFilterFromDraft(
  filter: MemoFilter,
  draft: FilterDraft,
): MemoFilter {
  return {
    ...filter,
    keyword: draft.keyword.trim(),
    dateMode: draft.dateMode,
    recentDays: draft.recentDays,
    day: draft.day,
    rangeStart: draft.rangeStart,
    rangeEnd: draft.rangeEnd,
    tagMode: draft.tags.length ? draft.tagMode : "all",
    tags: draft.tags.length ? [...draft.tags] : undefined,
    orderBy: draft.orderBy,
    limit: draft.limit,
  };
}

export function formatCompactDate(value?: string): string {
  if (!value) {
    return "";
  }

  const compact = value.replace(/-/g, "");
  if (compact.length !== 8) {
    return value;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function toCompactDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function getCurrentMonthRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return {
    start: toCompactDate(start),
    end: toCompactDate(end),
  };
}

export function isCurrentMonthRange(draft: FilterDraft): boolean {
  const currentMonth = getCurrentMonthRange();

  return (
    draft.dateMode === "range" &&
    formatCompactDate(draft.rangeStart) ===
      formatCompactDate(currentMonth.start) &&
    formatCompactDate(draft.rangeEnd) === formatCompactDate(currentMonth.end)
  );
}

export function getFilterDateSummary(draft: FilterDraft): string {
  if (draft.dateMode === "day" && draft.day) {
    return `当前日期：${formatCompactDate(draft.day)}`;
  }

  if (draft.dateMode === "range" && draft.rangeStart && draft.rangeEnd) {
    return `当前范围：${formatCompactDate(draft.rangeStart)} ~ ${formatCompactDate(draft.rangeEnd)}`;
  }

  if (draft.dateMode === "recent" && draft.recentDays) {
    return `当前范围：最近 ${draft.recentDays} 天`;
  }

  return "当前范围：全部";
}

function getFilterTagMode(tagMode: MemoFilter["tagMode"]): TagMode {
  return tagMode === "include_or" || tagMode === "exclude"
    ? tagMode
    : "include_and";
}
