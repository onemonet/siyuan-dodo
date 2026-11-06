import type { MonthStat } from "../types";

export interface MonthlyBarItem {
  key: string;
  label: string;
  year: number;
  month: number;
  count: number;
}

export const MONTHLY_BAR_MONTH_COUNT = 24;
export const MONTHLY_BAR_SVG_WIDTH = 760;
export const MONTHLY_BAR_SVG_HEIGHT = 260;
export const MONTHLY_BAR_PADDING = {
  top: 20,
  right: 18,
  bottom: 42,
  left: 42,
} as const;

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function buildRecentMonthItems(
  monthStats: MonthStat[],
  size = MONTHLY_BAR_MONTH_COUNT,
  now: Date = new Date(),
): MonthlyBarItem[] {
  const countMap = new Map(
    monthStats.map((monthStat) => [monthStat.month, monthStat.count]),
  );
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  return Array.from({ length: size }, (_, index) => {
    const date = new Date(
      end.getFullYear(),
      end.getMonth() - (size - index - 1),
      1,
    );
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = formatMonthKey(year, month);

    return {
      key,
      label: `${String(month).padStart(2, "0")}月`,
      year,
      month,
      count: countMap.get(key) || 0,
    };
  });
}

export function getMonthlyBarMaxCount(months: MonthlyBarItem[]): number {
  return months.reduce((max, item) => Math.max(max, item.count), 0);
}
