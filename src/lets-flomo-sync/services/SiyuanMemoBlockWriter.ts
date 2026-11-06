import {
  FLOMO_MEMO_ATTR,
  FLOMO_MEMO_SLUG_ATTR,
} from "../../config/constants";
import { createLogger } from "../../logger";
import { sqlString } from "../../security-utils";
import type { ProcessedMemo } from "../types";
import { formatSiyuanTimestamp } from "../utils/time";
import {
  buildSiyuanServiceError,
  getSiyuanResponseReason,
  getUnknownErrorReason,
  SIYUAN_API_ENDPOINTS,
  type SiyuanAPIResponse,
  type SiyuanPost,
  type SiyuanWarningLogger,
} from "./siyuanApi";

const logger = createLogger("SiyuanMemoBlockWriter");

export interface SiyuanMemoBlockWriterDeps {
  post: SiyuanPost;
  warn?: SiyuanWarningLogger;
}

function extractInsertedBlockId(response: SiyuanAPIResponse): string {
  const operations = response.data as
    | Array<{ doOperations?: Array<{ id?: unknown }> }>
    | undefined;
  return String(operations?.[0]?.doOperations?.[0]?.id || "");
}

function getMemoSlug(memo: ProcessedMemo): string {
  return memo.originalMemo?.slug?.trim() || "";
}

function toSQLRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

export interface MemoBlockWriteResult {
  blockId: string;
  memo: ProcessedMemo;
  status: "inserted" | "skipped";
}

export class SiyuanMemoBlockWriter {
  private readonly post: SiyuanPost;
  private readonly warn: SiyuanWarningLogger;

  constructor(deps: SiyuanMemoBlockWriterDeps) {
    this.post = deps.post;
    this.warn = deps.warn ?? logger.warn;
  }

  async insertMemoBlock(
    parentId: string,
    memo: ProcessedMemo,
    usePrepend: boolean,
  ): Promise<MemoBlockWriteResult> {
    const endpoint = usePrepend
      ? SIYUAN_API_ENDPOINTS.prependBlock
      : SIYUAN_API_ENDPOINTS.appendBlock;

    try {
      const existingBlockId = await this.findExistingMemoBlockId(memo);
      if (existingBlockId) {
        return {
          blockId: existingBlockId,
          memo,
          status: "skipped",
        };
      }

      const response = await this.post(endpoint, {
        data: memo.content,
        dataType: "markdown",
        parentID: parentId,
      });

      if (response.code !== 0) {
        throw buildSiyuanServiceError(
          "SiyuanMemoBlockWriter.insertMemoBlock",
          { endpoint, parentId, memoTime: memo.time },
          getSiyuanResponseReason(response),
        );
      }

      const blockId = extractInsertedBlockId(response);
      if (!blockId) {
        throw buildSiyuanServiceError(
          "SiyuanMemoBlockWriter.insertMemoBlock",
          { endpoint, parentId, memoTime: memo.time },
          "inserted block id missing",
        );
      }

      await this.setMemoBlockAttrs(blockId, memo, endpoint, parentId);
      return {
        blockId,
        memo,
        status: "inserted",
      };
    } catch (error) {
      this.warn("SiyuanMemoBlockWriter.insertMemoBlock: failed", {
        endpoint,
        parentId,
        memoTime: memo.time,
        reason: getUnknownErrorReason(error),
      });
      throw error;
    }
  }

  private async findExistingMemoBlockId(memo: ProcessedMemo): Promise<string> {
    const memoSlug = getMemoSlug(memo);
    if (!memoSlug) {
      return "";
    }

    const response = await this.post(SIYUAN_API_ENDPOINTS.querySQL, {
      stmt: `SELECT block_id FROM attributes WHERE name = ${sqlString(FLOMO_MEMO_SLUG_ATTR)} AND value = ${sqlString(memoSlug)} LIMIT 1`,
    });

    if (response.code !== 0) {
      throw buildSiyuanServiceError(
        "SiyuanMemoBlockWriter.findExistingMemoBlockId",
        { memoSlug },
        getSiyuanResponseReason(response),
      );
    }

    const rows = toSQLRows(response.data);
    return String(rows[0]?.block_id || "");
  }

  private async setMemoBlockAttrs(
    blockId: string,
    memo: ProcessedMemo,
    endpoint: string,
    parentId: string,
  ): Promise<void> {
    const attrs: Record<string, string> = {};

    if (memo.updatedAt) {
      attrs[FLOMO_MEMO_ATTR] = formatSiyuanTimestamp(memo.updatedAt);
    }

    const memoSlug = getMemoSlug(memo);
    if (memoSlug) {
      attrs[FLOMO_MEMO_SLUG_ATTR] = memoSlug;
    }

    if (Object.keys(attrs).length === 0) {
      return;
    }

    const response = await this.post(SIYUAN_API_ENDPOINTS.setBlockAttrs, {
      id: blockId,
      attrs,
    });

    if (response.code !== 0) {
      throw buildSiyuanServiceError(
        "SiyuanMemoBlockWriter.setMemoBlockAttrs",
        {
          blockId,
          endpoint,
          parentId,
          attrNames: Object.keys(attrs).join(","),
        },
        getSiyuanResponseReason(response),
      );
    }
  }
}
