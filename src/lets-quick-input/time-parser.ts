export interface ParsedSemanticTime {
  date: Date;
  hasTime: boolean;
  source: string;
  text: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_MAP: Record<string, number> = {
  "1": 1,
  "一": 1,
  "二": 2,
  "2": 2,
  "三": 3,
  "3": 3,
  "四": 4,
  "4": 4,
  "五": 5,
  "5": 5,
  "六": 6,
  "6": 6,
  "日": 0,
  "天": 0,
  "7": 0,
  "0": 0,
};

const CHINESE_DIGIT_MAP: Record<string, number> = {
  "零": 0,
  "〇": 0,
  "一": 1,
  "二": 2,
  "两": 2,
  "俩": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
};

export function normalizeQuickInputTimeQuery(value: string): string {
  return value
    .replace(/\u200b/g, "")
    .replace(/[，。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTimeCommandPrefix(value: string): string {
  return normalizeQuickInputTimeQuery(value).replace(
    /^(时间|日期|日程|提醒|time|date)\s*/i,
    ""
  );
}

export function formatQuickInputTime(date: Date, hasTime: boolean): string {
  const dateText = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");

  if (!hasTime) {
    return dateText;
  }

  return `${dateText} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseSemanticTime(
  rawInput: string,
  referenceDate = new Date()
): ParsedSemanticTime | null {
  const source = stripTimeCommandPrefix(rawInput);
  if (!source) {
    return null;
  }

  const normalized = normalizeTimeWords(source.toLowerCase());
  const time = parseTimePart(normalized, referenceDate);
  const date = parseDatePart(normalized, referenceDate, time.hasTime);

  if (!date && !time.hasTime) {
    return null;
  }

  const result = date ?? startOfDay(referenceDate);
  if (time.hasTime) {
    result.setHours(time.hour, time.minute, 0, 0);
  }

  return {
    date: result,
    hasTime: time.hasTime,
    source,
    text: formatQuickInputTime(result, time.hasTime),
  };
}

function normalizeTimeWords(value: string): string {
  return value
    .replace(/：/g, ":")
    .replace(/[号號]/g, "日")
    .replace(/禮拜/g, "礼拜")
    .replace(/週/g, "周")
    .replace(/明早/g, "明天早上")
    .replace(/明晚/g, "明天晚上")
    .replace(/今晚/g, "今天晚上")
    .replace(/今早/g, "今天早上")
    .replace(/今夜/g, "今天晚上");
}

function parseDatePart(
  value: string,
  referenceDate: Date,
  hasTime: boolean
): Date | null {
  const explicitDate = parseExplicitDate(value, referenceDate);
  if (explicitDate) {
    return explicitDate;
  }

  const relativeDate = parseRelativeDate(value, referenceDate);
  if (relativeDate) {
    return relativeDate;
  }

  const weekdayDate = parseWeekdayDate(value, referenceDate);
  if (weekdayDate) {
    return weekdayDate;
  }

  if (/现在|当前|此刻|now/.test(value)) {
    const date = new Date(referenceDate);
    date.setSeconds(0, 0);
    return date;
  }

  return hasTime ? startOfDay(referenceDate) : null;
}

function parseExplicitDate(value: string, referenceDate: Date): Date | null {
  const yearDateMatch = value.match(
    /(\d{4})\s*(?:[-/.年])\s*(\d{1,2})\s*(?:[-/.月])\s*(\d{1,2})\s*日?/
  );
  if (yearDateMatch) {
    return makeValidDate(
      Number(yearDateMatch[1]),
      Number(yearDateMatch[2]),
      Number(yearDateMatch[3])
    );
  }

  const chineseYearDateMatch = value.match(
    /(\d{4})年([零〇一二两三四五六七八九十\d]{1,3})月([零〇一二两三四五六七八九十\d]{1,3})日/
  );
  if (chineseYearDateMatch) {
    return makeValidDate(
      Number(chineseYearDateMatch[1]),
      parseSemanticNumber(chineseYearDateMatch[2]),
      parseSemanticNumber(chineseYearDateMatch[3])
    );
  }

  const monthDayMatch =
    value.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/) ??
    value.match(/(\d{1,2})\s*[/.]\s*(\d{1,2})/);
  if (monthDayMatch) {
    return makeForwardMonthDay(
      referenceDate,
      Number(monthDayMatch[1]),
      Number(monthDayMatch[2])
    );
  }

  const chineseMonthDayMatch = value.match(
    /([零〇一二两三四五六七八九十\d]{1,3})月([零〇一二两三四五六七八九十\d]{1,3})日/
  );
  if (chineseMonthDayMatch) {
    return makeForwardMonthDay(
      referenceDate,
      parseSemanticNumber(chineseMonthDayMatch[1]),
      parseSemanticNumber(chineseMonthDayMatch[2])
    );
  }

  return null;
}

function parseRelativeDate(value: string, referenceDate: Date): Date | null {
  if (/大前天/.test(value)) {
    return addDays(referenceDate, -3);
  }
  if (/前天/.test(value)) {
    return addDays(referenceDate, -2);
  }
  if (/昨天|昨日|yesterday/.test(value)) {
    return addDays(referenceDate, -1);
  }
  if (/大后天|大後天/.test(value)) {
    return addDays(referenceDate, 3);
  }
  if (/后天|後天/.test(value)) {
    return addDays(referenceDate, 2);
  }
  if (/明天|明日|tomorrow/.test(value)) {
    return addDays(referenceDate, 1);
  }
  if (/今天|今日|today/.test(value)) {
    return startOfDay(referenceDate);
  }

  const relativeMatch = value.match(
    /([零〇一二两三四五六七八九十百\d]+)\s*(天|日|周|星期|礼拜|个月|月|年)\s*(后|後|以后|之後|之后|前|以前|之前)/
  );
  if (!relativeMatch) {
    return null;
  }

  const amount = parseSemanticNumber(relativeMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const direction = /前|以前|之前/.test(relativeMatch[3]) ? -1 : 1;
  const unit = relativeMatch[2];
  const date = startOfDay(referenceDate);

  if (unit === "天" || unit === "日") {
    return addDays(date, amount * direction);
  }
  if (unit === "周" || unit === "星期" || unit === "礼拜") {
    return addDays(date, amount * 7 * direction);
  }
  if (unit === "个月" || unit === "月") {
    date.setMonth(date.getMonth() + amount * direction);
    return date;
  }
  if (unit === "年") {
    date.setFullYear(date.getFullYear() + amount * direction);
    return date;
  }

  return null;
}

function parseWeekdayDate(value: string, referenceDate: Date): Date | null {
  const weekdayMatch = value.match(
    /(上上|下下|上|下|本|这|這)?\s*(周|星期|礼拜)\s*([一二三四五六日天0-7])/
  );
  if (!weekdayMatch) {
    return null;
  }

  const prefix = weekdayMatch[1] || "";
  const targetWeekday = WEEKDAY_MAP[weekdayMatch[3]];
  if (targetWeekday === undefined) {
    return null;
  }

  const today = startOfDay(referenceDate);
  const currentWeekday = today.getDay();
  let diff = targetWeekday - currentWeekday;

  if (prefix === "下") {
    diff += 7;
  } else if (prefix === "下下") {
    diff += 14;
  } else if (prefix === "上") {
    diff -= 7;
  } else if (prefix === "上上") {
    diff -= 14;
  } else if (prefix === "本" || prefix === "这" || prefix === "這") {
    // Keep this week's day, even when it is already in the past.
  } else if (diff <= 0) {
    diff += 7;
  }

  return addDays(today, diff);
}

function parseTimePart(
  value: string,
  referenceDate: Date
): { hasTime: boolean; hour: number; minute: number } {
  if (/现在|当前|此刻|now/.test(value)) {
    return {
      hasTime: true,
      hour: referenceDate.getHours(),
      minute: referenceDate.getMinutes(),
    };
  }

  const colonMatch = value.match(/([01]?\d|2[0-3])\s*:\s*([0-5]?\d)/);
  if (colonMatch) {
    return {
      hasTime: true,
      hour: applyMeridiem(value, Number(colonMatch[1])),
      minute: Number(colonMatch[2]),
    };
  }

  const pointMatch = value.match(
    /([零〇一二两三四五六七八九十\d]{1,3})\s*(点|時|时)(半|([零〇一二两三四五六七八九十\d]{1,3})\s*分?)?/
  );
  if (pointMatch) {
    let hour = parseSemanticNumber(pointMatch[1]);
    let minute = pointMatch[3] === "半" ? 30 : 0;
    if (pointMatch[4]) {
      minute = parseSemanticNumber(pointMatch[4]);
    }

    if (!isValidHourMinute(hour, minute)) {
      return { hasTime: false, hour: 0, minute: 0 };
    }

    hour = applyMeridiem(value, hour);
    return { hasTime: true, hour, minute };
  }

  if (/中午|正午/.test(value)) {
    return { hasTime: true, hour: 12, minute: 0 };
  }
  if (/凌晨|午夜/.test(value)) {
    return { hasTime: true, hour: 0, minute: 0 };
  }

  return { hasTime: false, hour: 0, minute: 0 };
}

function applyMeridiem(value: string, hour: number): number {
  if (/凌晨|午夜/.test(value)) {
    return hour === 12 ? 0 : hour;
  }
  if (/下午|午后|晚上|夜里|晚间/.test(value)) {
    return hour < 12 ? hour + 12 : hour;
  }
  if (/中午|正午/.test(value)) {
    return hour < 11 ? hour + 12 : hour;
  }
  return hour;
}

function parseSemanticNumber(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  if (value === "十") {
    return 10;
  }

  const hundredIndex = value.indexOf("百");
  if (hundredIndex >= 0) {
    const high = value.slice(0, hundredIndex);
    const low = value.slice(hundredIndex + 1);
    return (high ? parseSemanticNumber(high) : 1) * 100 + (low ? parseSemanticNumber(low) : 0);
  }

  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const high = value.slice(0, tenIndex);
    const low = value.slice(tenIndex + 1);
    return (high ? parseSemanticNumber(high) : 1) * 10 + (low ? parseSemanticNumber(low) : 0);
  }

  let result = 0;
  for (const char of value) {
    const digit = CHINESE_DIGIT_MAP[char];
    if (digit === undefined) {
      return NaN;
    }
    result = result * 10 + digit;
  }
  return result;
}

function makeForwardMonthDay(
  referenceDate: Date,
  month: number,
  day: number
): Date | null {
  const currentYear = referenceDate.getFullYear();
  let date = makeValidDate(currentYear, month, day);
  if (!date) {
    return null;
  }

  if (date.getTime() < startOfDay(referenceDate).getTime()) {
    date = makeValidDate(currentYear + 1, month, day);
  }
  return date;
}

function makeValidDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, amount: number): Date {
  const result = startOfDay(date);
  result.setTime(result.getTime() + amount * DAY_MS);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isValidHourMinute(hour: number, minute: number): boolean {
  return (
    Number.isFinite(hour) &&
    Number.isFinite(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
