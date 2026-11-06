import { FLOMO_QUERY_ERROR_PREFIX } from "../../config/constants";

export const SIYUAN_API_ENDPOINTS = {
  getNotebookConf: "/api/notebook/getNotebookConf",
  renderSprig: "/api/template/renderSprig",
  getIDsByHPath: "/api/filetree/getIDsByHPath",
  createDocWithMd: "/api/filetree/createDocWithMd",
  createDailyNote: "/api/filetree/createDailyNote",
  setBlockAttrs: "/api/attr/setBlockAttrs",
  prependBlock: "/api/block/prependBlock",
  appendBlock: "/api/block/appendBlock",
  querySQL: "/api/query/sql",
} as const;

export interface SiyuanAPIResponse {
  code: number;
  msg?: string;
  data?: unknown;
}

export type SiyuanPost = (
  endpoint: string,
  payload?: Record<string, unknown>,
) => Promise<SiyuanAPIResponse>;

export type SiyuanWarningLogger = (
  message: string,
  context?: Record<string, unknown>,
) => void;

export function getUnknownErrorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getSiyuanResponseReason(response: SiyuanAPIResponse): string {
  return response.msg || `code=${response.code}`;
}

export function extractSiyuanPageId(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id: unknown }).id || "");
  }

  return "";
}

export function buildSiyuanServiceError(
  functionName: string,
  context: Record<string, unknown>,
  reason: string,
): Error {
  return new Error(
    `${FLOMO_QUERY_ERROR_PREFIX}.${functionName}: ${reason}; context=${JSON.stringify(context)}`,
  );
}
