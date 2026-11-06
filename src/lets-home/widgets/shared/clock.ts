export function formatClockHours(date: Date): string {
  return String(date.getHours()).padStart(2, "0");
}

export function formatClockMinutes(date: Date): string {
  return String(date.getMinutes()).padStart(2, "0");
}

export function formatClockSeconds(date: Date): string {
  return String(date.getSeconds()).padStart(2, "0");
}

export function formatClockTime(date: Date, includeSeconds: boolean): string {
  const time = `${formatClockHours(date)}:${formatClockMinutes(date)}`;
  return includeSeconds ? `${time}:${formatClockSeconds(date)}` : time;
}

export function formatClockMonthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function formatClockWeekday(date: Date): string {
  return `周${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}`;
}

export function formatClockDate(date: Date): string {
  return `${formatClockMonthDay(date)} ${formatClockWeekday(date)}`;
}

export function shouldShowClockSeconds(width: number, height: number): boolean {
  return width >= 4 || (width === 2 && height === 1);
}
