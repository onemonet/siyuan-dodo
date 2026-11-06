import type { ChartAggregation } from "./types";

/** Stable pseudo-column: count rows of the current native database view. */
export const CHART_RECORD_COUNT = "__dodo_record_count__";

export type ChartYKind = "record-count" | "numeric" | "checkbox" | "count";

export function chartYKind(column: string, fieldType: string): ChartYKind {
  if (column === CHART_RECORD_COUNT) return "record-count";
  if (fieldType === "checkbox") return "checkbox";
  // Legacy Markdown sources have no fieldTypes; preserve their numeric-series controls.
  if (!fieldType || fieldType === "number" || fieldType === "lineNumber") return "numeric";
  return "count";
}

export function defaultChartAggregation(kind: ChartYKind): ChartAggregation {
  return kind === "record-count" || kind === "count" ? "count"
    : kind === "checkbox" ? "checked" : "value";
}

/** Fixed aggregations must not offer an irrelevant second menu. */
export function chartAggregationIsFixed(kind: ChartYKind): boolean {
  return kind !== "numeric";
}

export function effectiveChartAggregation(column: string, fieldType: string, saved?: ChartAggregation): ChartAggregation {
  const kind = chartYKind(column, fieldType);
  return chartAggregationIsFixed(kind) ? defaultChartAggregation(kind) : (saved || "value");
}

export const CHART_FIELD_LABELS: Record<string, string> = {
  block: "标题", number: "数字", lineNumber: "行号", text: "文本",
  select: "单选", mSelect: "多选", date: "日期", checkbox: "复选框",
  relation: "关联", rollup: "汇总", mAsset: "附件", url: "网址",
  email: "邮箱", phone: "电话", location: "位置", template: "模板",
  created: "创建时间", updated: "更新时间",
};

export function chartFieldTypeLabel(type: string): string {
  return CHART_FIELD_LABELS[type] || (type ? "其他" : "表格列");
}
