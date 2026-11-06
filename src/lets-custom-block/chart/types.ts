export type SupportedChartType =
  | "line-basic"
  | "line-smooth"
  | "line-stack"
  | "area-basic"
  | "area-stack"
  | "bar-basic"
  | "hbar-basic"
  | "pie-basic"
  | "scatter-basic"
  | "funnel-basic"
  | "radar-basic";

export interface ChartTypeConfig {
  id: SupportedChartType;
  label: string;
  icon: string;
  echartsType: "bar" | "line" | "pie" | "scatter" | "radar";
  description: string;
  tableStructure: string;
  requireMultipleSeries: boolean;
  minColumns: number;
  minRows: number;
}

export interface TableData {
  headers: string[];
  columnIds?: string[];
  columnNames?: string[];
  fieldTypes?: string[];
  rows: string[][];
  hasHeader: boolean;
  numericColumns: number[];
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface EChartsSeriesItem {
  name?: string;
  type: string;
  data: any[];
  areaStyle?: Record<string, any>;
  markLine?: Record<string, any>;
}

export interface EChartsOptionLike {
  color?: string[];
  title?: Record<string, any>;
  tooltip?: Record<string, any>;
  grid?: Record<string, any>;
  legend?: {
    data?: string[];
  };
  xAxis?: Record<string, any>;
  yAxis?: Record<string, any>;
  radar?: {
    indicator: Array<{ name: string; max?: number }>;
  };
  series: EChartsSeriesItem[];
}

// ---- 图表块设置（custom-dodo-chart-config JSON），见 docs/plans/2026-09-05-chart-custom-block-assessment.md ----

export type ChartSortMode = "none" | "value-desc" | "value-asc" | "name";
export type ChartAggregation = "value" | "sum" | "avg" | "min" | "max" | "median" | "distinct" | "count" | "checked";

export interface ChartMarkLine {
  value: number;
  label?: string;
}

export interface ChartBlockConfig {
  /** Native database chart preview height in pixels. */
  height?: number;
  /** 图表类型（原独立属性 custom-dodo-chart-type 已并入此处） */
  type?: SupportedChartType;
  /** 来源类型：Markdown 表格块或数据库块；缺省视为 table（兼容历史块） */
  sourceType?: "table" | "database";
  /** database 来源的属性视图 ID（绑定时从块 DOM data-av-id 解析一次） */
  sourceAvID?: string;
  /** database 来源的指定视图；空 = 跟随数据库块当前视图 */
  sourceViewID?: string;
  x?: {
    /** 数据库使用 keyID，Markdown 表格使用表头名；默认第一列 */
    column?: string;
    sort?: ChartSortMode;
    ignoreZero?: boolean;
  };
  y?: {
    /** 明确的 Y 轴数据列；数据库使用稳定的 keyID，旧配置缺省时继续自动选列 */
    column?: string;
    /** Additional numeric Y series in order. The original column remains the primary series. */
    columns?: string[];
    /** 字段统计：count=非空记录数，checked=已勾选数；特殊的记录数量虚拟列统计所有行 */
    agg?: ChartAggregation;
    /** 单列模式的额外分组：null=不分组；多数字 Y 列时忽略，数字字段本身已构成系列 */
    groupBy?: string | null;
    /** 值轴范围：null=自动；min/max 留空表示该侧自动 */
    range?: { min?: number | null; max?: number | null } | null;
    /** 参考线 */
    markLines?: ChartMarkLine[];
  };
  style?: {
    /** 调色板："auto" 不写入 color，其余为 PALETTE_CONFIGS 的键 */
    palette?: string;
    /** Whether values appear above vertical bars / beside horizontal bars. Defaults to true. */
    showBarValues?: boolean;
  };
}

export function isEmptyChartConfig(config?: ChartBlockConfig): boolean {
  if (!config) {
    return true;
  }
  return !(
    config.height ||
    config.x?.column ||
    (config.x?.sort && config.x.sort !== "none") ||
    config.x?.ignoreZero ||
    config.y?.column ||
    (config.y?.columns?.length || 0) > 0 ||
    (config.y?.agg && config.y.agg !== "sum") ||
    config.y?.groupBy ||
    config.y?.range ||
    (config.y?.markLines && config.y.markLines.length > 0) ||
    (config.style?.palette && config.style.palette !== "auto") ||
    config.style?.showBarValues === false
  );
}
