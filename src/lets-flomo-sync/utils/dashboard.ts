import type { MemoFilter } from "./sql";

const CONSTANTS = {
  dateSeparator: "-",
  compactDateLength: 8,
  padStartLength: 2,
  padCharacter: "0",
} as const;

export function toCompactDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.split(CONSTANTS.dateSeparator).join("");
}

export function toDashedDate(value?: string): string {
  if (!value) {
    return "";
  }

  const compactValue = value.split(CONSTANTS.dateSeparator).join("");
  if (compactValue.length !== CONSTANTS.compactDateLength) {
    return value;
  }

  const year = compactValue.slice(0, 4);
  const month = compactValue.slice(4, 6);
  const day = compactValue.slice(6, 8);
  return `${year}-${month}-${day}`;
}

export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
  };
}

export function buildDayFilter(filter: MemoFilter, dayKey: string): MemoFilter {
  return {
    ...filter,
    dateMode: "day",
    day: toCompactDate(dayKey),
    recentDays: undefined,
    rangeStart: undefined,
    rangeEnd: undefined,
  };
}

export function buildRangeFilter(filter: MemoFilter, rangeStart: string, rangeEnd: string): MemoFilter {
  return {
    ...filter,
    dateMode: "range",
    day: undefined,
    recentDays: undefined,
    rangeStart: toCompactDate(rangeStart),
    rangeEnd: toCompactDate(rangeEnd),
  };
}

export function clearDateFilter(filter: MemoFilter): MemoFilter {
  return {
    ...filter,
    dateMode: "all",
    day: undefined,
    recentDays: undefined,
    rangeStart: undefined,
    rangeEnd: undefined,
  };
}

export function buildTagFilter(
  filter: MemoFilter,
  tags: string[],
  mode: "include_and" | "include_or" | "exclude",
): MemoFilter {
  return {
    ...filter,
    tagMode: tags.length ? mode : "all",
    tags: tags.length ? [...tags] : undefined,
  };
}

function formatDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(
    CONSTANTS.padStartLength,
    CONSTANTS.padCharacter,
  );
  const day = String(date.getDate()).padStart(
    CONSTANTS.padStartLength,
    CONSTANTS.padCharacter,
  );

  return `${year}${month}${day}`;
}
