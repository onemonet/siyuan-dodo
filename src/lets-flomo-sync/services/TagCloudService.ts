import {
  FLOMO_QUERY_ERROR_PREFIX,
  FLOMO_TAG_MATCH_REGEX,
} from "../../config/constants";
import type { AsyncResult } from "../types";
import { buildTagListSQL, type MemoFilter } from "../utils/sql";
import type { TagCloudItem } from "../utils/tagCloud";

const CONSTANTS = {
  queryTagItems: "queryTagItems",
  fieldTag: "tag",
} as const;

type SQLRow = Record<string, unknown>;

export interface TagCloudServiceDeps {
  querySQL: (statement: string) => Promise<SQLRow[]>;
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

function buildServiceError(functionName: string, context: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `${FLOMO_QUERY_ERROR_PREFIX}.${functionName}(${context}): ${reason}`;
}

function extractTagNames(tagText: string): string[] {
  const tagNames: string[] = [];

  for (const match of tagText.matchAll(FLOMO_TAG_MATCH_REGEX)) {
    const tagName = toSafeString(match[1]).trim();
    if (tagName) {
      tagNames.push(tagName);
    }
  }

  return tagNames;
}

function sortTagItems(a: TagCloudItem, b: TagCloudItem): number {
  if (b.count !== a.count) {
    return b.count - a.count;
  }

  return a.name.localeCompare(b.name, "zh-CN");
}

function toTagCloudItems(rows: SQLRow[]): TagCloudItem[] {
  const tagCounter = new Map<string, number>();

  rows.forEach((row) => {
    const tagText = toSafeString(row[CONSTANTS.fieldTag]);
    extractTagNames(tagText).forEach((tagName) => {
      tagCounter.set(tagName, (tagCounter.get(tagName) || 0) + 1);
    });
  });

  return Array.from(tagCounter.entries())
    .map(([name, count]) => ({ name, count }))
    .sort(sortTagItems);
}

export class TagCloudService {
  private readonly querySQL: TagCloudServiceDeps["querySQL"];

  constructor(deps: TagCloudServiceDeps) {
    this.querySQL = deps.querySQL;
  }

  async queryTagItems(filter: MemoFilter): Promise<AsyncResult<TagCloudItem[]>> {
    try {
      const statement = buildTagListSQL(filter);
      const rows = await this.querySQL(statement);
      return { data: toTagCloudItems(rows), error: null };
    } catch (error) {
      const errorMessage = buildServiceError(
        CONSTANTS.queryTagItems,
        `limit=${filter.limit}, tagMode=${filter.tagMode}`,
        error,
      );
      return { data: [], error: errorMessage };
    }
  }
}
