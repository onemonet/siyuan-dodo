import { FLOMO_MEMO_ATTR } from "../../config/constants";
import { createLogger } from "../../logger";
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

export interface MemoBlockWriteResult {
  blockId: string;
  memo: ProcessedMemo;
  status: "inserted";
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
