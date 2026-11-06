export interface HomeHoliday {
  name: string;
  start: string;
  end?: string;
}

export interface UpcomingHoliday extends HomeHoliday {
  dateLabel: string;
  daysUntil: number;
}

// Keep the first version local and deterministic; the data source can be replaced by settings later.
const HOME_HOLIDAYS: HomeHoliday[] = [
  { name: "中秋节", start: "2026-09-25", end: "2026-09-27" },
  { name: "国庆节", start: "2026-10-01", end: "2026-10-07" },
  { name: "元旦", start: "2027-01-01" },
  { name: "春节", start: "2027-02-06" },
];

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(value: string): string {
  const date = parseDate(value);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatDateLabel(holiday: HomeHoliday): string {
  return holiday.end
    ? `${formatDate(holiday.start)}-${formatDate(holiday.end)}`
    : formatDate(holiday.start);
}

export function getUpcomingHolidays(
  today = new Date(),
  limit = 4,
): UpcomingHoliday[] {
  const currentDay = startOfDay(today).getTime();
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  return HOME_HOLIDAYS.filter(
    (holiday) => parseDate(holiday.start).getTime() >= currentDay,
  )
    .slice(0, limit)
    .map((holiday) => ({
      ...holiday,
      dateLabel: formatDateLabel(holiday),
      daysUntil: Math.round(
        (parseDate(holiday.start).getTime() - currentDay) / dayMilliseconds,
      ),
    }));
}
