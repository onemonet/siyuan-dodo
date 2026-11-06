import {
  FLOMO_DEFAULT_LAYOUT,
  FLOMO_DEFAULT_TIME_FORMAT,
} from "../../config/constants";
import type { DashboardLayout } from "../types";
import { buildDailyReviewSQL, type ReviewTimeRange } from "./sql";

const DAILY_REVIEW_REFRESH_COMMENT_PREFIX = "daily-review-refresh";

export const DEFAULT_DAILY_REVIEW_COUNT = 8;
export const DEFAULT_DAILY_REVIEW_TIME_RANGE: ReviewTimeRange = "6months";
export const DAILY_REVIEW_DEFAULT_TIME_FORMAT = FLOMO_DEFAULT_TIME_FORMAT;
export const DAILY_REVIEW_LAYOUT: DashboardLayout = FLOMO_DEFAULT_LAYOUT;
export const DAILY_REVIEW_COUNT_OPTIONS = [4, 8, 12, 16, 20, 24] as const;
export const DAILY_REVIEW_RANGE_OPTIONS: Array<{
  value: ReviewTimeRange;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "1year", label: "1 年" },
  { value: "6months", label: "6 个月" },
  { value: "3months", label: "3 个月" },
  { value: "1month", label: "1 个月" },
];

export function parseDailyReviewCount(value: unknown): number {
  const parsed = Number(value);
  return DAILY_REVIEW_COUNT_OPTIONS.includes(
    parsed as (typeof DAILY_REVIEW_COUNT_OPTIONS)[number],
  )
    ? parsed
    : DEFAULT_DAILY_REVIEW_COUNT;
}

export function parseDailyReviewTimeRange(value: unknown): ReviewTimeRange {
  return DAILY_REVIEW_RANGE_OPTIONS.some((option) => option.value === value)
    ? (value as ReviewTimeRange)
    : DEFAULT_DAILY_REVIEW_TIME_RANGE;
}

export function buildDailyReviewStatement(
  count: number,
  timeRange: ReviewTimeRange,
  refreshVersion: number,
): string {
  const reviewSQL = buildDailyReviewSQL(count, timeRange);
  return `${reviewSQL}\n/* ${DAILY_REVIEW_REFRESH_COMMENT_PREFIX}:${refreshVersion} */`;
}
