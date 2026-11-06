import moment from "moment";
import type { FlomoConfig, FlomoMemo } from "../types";

export interface FlomoUpdatedMemosApi {
  getUpdatedMemos(
    latestUpdatedAt: number,
    latestSlug?: string,
    limit?: string,
  ): Promise<FlomoMemo[]>;
}

export interface FetchPendingMemosOptions {
  api: FlomoUpdatedMemosApi;
  config: FlomoConfig;
  limit?: string;
}

function parseTags(value: string): string[] {
  return value
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function resolveSyncStartDate(lastSyncTime: string): Date {
  const parsed = moment(lastSyncTime, "YYYY-MM-DD HH:mm:ss", true);
  if (parsed.isValid()) {
    return parsed.toDate();
  }

  return moment().startOf("day").toDate();
}

export function isPendingMemo(memo: FlomoMemo, config: FlomoConfig): boolean {
  if (memo.deleted_at) {
    return false;
  }

  const memoTags = memo.tags || [];
  const syncSuccessTag = config.syncSuccessTag.trim();
  if (syncSuccessTag && memoTags.includes(syncSuccessTag)) {
    return false;
  }

  if (config.syncTagMode === "1") {
    const includeTags = parseTags(config.syncIncludeTags);
    return includeTags.some((tag) => memoTags.includes(tag));
  }

  const excludeTags = parseTags(config.syncExcludeTags);
  return excludeTags.every((tag) => !memoTags.includes(tag));
}

export function filterPendingMemos(
  memos: FlomoMemo[],
  config: FlomoConfig,
): FlomoMemo[] {
  return memos.filter((memo) => isPendingMemo(memo, config));
}

export async function fetchPendingMemos({
  api,
  config,
  limit = "200",
}: FetchPendingMemosOptions): Promise<FlomoMemo[]> {
  const pendingMemos: FlomoMemo[] = [];
  let latestUpdated = resolveSyncStartDate(config.lastSyncTime);
  let latestSlug = "";

  while (true) {
    const latestUpdatedAt = Math.floor(latestUpdated.getTime() / 1000);
    const records = await api.getUpdatedMemos(latestUpdatedAt, latestSlug, limit);

    if (!records || !Array.isArray(records) || records.length === 0) {
      break;
    }

    pendingMemos.push(...filterPendingMemos(records, config));

    const lastRecord = records[records.length - 1];
    latestUpdated = moment(
      lastRecord.updated_at,
      "YYYY-MM-DD HH:mm:ss",
    ).toDate();
    latestSlug = lastRecord.slug;

    if (records.length < Number(limit)) {
      break;
    }
  }

  return pendingMemos;
}
