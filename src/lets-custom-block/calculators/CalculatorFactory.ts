import { ICalculator } from "./ICalculator";
import { MathCalculator } from "./MathCalculator";
import { DateCalculator } from "../utils/DateCalculator";

/**
 * 计算器工厂类
 * 使用责任链模式，按优先级尝试不同的计算器
 */
export class CalculatorFactory {
  private static calculators: ICalculator[] = [];

  /**
   * 初始化计算器列表
   * 按优先级排序：DateCalculator > MathCalculator
   */
  static initialize(): void {
    if (this.calculators.length === 0) {
      this.calculators = [
        new DateCalculator(),  // 日期计算器优先（更具体）
        new MathCalculator(),  // 数学计算器（通用）
      ];
    }
  }

  /**
   * 计算表达式
   * 自动选择合适的计算器
   * @param expression 待计算的表达式
   * @returns 计算结果，失败返回空字符串
   */
  static calculate(expression: string): string {
    // 确保已初始化
    this.initialize();

    // 空表达式返回空
    if (!expression || !expression.trim()) {
      return '';
    }

    // 按优先级尝试每个计算器
    for (const calculator of this.calculators) {
      if (calculator.canHandle(expression)) {
        const result = calculator.calculate(expression);
        // 如果计算成功（返回非空），直接返回
        if (result) {
          return result;
        }
      }
    }

    // 所有计算器都无法处理，返回空
    return '';
  }

  /**
   * 重置工厂（主要用于测试）
   */
  static reset(): void {
    this.calculators = [];
  }
}
