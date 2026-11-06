import { resolveFieldBinding } from "../../shared/av/field-binding";
import type { FieldTable } from "../../shared/av/field-binding";
import type { ChartBlockConfig } from "./types";

/** Only bind a new database chart's missing axes once. Existing keyIDs, even
 * deleted ones, are NEVER silently replaced by fields of the same name. */
export function materializeChartFieldBindings(
  table: FieldTable,
  previous: ChartBlockConfig,
): { config: ChartBlockConfig; changed: boolean } {
  const config: ChartBlockConfig = { ...previous };
  const columns = (table.columnIds || []).map((id, index) => ({ id, type: table.fieldTypes?.[index] || "" }));
  if (!columns.some(column => column.id)) return { config, changed: false };
  let changed = false;
  let y = config.y?.column || "";
  if (!Object.prototype.hasOwnProperty.call(config.y || {}, "column")) {
    const metric = columns.find(column => column.type === "number") || columns.find(column => column.type === "mSelect");
    config.y = { ...config.y, column: metric?.id || "",
      ...(metric ? { agg: metric.type === "mSelect" ? "count" as const : "value" as const } : {}) };
    y = metric?.id || "";
    changed = true;
  } else if (y) {
    const resolved = resolveFieldBinding(table, y);
    if (resolved.status === "resolved" && resolved.migrated) {
      config.y = { ...config.y, column: resolved.id };
      y = resolved.id;
      changed = true;
    }
  }
  const x = config.x?.column;
  if (!Object.prototype.hasOwnProperty.call(config.x || {}, "column")) {
    const preferred = columns.find(column => column.id !== y && ["block", "select", "mSelect", "text"].includes(column.type))
      || columns.find(column => column.id !== y);
    config.x = { ...config.x, column: preferred?.id || "" };
    changed = true;
  } else if (x) {
    const resolved = resolveFieldBinding(table, x);
    if (resolved.status === "resolved" && resolved.migrated) {
      config.x = { ...config.x, column: resolved.id };
      changed = true;
    }
  }
  const group = config.y?.groupBy;
  if (group && group !== "__none__") {
    const resolved = resolveFieldBinding(table, group);
    if (resolved.status === "resolved" && resolved.migrated) {
      config.y = { ...config.y, groupBy: resolved.id };
      changed = true;
    }
  }
  return { config, changed };
}
