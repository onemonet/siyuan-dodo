import { FLOMO_QUERY_ERROR_PREFIX } from "../../config/constants";
import type { AsyncResult } from "../types";
import { sanitizeReadonlyMemoDOMContent } from "../utils/memoDom";

const CONSTANTS = {
  loadBlockDOM: "loadBlockDOM",
  emptyBlockIdMessage: "blockId 不能为空",
} as const;

export interface BlockDOMServiceDeps {
  getBlockDOM: (id: BlockId) => Promise<IResGetBlockDOM | null>;
}

export interface BlockDOMQueryParams {
  blockId: string;
}

function buildServiceError(
  functionName: string,
  paramSummary: string,
  error: unknown,
): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `${FLOMO_QUERY_ERROR_PREFIX}.${functionName}(${paramSummary}): ${errorMessage}`;
}

function normalizeDOM(dom: unknown): string {
  if (typeof dom === "string") {
    return dom.trim();
  }

  if (dom === undefined || dom === null) {
    return "";
  }

  return String(dom).trim();
}

export class BlockDOMService {
  private readonly getBlockDOM: BlockDOMServiceDeps["getBlockDOM"];

  constructor(deps: BlockDOMServiceDeps) {
    this.getBlockDOM = deps.getBlockDOM;
  }

  async loadBlockDOM(
    params: BlockDOMQueryParams,
  ): Promise<AsyncResult<string>> {
    const blockId = params.blockId.trim();

    if (!blockId) {
      return {
        data: "",
        error: `${FLOMO_QUERY_ERROR_PREFIX}.${CONSTANTS.loadBlockDOM}(blockId): ${CONSTANTS.emptyBlockIdMessage}`,
      };
    }

    try {
      const response = await this.getBlockDOM(blockId);
      const data = sanitizeReadonlyMemoDOMContent(normalizeDOM(response?.dom));
      return { data, error: null };
    } catch (error) {
      const errorMessage = buildServiceError(
        CONSTANTS.loadBlockDOM,
        `blockId=${blockId}`,
        error,
      );
      return { data: "", error: errorMessage };
    }
  }
}
