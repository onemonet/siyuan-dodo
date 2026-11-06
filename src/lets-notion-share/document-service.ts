import { getBlockAttrs, setBlockAttrs, sql } from "@/api";
import { DODO_SHARE_ATTR } from "@/config/constants";
import { ShareDocumentPayload, ShareResult } from "./types";

const SQL_ESCAPE_REGEX = /'/g;
const SQL_ESCAPE_VALUE = "''";
const EMPTY_TEXT = "";
const NOTION_SYNC_EDIT_ATTR = "custom-dodo-notion-synced-edit";
const NOTION_MANIFEST_ATTR = "custom-dodo-notion-sync-v2";

function escapeSqlValue(value: string): string {
  return value.replace(SQL_ESCAPE_REGEX, SQL_ESCAPE_VALUE);
}

function normalizeText(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : EMPTY_TEXT;
}

export async function loadShareDocumentPayload(
  docId: string
): Promise<ShareResult<ShareDocumentPayload>> {
  try {
    const safeDocId = escapeSqlValue(docId);
    const rows = await sql(`SELECT id, content FROM blocks WHERE id = '${safeDocId}'`);
    const documentRow = rows?.[0];
    if (!documentRow?.id) {
      return {
        data: null,
        error: `loadShareDocumentPayload: 文档不存在 docId=${docId}`,
      };
    }

    const attrs = await getBlockAttrs(docId);
    const markdown = ""; // 分享正文改由 /api/export/exportMd 生成的原生 ZIP 提供。
    const title = normalizeText(documentRow.content);
    const existingShareUrl = normalizeText(attrs?.[DODO_SHARE_ATTR]);
    const notionEditedTime = normalizeText(attrs?.[NOTION_SYNC_EDIT_ATTR]);
    const notionManifest = normalizeText(attrs?.[NOTION_MANIFEST_ATTR]);

    return {
      data: {
        docId,
        title,
        markdown,
        existingShareUrl,
        notionEditedTime,
        notionManifest,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `loadShareDocumentPayload: docId=${docId}; error=${String(error)}`,
    };
  }
}

export async function saveNotionSyncState(docId: string, url: string, editedTime: string, manifest: string): Promise<void> {
  await setBlockAttrs(docId, { [DODO_SHARE_ATTR]: url, [NOTION_SYNC_EDIT_ATTR]: editedTime, [NOTION_MANIFEST_ATTR]: manifest });
}
export async function saveShareUrlToDocument(
  docId: string,
  shareUrl: string
): Promise<ShareResult<null>> {
  try {
    await setBlockAttrs(docId, {
      [DODO_SHARE_ATTR]: shareUrl,
    });
    return {
      data: null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `saveShareUrlToDocument: docId=${docId}; shareUrl=${shareUrl}; error=${String(error)}`,
    };
  }
}

export async function clearShareUrlFromDocument(
  docId: string
): Promise<ShareResult<null>> {
  try {
    await setBlockAttrs(docId, {
      [DODO_SHARE_ATTR]: "",
      [NOTION_SYNC_EDIT_ATTR]: "",
      [NOTION_MANIFEST_ATTR]: "",
    });
    return {
      data: null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `clearShareUrlFromDocument: docId=${docId}; error=${String(error)}`,
    };
  }
}
