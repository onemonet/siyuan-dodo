import type { HeatmapDay } from "../types";

const CONSTANTS = {
  daysPerWeek: 7,
  monthLabels: [
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
  ],
} as const;

export interface HeatmapDayCell {
  date: Date;
  dayKey: string;
  count: number;
}

export type HeatmapWeek = Array<HeatmapDayCell | null>;

export interface HeatmapMonthLabel {
  month: string;
  year: number;
  weekIndex: number;
}

export interface HeatmapCalendar {
  weeks: HeatmapWeek[];
  monthLabels: HeatmapMonthLabel[];
  totalCount: number;
  maxCount: number;
}

export function formatHeatmapDayKey(date: Date): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sortDayRange(
  rangeStart: string,
  rangeEnd: string,
): [string, string] {
  return rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
}

export function isDayInRange(
  dayKey: string,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return Boolean(rangeStart && rangeEnd && dayKey >= rangeStart && dayKey <= rangeEnd);
}

export function buildHeatmapCalendar(
  heatmapDays: HeatmapDay[],
  today: Date,
): HeatmapCalendar {
  if (!heatmapDays.length) {
    return createEmptyHeatmapCalendar();
  }

  const countByDay = new Map<string, number>();
  let totalCount = 0;
  let maxCount = 0;

  heatmapDays.forEach((heatmapDay) => {
    countByDay.set(heatmapDay.dayKey, heatmapDay.count);
    totalCount += heatmapDay.count;
    maxCount = Math.max(maxCount, heatmapDay.count);
  });

  const startDate = parseHeatmapDayKey(heatmapDays[0].dayKey);
  if (!startDate) {
    return createEmptyHeatmapCalendar();
  }

  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeks = buildHeatmapWeeks(startDate, endDate, countByDay);

  return {
    weeks,
    monthLabels: buildHeatmapMonthLabels(weeks),
    totalCount,
    maxCount,
  };
}

function createEmptyHeatmapCalendar(): HeatmapCalendar {
  return {
    weeks: [],
    monthLabels: [],
    totalCount: 0,
    maxCount: 0,
  };
}

function parseHeatmapDayKey(dayKey: string): Date | null {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function buildHeatmapWeeks(
  startDate: Date,
  endDate: Date,
  countByDay: Map<string, number>,
): HeatmapWeek[] {
  const weeks: HeatmapWeek[] = [];
  const weekStart = new Date(startDate);
  weekStart.setDate(weekStart.getDate() - getMondayBasedWeekdayIndex(weekStart));

  while (weekStart <= endDate) {
    const week: HeatmapWeek = [];

    for (let dayIndex = 0; dayIndex < CONSTANTS.daysPerWeek; dayIndex += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);
      const dayKey = formatHeatmapDayKey(date);

      if (date < startDate || date > endDate) {
        week.push(null);
      } else {
        week.push({
          date,
          dayKey,
          count: countByDay.get(dayKey) || 0,
        });
      }
    }

    weeks.push(week);
    weekStart.setDate(weekStart.getDate() + CONSTANTS.daysPerWeek);
  }

  return weeks;
}

function getMondayBasedWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % CONSTANTS.daysPerWeek;
}

function buildHeatmapMonthLabels(weeks: HeatmapWeek[]): HeatmapMonthLabel[] {
  const monthLabels: HeatmapMonthLabel[] = [];
  let currentMonth = -1;
  let currentYear = -1;

  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find((day) => Boolean(day));
    if (!firstDay) {
      return;
    }

    const month = firstDay.date.getMonth();
    const year = firstDay.date.getFullYear();
    const isNewMonth = currentMonth === -1 || month !== currentMonth || year !== currentYear;
    if (!isNewMonth) {
      return;
    }

    const hasFirstDayOfMonth = week.some((day) => day?.date.getDate() === 1);
    if (!hasFirstDayOfMonth && currentMonth !== -1) {
      return;
    }

    monthLabels.push({
      month: CONSTANTS.monthLabels[month],
      year,
      weekIndex,
    });
    currentMonth = month;
    currentYear = year;
  });

  return monthLabels;
}
