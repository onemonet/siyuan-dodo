/**
 * SiYuan AV -> legacy string-table presentation edge.
 * Canonical typed cells, native calendar dates and record IDs are owned by
 * av-normalized.ts. Map, chart and timeline can keep using the same table
 * interface while sharing typed semantics with calendar/gantt/custom SDK.
 */
import { normalizeAvRender, formatAvWallTime } from "./av-normalized";

export interface AvRenderColumn {
  id?: string;
  name?: string;
  type?: string;
  icon?: string;
}

export interface AvRenderRow {
  id?: string;
  cells?: Array<{ value?: AvCellValue }>;
}

export interface AvRenderViewGroup {
  rows?: AvRenderRow[];
}

export interface AvRenderData {
  /** Top-level name is the database name; view.name is only the selected view's name. */
  name?: string;
  view?: {
    id?: string;
    name?: string;
    columns?: AvRenderColumn[];
    rows?: AvRenderRow[];
    groups?: AvRenderViewGroup[];
    rowCount?: number;
    /** Native per-view '条目数' setting, independent from request size. */
    pageSize?: number;
  };
  viewID?: string;
  viewType?: string;
  views?: Array<{ id?: string; name?: string; type?: string }>;
  isMirror?: boolean;
}

export interface AvCellValue {
  id?: string;
  keyID?: string;
  blockID?: string;
  isDetached?: boolean;
  type?: string;
  createdAt?: number;
  updatedAt?: number;
  block?: { id?: string; content?: string };
  text?: { content?: string };
  number?: { content?: number; isNotEmpty?: boolean; format?: string; formattedContent?: string };
  date?: {
    content?: number;
    content2?: number;
    isNotEmpty?: boolean;
    isNotEmpty2?: boolean;
    hasEndDate?: boolean;
    isNotTime?: boolean;
    formattedContent?: string;
  };
  select?: { content?: string; color?: string } | null;
  mSelect?: Array<{ content?: string; color?: string }> | null;
  url?: { content?: string } | null;
  email?: { content?: string } | null;
  phone?: { content?: string } | null;
  location?: { name?: string; latitude?: number | null; longitude?: number | null; originalInput?: string } | null;
  mAsset?: Array<{ type?: string; name?: string; content?: string }> | null;
  checkbox?: { checked?: boolean } | null;
  template?: { content?: string };
  created?: { content?: string | number; formattedContent?: string };
  updated?: { content?: string | number; formattedContent?: string };
  relation?: { blockIDs?: string[]; contents?: AvCellValue[] } | null;
  rollup?: { contents?: AvCellValue[] } | null;
  lineNumber?: { content?: number } | null;
}

export interface AvAdaptedTable {
  headers: string[];
  rows: string[][];
  /** 每列对应的 av 字段类型（末尾虚拟结束列沿用其源 date 字段类型） */
  fieldTypes: string[];
  /** 数据库真实 keyID，与每个实际列下标严格对应。 */
  columnIds: string[];
  /** 原始字段名称，不做表头去重，供旧绑定歧义检测。 */
  columnNames: string[];
  /** 每行数据库条目 ID（itemID），不等于实际绑定文档 ID。 */
  rowBlockIds: string[];
  /** 每行实际绑定文档块的 ID（value.block.id），未绑定时为空。 */
  rowBoundBlockIds: string[];
  /** 每行主键单元格的 value ID，供打开独立数据库条目详情页。 */
  rowValueIds: string[];
  /** 数值字段（number / lineNumber）的列下标，供图表免正则探测 */
  numericColumns: number[];
  /** 全部单元格 updatedAt 的最大值（毫秒），无数据时为 0 */
  maxUpdatedAt: number;
}

/** 结束日期虚拟列的命名后缀（映射下拉框中可见、可手动指定） */
export const AV_DATE_END_SUFFIX = "·结束";

/** 从块 DOM 中解析数据库块的 avID；非数据库块返回 null */
export function parseAvIdFromDom(dom: string): string | null {
  const match = (dom || "").match(/data-av-id="([^"]+)"/);
  return match?.[1] || null;
}

/** renderAttributeView 响应 → 统一表格数据 */
export function adaptAttributeViewRender(data: AvRenderData): AvAdaptedTable {
  const view = data?.view;
  const columns = (view?.columns || []).filter((column) => column?.id);
  if (columns.length === 0) {
    return { headers: [], rows: [], fieldTypes: [], columnIds: [], columnNames: [], rowBlockIds: [], rowBoundBlockIds: [], rowValueIds: [], numericColumns: [], maxUpdatedAt: 0 };
  }

  const normalized = normalizeAvRender(data);
  const rows = normalized.records;

  const usedHeaders = new Set<string>();
  const headers = buildUniqueHeaders(columns, usedHeaders);
  const fieldTypes = columns.map((column) => column.type || "text");
  const columnIds = columns.map(column => column.id || "");
  const columnNames = columns.map(column => (column.name || "").trim() || "未命名字段");
  const numericColumns: number[] = [];
  columns.forEach((column, index) => {
    if (column.type === "number" || column.type === "lineNumber") {
      numericColumns.push(index);
    }
  });

  // date 字段只要有一行带结束值，就在表尾追加虚拟结束列。
  // 命名优先「结束时间」——与时间线结束时间别名一致，时间段事件零配置；
  // 与既有字段重名时退回「<源字段名>·结束」，由用户在字段映射中手动指定。
  const dateEndColumns = columns.map(
    column => column.type === "date" && rows.some(
      row => !!row.cells[column.id!]?.date?.endDisplay)
  );
  dateEndColumns.forEach((hasEnd, index) => {
    if (!hasEnd) {
      return;
    }
    const name = usedHeaders.has("结束时间") ? `${headers[index]}${AV_DATE_END_SUFFIX}` : "结束时间";
    usedHeaders.add(name);
    headers.push(name);
    fieldTypes.push(fieldTypes[index]);
    columnIds.push(`${columnIds[index]}:end`);
    columnNames.push(name);
  });

  const rowBlockIds: string[] = [];
  const rowBoundBlockIds: string[] = [];
  const rowValueIds: string[] = [];
  const outputRows = rows.map(row => {
    rowBlockIds.push(row.itemId);
    rowBoundBlockIds.push(row.blockId);
    rowValueIds.push(row.valueId);
    const values = columns.map(column => row.cells[column.id!]?.tableDisplay || "");
    dateEndColumns.forEach((hasEnd,index) => {
      if (hasEnd) values.push(row.cells[columns[index].id!]?.date?.endDisplay || "");
    });
    return values;
  });

  return {
    headers,
    rows: outputRows,
    fieldTypes,
    columnIds,
    columnNames,
    rowBlockIds,
    rowBoundBlockIds,
    rowValueIds,
    numericColumns,
    maxUpdatedAt: normalized.maxUpdatedAt,
  };
}

/** 对适配结果计算稳定哈希，供变更检测短路 */
export function hashAvTable(table: AvAdaptedTable): string {
  const text = JSON.stringify({ h: table.headers, r: table.rows });
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function buildUniqueHeaders(columns: AvRenderColumn[], used: Set<string>): string[] {
  return columns.map((column) => {
    const name = (column.name || "").trim() || "未命名字段";
    let candidate = name;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${name}·${suffix++}`;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * Compatibility export for consumers of the old adapter. The single source of
 * date formatting is the typed AV model; never format calendar dates as UTC.
 */
export function formatAvDate(epochMs: number, includeTime: boolean): string {
  return formatAvWallTime(epochMs, includeTime);
}
