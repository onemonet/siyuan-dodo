/**
 * 引述块类型定义
 */
export interface BlockquoteRule {
  /** 类型标识 */
  type: string;
  /** 类名 */
  className: string;
  /** 匹配正则表达式 */
  regex: RegExp;
  /** 优先级（数字越小优先级越高） */
  priority?: number;
}

/**
 * 引述块处理器接口
 */
export interface BlockquoteHandler {
  /** 处理器类型 */
  readonly type: string;
  
  /** 
   * 初始化处理器
   */
  initialize?(): void;
  
  /**
   * 处理引述块元素
   * @param element 引述块DOM元素
   */
  process(element: HTMLElement): void;
  
  /**
   * 清理引述块元素
   * @param element 引述块DOM元素
   */
  cleanup?(element: HTMLElement): void;
  
  /**
   * 销毁处理器
   */
  destroy?(): void;
}
