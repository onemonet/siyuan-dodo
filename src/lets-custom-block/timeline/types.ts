export type TimelineSourceType = "table" | "database";

export type TimelineStartPosition = "first" | "last" | string;

export interface TimelineFieldMapping {
  title?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  group?: string;
  displayDate?: string;
  media?: string;
  mediaCaption?: string;
  backgroundColor?: string;
  backgroundImage?: string;
}

export interface TimelineBlockConfig {
  sourceType: TimelineSourceType;
  sourceBlockId: string;
  /** database 来源的属性视图 ID（绑定时从块 DOM data-av-id 解析一次） */
  sourceAvID?: string;
  /** database 来源的指定视图；空 = 跟随数据库块当前视图 */
  sourceViewID?: string;
  /** Runtime native search; never a persistent filter setting. */
  sourceQuery?: string;
  title?: string;
  height?: number;
  timenavHeightPercent?: number;
  startPosition?: TimelineStartPosition;
  fieldMapping?: TimelineFieldMapping;
}

export interface TimelineTableData {
  /** Name of the underlying SiYuan database, not its currently selected view. */
  sourceName?: string;
  headers: string[];
  columnIds?: string[];
  columnNames?: string[];
  fieldTypes?: string[];
  rows: string[][];
  /** AV item ID (row.id), not necessarily an existing document block. */
  rowBlockIds?: string[];
  /** Bound document block IDs; empty for detached AV entries. */
  rowBoundBlockIds?: string[];
  /** Primary block-cell value IDs, required for native detached-entry tabs. */
  rowValueIds?: string[];
  hasHeader: boolean;
}

export interface TimelineDateParts {
  year: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export interface TimelineTextContent {
  headline?: string;
  text?: string;
}

/** TimelineJS3 事件媒体；thumbnail 供本构建的 marker 缩略图，thumb 为标准 schema 字段名 */
export interface TimelineMedia {
  url: string;
  thumbnail?: string;
  thumb?: string;
  caption?: string;
}

export interface TimelineEventBackground {
  color?: string;
  url?: string;
}

/** Native SiYuan AV record navigation, shared with the database map view. */
export interface TimelineRecordTarget {
  blockId: string;
  itemId: string;
  valueId: string;
  avID: string;
  databaseBlockID: string;
  title: string;
}

export interface TimelineEventData {
  /** Not part of TimelineJS schema; used only by Dodo's iframe title-click bridge. */
  record?: TimelineRecordTarget;
  start_date: TimelineDateParts;
  end_date?: TimelineDateParts;
  display_date?: string;
  text: TimelineTextContent;
  unique_id?: string;
  group?: string;
  media?: TimelineMedia;
  background?: TimelineEventBackground;
}

export interface TimelineRenderableData {
  title?: {
    text?: {
      headline?: string;
      text?: string;
    };
  };
  events: TimelineEventData[];
}
