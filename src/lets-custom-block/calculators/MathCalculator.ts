import { ICalculator } from "./ICalculator";
import { MathJsLoader } from "../utils/mathjs-loader";

/**
 * 纯数学计算器
 * 使用 Math.js 进行数学表达式计算
 */
export class MathCalculator implements ICalculator {
  /**
   * Math.js 保留函数名列表
   * 这些函数名单独出现时不应该被计算
   */
  private static readonly MATHJS_FUNCTIONS = [
    'pow', 'sqrt', 'sin', 'cos', 'tan', 'log', 'exp', 'abs', 
    'floor', 'ceil', 'round', 'max', 'min', 'asin', 'acos', 
    'atan', 'sinh', 'cosh', 'tanh', 'ln', 'log10', 'cbrt',
    'sign', 'factorial', 'gcd', 'lcm', 'random'
  ];

  /**
   * 判断是否可以处理该表达式
   * 日期表达式由 DateCalculator 处理，这里只处理纯数学表达式
   */
  canHandle(expression: string): boolean {
    if (!expression || !expression.trim()) {
      return false;
    }

    const trimmed = expression.toLowerCase().trim();
    
    // 过滤掉只有函数名的情况
    if (MathCalculator.MATHJS_FUNCTIONS.includes(trimmed)) {
      return false;
    }

    // 包含日期关键字的交给 DateCalculator
    if (this.containsDateKeywords(trimmed)) {
      return false;
    }

    return true;
  }

  /**
   * 计算数学表达式
   */
  calculate(expression: string): string {
    // 检查 Math.js 是否加载
    if (!MathJsLoader.isLoaded()) {
      if (MathJsLoader.isError()) {
        return '';
      }
      return '⏳ 加载中...';
    }

    const math = MathJsLoader.getMath();

    try {
      // 清理零宽字符和特殊空格
      const cleanExpr = this.cleanExpression(expression);

      // 计算
      let result = math.evaluate(cleanExpr);

      // 过滤无效结果
      if (!this.isValidResult(result)) {
        return '';
      }

      // 处理 Unit 对象（单位计算结果）
      if (typeof result === 'object' && result !== null && typeof result.toString === 'function') {
        // 获取数值部分进行格式化
        const value = result.toNumber();
        const formattedValue = this.formatNumber(value);
        
        // 重新构造 Unit 对象
        const unit = result.toString().replace(/^[\d.\-+eE]+\s*/, ''); // 提取单位部分
        return `${formattedValue} ${unit}`;
      }

      // 格式化纯数字结果
      if (typeof result === 'number') {
        result = this.formatNumber(result);
      }

      return String(result);
    } catch (error) {
      // 输入不完整或有语法错误时返回空
      return '';
    }
  }

  /**
   * 清理表达式中的特殊字符
   */
  private cleanExpression(expr: string): string {
    return expr
      // 清理零宽字符
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // 清理特殊空格
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .trim();
  }

  /**
   * 检查是否包含日期关键字
   * 注意：需要区分日期单位和普通单位
   * 例如："2024-01-01 + 7 days" 是日期，但 "100 km/hr" 不是
   */
  private containsDateKeywords(expr: string): boolean {
    // 如果包含日期格式（YYYY-MM-DD 或引号内的日期），则可能是日期表达式
    if (/\d{4}-\d{2}-\d{2}|["']到["']|["‘’]至["']/.test(expr)) {
      return true;
    }

    // 中文相对日期
    const chineseDateKeywords = ['今天', '明天', '昨天', '后天', '前天', '大后天', '大前天', 'today', '到', '至'];
    if (chineseDateKeywords.some(keyword => expr.includes(keyword))) {
      return true;
    }

    // 对于 days/months/years/hours/minutes/weeks，需要更严格的判断
    // 只有当它们作为独立单词出现时才认为是日期计算
    // 例如："7 days" 是日期，但 "km/hr" 不是
    const dateUnitPattern = /\b(\d+)\s*(days?|months?|years?|hours?|minutes?|weeks?)\b/i;
    const hasDateUnit = dateUnitPattern.test(expr);
    
    // 如果有日期单位，但同时也有其他物理单位，则不认为是日期表达式
    // 例如："100 km/hr" 有 "hr" 但也有 "km"，不是日期
    if (hasDateUnit) {
      const hasOtherUnits = /\b(km|mi|ft|in|meter|mile|inch|kg|pound|tonne)\b/i.test(expr);
      return !hasOtherUnits;
    }

    // 中文单位：天、月、年、小时、分钟、周
    const chineseUnitPattern = /\d+\s*[天月年小时分钟周]/;
    if (chineseUnitPattern.test(expr)) {
      // 检查是否有其他物理单位
      const hasOtherUnits = /\b(km|mi|ft|in|meter|mile|inch|kg|pound|tonne)\b/i.test(expr);
      return !hasOtherUnits;
    }

    return false;
  }

  /**
   * 检查结果是否有效
   */
  private isValidResult(result: any): boolean {
    // 过滤函数对象
    if (typeof result === 'function') {
      return false;
    }

    // 允许数字和字符串
    if (typeof result === 'number' || typeof result === 'string') {
      return true;
    }

    // 允许 Math.js 的 Unit 对象（单位计算结果）
    if (typeof result === 'object' && result !== null) {
      // 检查是否是 Math.js Unit 对象（有 toString 方法且有单位信息）
      if (typeof result.toString === 'function') {
        const str = result.toString();
        // Unit 对象的 toString() 会返回带单位的字符串
        return str.length > 0;
      }
      // 其他对象类型过滤
      return false;
    }

    return true;
  }

  /**
   * 格式化数字结果
   */
  private formatNumber(num: number): number {
    // 如果接近整数，返回整数
    if (Math.abs(num - Math.round(num)) < 0.0000001) {
      return Math.round(num);
    }
    // 否则保留 6 位小数
    return parseFloat(num.toFixed(6));
  }
}
