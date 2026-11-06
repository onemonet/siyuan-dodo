/**
 * 计算器接口
 * 所有计算器实现必须遵循此接口
 */
export interface ICalculator {
  /**
   * 判断是否可以处理该表达式
   * @param expression 待计算的表达式
   * @returns true 表示可以处理，false 表示不能处理
   */
  canHandle(expression: string): boolean;

  /**
   * 计算表达式
   * @param expression 待计算的表达式
   * @returns 计算结果字符串，如果计算失败或结果无效返回空字符串
   */
  calculate(expression: string): string;
}

/**
 * 计算结果类型
 */
export interface CalculationResult {
  /** 是否成功 */
  success: boolean;
  /** 结果值（字符串形式） */
  value: string;
  /** 错误信息（如果有） */
  error?: string;
}
