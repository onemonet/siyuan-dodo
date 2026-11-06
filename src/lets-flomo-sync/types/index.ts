/**
 * Flomo 同步插件类型定义
 */

export interface FlomoConfig {
  username: string;
  password: string;
  accessToken: string;
  accountAuthStatus: "unknown" | "success" | "error";
  accountAuthMessage: string;
  accountAuthCheckedAt: string;
  lastSyncTime: string;
  syncSuccessTag: string;
  locationMode: "0" | "1"; // 0: DailyNote, 1: 指定文档
  dailnoteNotebook: string;
  pageId: string;
  syncTagMode: "0" | "1"; // 0: 排除标签, 1: 包含标签
  syncIncludeTags: string;
  syncExcludeTags: string;
  contentTemplate: string;
  timeFormat: string; // 时间格式化字符串
  showMemoDate: boolean;
  memosSort: "asc" | "desc";
  debugMode: boolean;
  enableQuickNote: boolean;
  enableSilentSync: boolean;
  showManualSyncMenu: boolean;
}

export interface FlomoMemo {
  slug: string;
  content: string;
  tags: string[];
  files: FlomoFile[];
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface FlomoFile {
  id: string;
  name: string;
  url: string;
}

export interface ProcessedMemo {
  content: string;
  time: string;
  updatedDate: string;
  updatedAt: number;
  originalMemo?: FlomoMemo;
}

export interface SyncResult {
  success: boolean;
  memoCount: number;
  error?: string;
}

export interface FlomoAPIResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

export interface FlomoLoginData {
  access_token: string;
  user?: unknown;
}

export interface HeatmapDay {
  dayKey: string;
  count: number;
}

export interface MonthStat {
  month: string;
  count: number;
}

export interface TimeStat {
  hour: number;
  count: number;
}

/**
 * 通用异步返回结构，error 为 string 或 null
 */
export interface AsyncResult<T> {
  data: T;
  error: string | null;
}

/**
 * 仪表盘布局类型
 */
export type DashboardLayout = "list" | "card" | "masonry";

/**
 * 从 blocks 表查询后清洗出的 memo 展示 DTO
 */
export interface MemoItem {
  /** 块 ID */
  id: string;
  /** 所属文档 root_id */
  rootId: string;
  /** 原始 markdown */
  markdown: string;
  /** 纯文本内容（用于摘要） */
  content: string;
  /** 解析后的标签名数组（不含 #） */
  tags: string[];
  /** memo 时间戳原始值（YYYYMMDDHHmmss） */
  memoTimestamp: string;
  /** memo 时间格式化后的展示文本 */
  memoTimeLabel: string;
  /** 块创建时间 YYYYMMDDHHmmss */
  created: string;
  /** 块更新时间 YYYYMMDDHHmmss */
  updated: string;
  /** 文档层级路径 */
  hpath: string;
}
