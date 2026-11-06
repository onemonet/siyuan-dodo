import {
  FLOMO_MAX_MEMO_LIMIT,
  FLOMO_MEMO_ATTR,
} from "../../config/constants";
import {
  SQL_LIKE_ESCAPE_CLAUSE,
  sqlLikeContains,
} from "../../security-utils";
import type { MemoFilter, ReviewTimeRange } from "./sqlTypes";

export const MEMO_ATTR = FLOMO_MEMO_ATTR;
export const MEMO_ATTR_LIKE = `${FLOMO_MEMO_ATTR}%`;
export const MAX_MEMO_LIMIT = FLOMO_MAX_MEMO_LIMIT;
export const MAX_STATS_LIMIT = 65535;

const KEYWORD_SEPARATOR_REGEX = /\s+/;

export function buildDateConditions(filter: MemoFilter): string[] {
  switch (filter.dateMode) {
    case "recent":
      return buildRecentDateCondition(filter.recentDays);
    case "day":
      return buildSingleDayCondition(filter.day);
    case "range":
      return buildDateRangeConditions(filter.rangeStart, filter.rangeEnd);
    case "all":
    default:
      return [];
  }
}

export function buildTagConditions(filter: MemoFilter): string[] {
  if (filter.tagMode === "all") {
    return [];
  }

  if (filter.tagMode === "none") {
    return ["AND (B.tag = '' OR B.tag IS NULL)"];
  }

  const tags = normalizeTags(filter.tags);
  if (!tags.length) {
    return [];
  }

  if (filter.tagMode === "include_and") {
    return tags.map((tag) => `AND B.tag LIKE ${sqlLikeContains(`#${tag}#`)} ${SQL_LIKE_ESCAPE_CLAUSE}`);
  }

  if (filter.tagMode === "include_or") {
    const likeClauses = tags.map(
      (tag) => `B.tag LIKE ${sqlLikeContains(`#${tag}#`)} ${SQL_LIKE_ESCAPE_CLAUSE}`,
    );
    return [`AND (${likeClauses.join(" OR ")})`];
  }

  if (filter.tagMode === "exclude") {
    return tags.map(
      (tag) => `AND (B.tag IS NULL OR B.tag NOT LIKE ${sqlLikeContains(`#${tag}#`)} ${SQL_LIKE_ESCAPE_CLAUSE})`,
    );
  }

  return [];
}

export function buildContentKeywordConditions(filter: MemoFilter): string[] {
  return normalizeKeywordTerms(filter.keyword || "").map(
    (keyword) => `AND B.content LIKE ${sqlLikeContains(keyword)} ${SQL_LIKE_ESCAPE_CLAUSE}`,
  );
}

export function buildReviewRangeCondition(timeRange: ReviewTimeRange): string {
  switch (timeRange) {
    case "1year":
      return "AND A.value >= strftime('%Y%m%d%H%M%S', 'now', '-1 year')";
    case "6months":
      return "AND A.value >= strftime('%Y%m%d%H%M%S', 'now', '-6 months')";
    case "3months":
      return "AND A.value >= strftime('%Y%m%d%H%M%S', 'now', '-3 months')";
    case "1month":
      return "AND A.value >= strftime('%Y%m%d%H%M%S', 'now', '-1 month')";
    case "all":
    default:
      return "";
  }
}

export function clampLimit(limit: number, maxLimit: number): number {
  const normalized = typeof limit === "number" && Number.isFinite(limit)
    ? Math.floor(limit)
    : 1;
  return Math.max(1, Math.min(normalized, maxLimit));
}

export function normalizeKeywordTerms(content: string): string[] {
  return content
    .split(KEYWORD_SEPARATOR_REGEX)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

export function normalizeYear(year: number): string {
  const normalized = typeof year === "number" && Number.isFinite(year)
    ? Math.floor(year)
    : new Date().getFullYear();
  return String(normalized);
}

function buildRecentDateCondition(days?: number): string[] {
  const recentDays = normalizeRecentDays(days);
  const offsetDays = Math.max(recentDays - 1, 0);
  return [
    `AND substr(A.value, 1, 8) >= strftime('%Y%m%d', 'now', '-${offsetDays} days')`,
  ];
}

function buildSingleDayCondition(value?: string): string[] {
  const day = normalizeCompactDate(value);
  return day ? [`AND substr(A.value, 1, 8) = '${day}'`] : [];
}

function buildDateRangeConditions(rangeStart?: string, rangeEnd?: string): string[] {
  const normalizedRangeStart = normalizeCompactDate(rangeStart);
  const normalizedRangeEnd = normalizeCompactDate(rangeEnd);
  const conditions: string[] = [];

  if (normalizedRangeStart) {
    conditions.push(`AND substr(A.value, 1, 8) >= '${normalizedRangeStart}'`);
  }

  if (normalizedRangeEnd) {
    conditions.push(`AND substr(A.value, 1, 8) <= '${normalizedRangeEnd}'`);
  }

  return conditions;
}

function normalizeCompactDate(value?: string): string | null {
  if (!value) {
    return null;
  }

  const compact = value.replace(/-/g, "").trim();
  return /^\d{8}$/.test(compact) ? compact : null;
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags?.length) {
    return [];
  }

  return tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function normalizeRecentDays(days?: number): number {
  const normalized = typeof days === "number" && Number.isFinite(days)
    ? Math.floor(days)
    : 7;
  return Math.max(1, normalized);
}
