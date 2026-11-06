import { TimelineFieldMapping } from "../types";
import { resolveFieldBinding, SIYUAN_KEY_ID } from "../../../shared/av/field-binding";

export interface TimelineFieldDefinition {
  key: keyof TimelineFieldMapping;
  /** 设置面板展示名 */
  label: string;
  /** Hover explanation for the small info button beside this field name. */
  description?: string;
  /** 归一化后全等匹配的表头别名单；刻意保持精简，特殊表头走字段映射手动指定 */
  aliases: string[];
  /** 自动识别失败时按列序兜底；null 表示只能命中别名或手动映射（无位置兜底） */
  fallbackIndex: number | null;
  /** AV database column types allowed for this mapping; no restriction for Markdown tables. */
  acceptedTypes: readonly string[];
  /** A TimelineJS event requires a headline and a starting date. */
  required?: boolean;
}

export const TIMELINE_FIELD_DEFINITIONS: TimelineFieldDefinition[] = [
  { key: "title", label: "标题", description: "事件名称，显示在时间线中。", aliases: ["title", "标题", "事件", "名称"], fallbackIndex: 0, acceptedTypes: ["block", "text"], required: true },
  { key: "startDate", label: "开始时间", description: "事件开始日期，决定时间轴位置。", aliases: ["startdate", "date", "开始日期", "开始时间", "日期"], fallbackIndex: 1, acceptedTypes: ["date"], required: true },
  { key: "endDate", label: "结束时间", description: "事件结束日期；同列时读取日期范围终点。", aliases: ["enddate", "end", "结束日期", "结束时间"], fallbackIndex: 2, acceptedTypes: ["date"] },
  // Display date changes only the rendered label, never the event date/position.
  // Restrict native AV mapping to a text column; start/end stay date-only.
  { key: "displayDate", label: "显示日期", description: "自定义显示文字，不改变实际日期。", aliases: ["displaydate", "显示日期"], fallbackIndex: null, acceptedTypes: ["text"] },
  { key: "description", label: "说明", description: "显示在事件标题下的正文。", aliases: ["description", "desc", "text", "说明", "描述", "内容"], fallbackIndex: 3, acceptedTypes: ["text"] },
  { key: "group", label: "分组", description: "相同分组的事件归到一组。", aliases: ["group", "分组"], fallbackIndex: null, acceptedTypes: ["select", "mSelect", "text"] },
  { key: "media", label: "媒体", description: "事件图片或视频，可用附件或链接。", aliases: ["media", "媒体"], fallbackIndex: null, acceptedTypes: ["mAsset", "url", "text"] },
  { key: "mediaCaption", label: "媒体说明", description: "显示在媒体下方的说明文字。", aliases: ["mediacaption", "媒体说明", "媒体标题"], fallbackIndex: null, acceptedTypes: ["text"] },
  { key: "backgroundColor", label: "背景颜色", description: "事件背景色，例如 #334455。", aliases: ["backgroundcolor", "背景颜色", "背景色"], fallbackIndex: null, acceptedTypes: ["text"] },
  { key: "backgroundImage", label: "背景图片", description: "事件背景图片，可用附件或链接。", aliases: ["backgroundimage", "背景图片"], fallbackIndex: null, acceptedTypes: ["mAsset", "url", "text"] },
];

/** 归一化表头：去空白与常见分隔符后小写，供别名单全等比较 */
export function normalizeTimelineHeader(value?: string): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:/]/g, "");
}

export type ResolvedTimelineColumns = Record<keyof TimelineFieldMapping, number | null>;

/**
 * 解析各字段的列索引：手动映射（精确表头）优先，其次别名单，最后列序兜底。
 * 来源表格无表头行时只按列序兜底。
 */
export function resolveTimelineColumns(
  headers: string[],
  mapping: TimelineFieldMapping | undefined,
  columnCount: number,
  columnIds?: string[],
  columnNames?: string[],
  fieldTypes?: string[],
): ResolvedTimelineColumns {
  const resolved = {} as ResolvedTimelineColumns;
  for (const definition of TIMELINE_FIELD_DEFINITIONS) {
    resolved[definition.key] = resolveColumnIndex(headers, mapping, definition, columnCount, columnIds, columnNames, fieldTypes);
  }
  return resolved;
}

