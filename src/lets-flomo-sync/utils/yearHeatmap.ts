import type { HeatmapDay } from "../types";

export interface YearHeatmapDayCell {
  dayKey: string;
  dayNumber: number;
  count: number;
}

export interface YearHeatmapMonthBlock {
  month: number;
  label: string;
  cells: Array<YearHeatmapDayCell | null>;
}

export const YEAR_HEATMAP_WEEKDAY_LABELS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "日",
] as const;

const YEAR_HEATMAP_MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;

const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

export function buildYearHeatmapMonths(
  targetYear: number,
  heatmapDays: HeatmapDay[],
): { months: YearHeatmapMonthBlock[]; maxCount: number } {
  const countMap = new Map<string, number>();
  let maxCount = 0;

  heatmapDays.forEach((heatmapDay) => {
    countMap.set(heatmapDay.dayKey, heatmapDay.count);
    maxCount = Math.max(maxCount, heatmapDay.count);
  });

  return {
    months: Array.from({ length: MONTHS_PER_YEAR }, (_, monthIndex) =>
      buildYearHeatmapMonth(targetYear, monthIndex, countMap),
    ),
    maxCount,
  };
}

function buildYearHeatmapMonth(
  targetYear: number,
  monthIndex: number,
  countMap: Map<string, number>,
): YearHeatmapMonthBlock {
  const firstDay = new Date(targetYear, monthIndex, 1);
  const daysInMonth = new Date(targetYear, monthIndex + 1, 0).getDate();
  const leadingEmpty = (firstDay.getDay() + 6) % DAYS_PER_WEEK;
  const cells: Array<YearHeatmapDayCell | null> = [];

  for (let emptyIndex = 0; emptyIndex < leadingEmpty; emptyIndex += 1) {
    cells.push(null);
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(targetYear, monthIndex, dayNumber);
    const dayKey = formatYearHeatmapDayKey(date);
    cells.push({
      dayKey,
      dayNumber,
      count: countMap.get(dayKey) || 0,
    });
  }

  while (cells.length % DAYS_PER_WEEK !== 0) {
    cells.push(null);
  }

  return {
    month: monthIndex + 1,
    label: YEAR_HEATMAP_MONTH_LABELS[monthIndex],
    cells,
  };
}

function formatYearHeatmapDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
