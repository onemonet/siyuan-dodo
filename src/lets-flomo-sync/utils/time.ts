/**
 * 时间处理工具
 */
import moment from "moment";

/**
 * 格式化日期为 YYYY-MM-DD 格式
 */
export function formatDate(timeString: any): string {
  if (moment.isMoment(timeString)) {
    return timeString.format('YYYY-MM-DD');
  }
  
  if (typeof timeString === 'string') {
    const parsed = moment(timeString);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }
  }
  
  if (typeof timeString === 'number') {
    const timestamp = timeString < 10000000000 ? timeString * 1000 : timeString;
    return moment(timestamp).format('YYYY-MM-DD');
  }
  
  return moment().format('YYYY-MM-DD');
}

/**
 * 根据自定义格式格式化时间
 * @param timeString 时间字符串或时间戳
 * @param format 格式化字符串，默认为 'YYYY-MM-DD HH:mm:ss'
 */
export function formatTime(timeString: any, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
  if (moment.isMoment(timeString)) {
    return timeString.format(format);
  }
  
  if (typeof timeString === 'string') {
    const parsed = moment(timeString);
    if (parsed.isValid()) {
      return parsed.format(format);
    }
  }
  
  if (typeof timeString === 'number') {
    const timestamp = timeString < 10000000000 ? timeString * 1000 : timeString;
    return moment(timestamp).format(format);
  }
  
  return moment().format(format);
}

/**
 * Format time using SiYuan's native timestamp shape: YYYYMMDDHHmmss.
 */
export function formatSiyuanTimestamp(timeValue: any): string {
  return formatTime(timeValue, 'YYYYMMDDHHmmss');
}

/**
 * Parse a SiYuan-style timestamp string such as YYYYMMDDHHmmss.
 */
export function parseSiyuanTimestamp(timeValue: any): moment.Moment | null {
  if (moment.isMoment(timeValue)) {
    return timeValue.clone();
  }

  if (timeValue === undefined || timeValue === null) {
    return null;
  }

  const rawValue = String(timeValue).trim();
  if (!/^\d{14}$/.test(rawValue)) {
    return null;
  }

  const parsed = moment(rawValue, 'YYYYMMDDHHmmss', true);
  return parsed.isValid() ? parsed : null;
}

/**
 * Format a stored memo timestamp for UI display using the configured format.
 */
export function formatConfiguredMemoDisplayTime(
  timeValue: any,
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
  const parsed = parseSiyuanTimestamp(timeValue);
  return parsed ? parsed.format(format) : '';
}

/**
 * 转换为中国时区时间
 */
export function toChinaTime(timeString: any): string {
  return moment(timeString).utcOffset('+08:00').format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 解析 Flomo 时间字段
 */
export function parseFlomoTime(timeValue: any): moment.Moment | null {
  if (!timeValue) return null;
  
  if (typeof timeValue === 'number') {
    return moment.unix(timeValue);
  }
  
  if (typeof timeValue === 'string') {
    const parsed = moment(timeValue);
    if (parsed.isValid()) {
      return parsed;
    }
    
    const timestamp = parseInt(timeValue);
    if (!isNaN(timestamp)) {
      return moment.unix(timestamp);
    }
  }
  
  return null;
}