function resolveColumnIndex(
  headers: string[],
  mapping: TimelineFieldMapping | undefined,
  definition: TimelineFieldDefinition,
  columnCount: number,
  columnIds?: string[],
  columnNames?: string[],
  fieldTypes?: string[],
): number | null {
  const configured = mapping?.[definition.key];
  // Database rendering NEVER automatically guesses a column. The one-time
  // initializer stores keyIDs first; later reads only accept those IDs.
  if (fieldTypes?.length) {
    if (!configured || !SIYUAN_KEY_ID.test(configured)) return null;
    const index = columnIds?.indexOf(configured) ?? -1;
    return index >= 0 && definition.acceptedTypes.includes(fieldTypes[index]) ? index : null;
  }
  const allowed = (_index: number) => true;
  // An explicitly unset column is a permanent binding decision, not an
  // instruction to repeat automatic matching after a schema change.
  if (mapping && Object.prototype.hasOwnProperty.call(mapping, definition.key) && !configured) return null;
  if (configured) {
    const selection = resolveFieldBinding({ headers, columnIds, columnNames, fieldTypes }, configured,
      fieldTypes?.length ? definition.acceptedTypes : undefined);
    return selection.status === "resolved" ? selection.index : null;
  }

  if (headers.length > 0) {
    const aliasSet = new Set(definition.aliases.map(normalizeTimelineHeader));
    const names = columnNames?.length ? columnNames : headers;
    const matches = names.map((name, index) => allowed(index) && aliasSet.has(normalizeTimelineHeader(name)) ? index : -1).filter(index => index >= 0);
    if (matches.length > 1) return null;
    if (matches.length === 1) return matches[0];
  }

  if (
    definition.fallbackIndex !== null &&
    definition.fallbackIndex < columnCount &&
    (headers.length === 0 || definition.fallbackIndex < headers.length) &&
    allowed(definition.fallbackIndex)
  ) {
    return definition.fallbackIndex;
  }

  // In native databases the key title/date fields may appear in any order.
  // Prefer a real typed field rather than an incompatible positional fallback.
  if (fieldTypes?.length && definition.required) {
    const preferred = definition.key === "title" ? ["block", "text"] : ["date"];
    const index = preferred.map(type => fieldTypes.indexOf(type)).find(i => i >= 0);
    if (index !== undefined) return index;
  }
  return null;
}

/** One-shot native AV initialization. Only required fields select a keyID;
 * optional fields persist "not used". Existing manual/legacy values survive,
 * and an old missing/invalid keyID is never rebound automatically. */
export function materializeTimelineFieldMapping(
  table: { headers: string[]; columnIds: string[]; columnNames: string[]; fieldTypes: string[] },
  previous: TimelineFieldMapping = {},
): { mapping: TimelineFieldMapping; changed: boolean } {
  const mapping: TimelineFieldMapping = { ...previous };
  let changed = false;
  for (const field of TIMELINE_FIELD_DEFINITIONS) {
    if (Object.prototype.hasOwnProperty.call(mapping, field.key)) {
      const old = mapping[field.key];
      if (!old) continue;
      const resolved = resolveFieldBinding(table, old, field.acceptedTypes);
      if (resolved.status === "resolved" && resolved.migrated && resolved.id) {
        mapping[field.key] = resolved.id;
        changed = true;
      }
      continue;
    }
    // Only a required field is auto-bound when a view is created.
    // Optional fields must remain explicitly unused until selected by the user.
    if (!field.required) {
      mapping[field.key] = "";
      changed = true;
      continue;
    }
    // Prefer the native primary key for title, otherwise the first compatible
    // column (startDate is date-only). Persist the exact keyID.
    const preferred = field.key === "title"
      ? table.fieldTypes.indexOf("block") : -1;
    const index = preferred >= 0 ? preferred
      : table.fieldTypes.findIndex((type, i) => Boolean(table.columnIds[i]) && field.acceptedTypes.includes(type));
    mapping[field.key] = index >= 0 ? table.columnIds[index] || "" : "";
    changed = true;
  }
  return { mapping, changed };
}
