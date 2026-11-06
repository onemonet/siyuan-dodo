export const LINK_ICON_MISSING_DOC_ICON_CODE = "#iconDodoDeletedDoc";
export const LINK_ICON_DOC_REF_STATUS_ATTRIBUTE = "data-dodo-doc-ref-status";
export const LINK_ICON_DOC_REF_STATUS_AVAILABLE = "available";
export const LINK_ICON_DOC_REF_STATUS_MISSING = "missing";
const SIYUAN_BLOCK_ID_REGEX = /^[0-9]{14}-[a-z0-9]{7}$/;
const UNICODE_CODE_POINT_MIN = 0;
const UNICODE_CODE_POINT_MAX = 0x10ffff;

export type DocRefStatus =
  | typeof LINK_ICON_DOC_REF_STATUS_AVAILABLE
  | typeof LINK_ICON_DOC_REF_STATUS_MISSING;

export interface DocIconInfo {
  type: "svg" | "image" | "unicode";
  code: string;
  refStatus?: DocRefStatus;
}

export interface DocBlockRecord {
  type: string;
  root_id: string;
}

export interface DocInfoResponse {
  code?: number;
  data?: {
    icon?: string;
    subFileCount?: number;
  };
}

export interface ResolveDocIconInfoDeps {
  queryBlock(blockId: string): Promise<DocBlockRecord | null>;
  queryDocInfo(docId: string): Promise<DocInfoResponse>;
}

export function createMissingDocIconInfo(): DocIconInfo {
  return {
    type: "svg",
    code: LINK_ICON_MISSING_DOC_ICON_CODE,
    refStatus: LINK_ICON_DOC_REF_STATUS_MISSING,
  };
}

export function getDocIconRefStatus(icon: DocIconInfo): DocRefStatus {
  return icon.refStatus ?? LINK_ICON_DOC_REF_STATUS_AVAILABLE;
}

export function isValidSiyuanBlockId(blockId: string): boolean {
  return SIYUAN_BLOCK_ID_REGEX.test(blockId);
}

export async function resolveDocIconInfo(
  blockId: string,
  deps: ResolveDocIconInfoDeps,
): Promise<DocIconInfo | null> {
  if (!isValidSiyuanBlockId(blockId)) {
    return null;
  }

  const block = await deps.queryBlock(blockId);
  if (!block) {
    return createMissingDocIconInfo();
  }

  const docId = block.type === "d" ? blockId : block.root_id;
  const response = await deps.queryDocInfo(docId);
  if (response.code !== 0 || !response.data) {
    return null;
  }

  const iconCode = response.data.icon ?? "";
  const subFileCount = response.data.subFileCount ?? 0;

  if (!iconCode) {
    return { type: "svg", code: subFileCount > 0 ? "#iconFolder" : "#iconFile" };
  }

  if (iconCode.toLowerCase().endsWith(".svg") || /\.(png|jpg|jpeg|gif|webp)$/i.test(iconCode)) {
    return { type: iconCode.toLowerCase().endsWith(".svg") ? "svg" : "image", code: iconCode };
  }

  if (!/^[0-9a-f]+$/i.test(iconCode)) {
    return { type: "svg", code: subFileCount > 0 ? "#iconFolder" : "#iconFile" };
  }

  const codePoint = parseInt(iconCode, 16);
  if (
    Number.isNaN(codePoint) ||
    codePoint < UNICODE_CODE_POINT_MIN ||
    codePoint > UNICODE_CODE_POINT_MAX
  ) {
    return { type: "svg", code: subFileCount > 0 ? "#iconFolder" : "#iconFile" };
  }

  return { type: "unicode", code: String.fromCodePoint(codePoint) };
}
