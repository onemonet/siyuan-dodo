import { ICalculator } from "../calculators/ICalculator";

/**
 * 日期计算器
 * 处理日期加减运算和日期差值计算
 */
export class DateCalculator implements ICalculator {
  /**
   * 判断是否可以处理该表达式
   */
  canHandle(expression: string): boolean {
    if (!expression || !expression.trim()) {
      return false;
    }

    const expr = expression.trim();
    
    // 检查是否包含日期关键字
    return this.containsDateKeywords(expr);
  }

  /**
   * 计算日期表达式
   */
  calculate(expression: string): string {
    try {
      const cleanExpr = expression
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
        .trim();

      // 处理中文日期表达式
      const processedExpr = DateCalculator.processDateExpression(cleanExpr);

      // 处理日期加减运算
      const dateAdd = DateCalculator.parseDateAddExpression(processedExpr);
      if (dateAdd) {
        return DateCalculator.calculateDateOffset(dateAdd.dateStr, dateAdd.amount, dateAdd.unit, true);
      }

      const dateSub = DateCalculator.parseDateSubExpression(processedExpr);
      if (dateSub) {
        return DateCalculator.calculateDateOffset(dateSub.dateStr, dateSub.amount, dateSub.unit, false);
      }

      // 处理日期差值计算
      const dateDiff = DateCalculator.parseDateDiffExpression(processedExpr);
      if (dateDiff) {
        const startDate = new Date(dateDiff.startDateStr);
        const endDate = DateCalculator.parseRelativeDate(dateDiff.endDateStr);
        const { years, months, days, totalDays } = DateCalculator.calculateAge(startDate, endDate);
        return DateCalculator.formatAgeDiff(years, months, days, totalDays);
      }

      return '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 检查是否包含日期关键字
   */
  private containsDateKeywords(expr: string): boolean {
    const dateKeywords = [
      '天', '月', '年', '小时', '分钟', '周',
      'days', 'months', 'years', 'hours', 'minutes', 'weeks',
      '今天', '明天', '昨天', '后天', '前天', '大后天', '大前天',
      'today', '到', '至'
    ];
    return dateKeywords.some(keyword => expr.includes(keyword));
  }

  /**
   * 相对日期映射表
   */
  private static readonly RELATIVE_DATE_MAP: Record<string, number> = {
    '大后天': 3,
    '后天': 2,
    '明天': 1,
    '今天': 0,
    'today': 0,
    '昨天': -1,
    '前天': -2,
    '大前天': -3,
  };

  /**
   * 处理日期表达式（将中文日期转换为标准格式）
   */
  static processDateExpression(expr: string): string {
    const getRelativeDate = (offset: number): string => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return date.toISOString().split('T')[0];
    };

    return expr
      .replace(/大后天/g, `"${getRelativeDate(3)}"`)
      .replace(/后天/g, `"${getRelativeDate(2)}"`)
      .replace(/明天/g, `"${getRelativeDate(1)}"`)
      .replace(/今天|today/gi, `"${getRelativeDate(0)}"`)
      .replace(/昨天/g, `"${getRelativeDate(-1)}"`)
      .replace(/前天/g, `"${getRelativeDate(-2)}"`)
      .replace(/大前天/g, `"${getRelativeDate(-3)}"`)
      .replace(/(\d+)\s*天/g, '$1 days')
      .replace(/(\d+)\s*小时/g, '$1 hours')
      .replace(/(\d+)\s*分钟/g, '$1 minutes')
      .replace(/(\d+)\s*周/g, '$1 weeks')
      .replace(/(\d+)\s*月/g, '$1 months')
      .replace(/(\d+)\s*年/g, '$1 years');
  }

  /**
   * 解析相对日期字符串为 Date 对象
   */
  static parseRelativeDate(dateStr: string): Date {
    const offset = this.RELATIVE_DATE_MAP[dateStr];
    if (offset !== undefined) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return date;
    }
    return new Date(dateStr);
  }

  /**
   * 计算日期偏移
   * @param dateStr 起始日期字符串
   * @param amount 偏移量
   * @param unit 单位（days/hours/minutes/weeks/months/years）
   * @param isAdd true=加法，false=减法
   */
  static calculateDateOffset(
    dateStr: string,
    amount: number,
    unit: string,
    isAdd: boolean
  ): string {
    const date = new Date(dateStr);
    const offset = isAdd ? amount : -amount;

    switch (unit) {
      case 'days':
        date.setDate(date.getDate() + offset);
        break;
      case 'hours':
        date.setHours(date.getHours() + offset);
        break;
      case 'minutes':
        date.setMinutes(date.getMinutes() + offset);
        break;
      case 'weeks':
        date.setDate(date.getDate() + offset * 7);
        break;
      case 'months':
        date.setMonth(date.getMonth() + offset);
        break;
      case 'years':
        date.setFullYear(date.getFullYear() + offset);
        break;
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * 计算两个日期之间的精确年龄
   */
  static calculateAge(startDate: Date, endDate: Date) {
    let years = endDate.getFullYear() - startDate.getFullYear();
    let months = endDate.getMonth() - startDate.getMonth();
    let days = endDate.getDate() - startDate.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    const totalDays = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return { years, months, days, totalDays };
  }

  /**
   * 解析日期加减运算表达式
   * 例如："2024-01-01 + 7 days"
   */
  static parseDateAddExpression(expr: string): {
    dateStr: string;
    amount: number;
    unit: string;
  } | null {
    const match = expr.match(/[""']?([\d-]+)[""']?\s*\+\s*(\d+)\s*(days|hours|minutes|weeks|months|years)/);
    if (match) {
      return {
        dateStr: match[1],
        amount: parseInt(match[2]),
        unit: match[3],
      };
    }
    return null;
  }

  /**
   * 解析日期减法运算表达式
   * 例如："2024-12-31 - 7 days"
   */
  static parseDateSubExpression(expr: string): {
    dateStr: string;
    amount: number;
    unit: string;
  } | null {
    const match = expr.match(/[""']?([\d-]+)[""']?\s*-\s*(\d+)\s*(days|hours|minutes|weeks|months|years)/);
    if (match) {
      return {
        dateStr: match[1],
        amount: parseInt(match[2]),
        unit: match[3],
      };
    }
    return null;
  }

  /**
   * 解析日期差值计算表达式
   * 例如："2024-01-01 到 今天"
   */
  static parseDateDiffExpression(expr: string): {
    startDateStr: string;
    endDateStr: string;
  } | null {
    const match = expr.match(/["']?([\d-]+)["']?\s*(到|至|~|to)\s*["']?([\d-]+|今天|明天|昨天|后天|前天|大后天|大前天|today)["']?/i);
    if (match) {
      return {
        startDateStr: match[1],
        endDateStr: match[3],
      };
    }
    return null;
  }

  /**
   * 格式化年龄差值结果
   */
  static formatAgeDiff(years: number, months: number, days: number, totalDays: number): string {
    const parts = [];
    if (years > 0) parts.push(`${years}年`);
    if (months > 0) parts.push(`${months}个月`);
    if (days > 0 || parts.length === 0) parts.push(`${days}天`);
    return `${parts.join('')}（共${totalDays}天）`;
  }
}
