import {
  FLOMO_MEMO_ATTR,
  FLOMO_QUERY_ERROR_PREFIX,
  FLOMO_TAG_MATCH_REGEX,
} from "../../config/constants";
import { sqlString } from "../../security-utils";
import type { AsyncResult, MemoItem } from "../types";
import { formatConfiguredMemoDisplayTime } from "../utils/time";

const CONSTANTS = {
  queryMemos: "queryMemos",
  queryMemoTimestamps: "queryMemoTimestamps",
  fieldId: "id",
  fieldMarkdown: "markdown",
  fieldRootId: "root_id",
  fieldContent: "content",
  fieldTag: "tag",
  fieldCreated: "created",
  fieldUpdated: "updated",
  fieldHPath: "hpath",
  fieldBlockId: "block_id",
  fieldValue: "value",
} as const;

type SQLRow = Record<string, unknown>;

export interface MemoQueryServiceDeps {
  querySQL: (statement: string) => Promise<SQLRow[]>;
  formatMemoTime?: (timeValue: unknown, format: string) => string;
}

export interface MemoQueryParams {
  statement: string;
  timeFormat: string;
}

function toSafeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

function buildServiceError(functionName: string, paramSummary: string, error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `${FLOMO_QUERY_ERROR_PREFIX}.${functionName}(${paramSummary}): ${errorMessage}`;
}

function parseMemoTags(tagText: string): string[] {
  const tagSet = new Set<string>();

  for (const match of tagText.matchAll(FLOMO_TAG_MATCH_REGEX)) {
    const tagName = toSafeString(match[1]).trim();
    if (tagName) {
      tagSet.add(tagName);
    }
  }

  return Array.from(tagSet);
}

function hasMemoFields(row: SQLRow): boolean {
  const hasId = CONSTANTS.fieldId in row;
  const hasMarkdown = CONSTANTS.fieldMarkdown in row;
  return hasId && hasMarkdown;
}

function extractMemoTimestamp(row: SQLRow): string {
  const memoTimestampField = "memo_timestamp";
  if (memoTimestampField in row) {
    return toSafeString(row[memoTimestampField]).trim();
  }
  return "";
}

export class MemoQueryService {
  private readonly querySQL: MemoQueryServiceDeps["querySQL"];
  private readonly formatMemoTime: (timeValue: unknown, format: string) => string;

  constructor(deps: MemoQueryServiceDeps) {
    this.querySQL = deps.querySQL;
    this.formatMemoTime = deps.formatMemoTime ?? formatConfiguredMemoDisplayTime;
  }

  async queryMemos(params: MemoQueryParams): Promise<AsyncResult<MemoItem[]>> {
    try {
      const rows = await this.querySQL(params.statement);
      if (!Array.isArray(rows) || rows.length === 0) {
        return { data: [], error: null };
      }

      if (!hasMemoFields(rows[0])) {
        const error = `${FLOMO_QUERY_ERROR_PREFIX}.${CONSTANTS.queryMemos}(fields): SQL 结果缺少 id 或 markdown 字段`;
        return { data: [], error };
      }

      const hasMemoTimestampField = "memo_timestamp" in rows[0];
      let timestampMap = new Map<string, string>();

      if (!hasMemoTimestampField) {
        const blockIds = rows
          .map((row) => toSafeString(row[CONSTANTS.fieldId]))
          .filter((blockId) => blockId.length > 0);
        const timestampResult = await this.queryMemoTimestamps(blockIds);

        if (timestampResult.error) {
          return { data: [], error: timestampResult.error };
        }

        timestampMap = timestampResult.data;
      }

      const data = rows
        .map((row) => this.toMemoItem(row, timestampMap, params.timeFormat, hasMemoTimestampField))
        .filter((item) => item.id.length > 0);

      return { data, error: null };
    } catch (error) {
      const errorMessage = buildServiceError(
        CONSTANTS.queryMemos,
        `statementLength=${params.statement.length}`,
        error,
      );
      return { data: [], error: errorMessage };
    }
  }

  private async queryMemoTimestamps(blockIds: string[]): Promise<AsyncResult<Map<string, string>>> {
    try {
      if (!blockIds.length) {
        return { data: new Map<string, string>(), error: null };
      }

      const quotedIds = blockIds.map((blockId) => sqlString(blockId)).join(", ");
      const statement = `SELECT block_id, value FROM attributes WHERE name = ${sqlString(FLOMO_MEMO_ATTR)} AND block_id IN (${quotedIds})`;
      const rows = await this.querySQL(statement);
      const data = new Map<string, string>();

      rows.forEach((row) => {
        const blockId = toSafeString(row[CONSTANTS.fieldBlockId]).trim();
        const value = toSafeString(row[CONSTANTS.fieldValue]).trim();
        if (blockId && value && !data.has(blockId)) {
          data.set(blockId, value);
        }
      });

      return { data, error: null };
    } catch (error) {
      const errorMessage = buildServiceError(
        CONSTANTS.queryMemoTimestamps,
        `blockCount=${blockIds.length}`,
        error,
      );
      return { data: new Map<string, string>(), error: errorMessage };
    }
  }

  private toMemoItem(
    row: SQLRow,
    timestampMap: Map<string, string>,
    timeFormat: string,
    hasMemoTimestampField: boolean = false,
  ): MemoItem {
    const id = toSafeString(row[CONSTANTS.fieldId]);
    const updated = toSafeString(row[CONSTANTS.fieldUpdated]);
    const memoTimestamp = hasMemoTimestampField
      ? extractMemoTimestamp(row)
      : timestampMap.get(id)?.trim() || "";
    const memoTimeLabel = memoTimestamp
      ? this.formatMemoTime(memoTimestamp, timeFormat)
      : "";

    return {
      id,
      rootId: toSafeString(row[CONSTANTS.fieldRootId]),
      markdown: toSafeString(row[CONSTANTS.fieldMarkdown]),
      content: toSafeString(row[CONSTANTS.fieldContent]),
      tags: parseMemoTags(toSafeString(row[CONSTANTS.fieldTag])),
      memoTimestamp,
      memoTimeLabel,
      created: toSafeString(row[CONSTANTS.fieldCreated]),
      updated,
      hpath: toSafeString(row[CONSTANTS.fieldHPath]),
    };
  }
}
