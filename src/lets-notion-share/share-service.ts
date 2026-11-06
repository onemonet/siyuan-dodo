import { settings } from "@/settings";
import {
  NOTION_SETTING_DATABASE_ID_KEY,
  NOTION_SETTING_TOKEN_KEY,
  NOTION_SHARE_ALREADY_SHARED_MESSAGE,
  NOTION_SHARE_EMPTY_CONTENT_MESSAGE,
  NOTION_SHARE_FAILED_MESSAGE,
  NOTION_SHARE_MISSING_DATABASE_MESSAGE,
  NOTION_SHARE_MISSING_TOKEN_MESSAGE,
  NOTION_SHARE_PLUGIN_NAME,
  NOTION_SHARE_SUCCESS_MESSAGE,
  NOTION_UNPUBLISH_SUCCESS_MESSAGE,
} from "./constants";
import {
  clearShareUrlFromDocument,
  loadShareDocumentPayload,
  saveShareUrlToDocument,
  saveNotionSyncState,
} from "./document-service";
import { exportDocumentMarkdownZip } from "./markdown-zip";
import { getNotionPageStatus, pageIdFromUrl, publishMarkdownZip } from "./notion-markdown-client";
import { parseManifest } from "./incremental-plan";
import { archiveNotionPage } from "./notion-client";
import { ShareResult } from "./types";

export async function shareDocumentToNotion(
  docId: string,
  forceReshare: boolean,
  forceFull = false
): Promise<ShareResult<string>> {
  try {
    const token = settings.getBySpace(NOTION_SHARE_PLUGIN_NAME, NOTION_SETTING_TOKEN_KEY);
    const databaseId = settings.getBySpace(
      NOTION_SHARE_PLUGIN_NAME,
      NOTION_SETTING_DATABASE_ID_KEY
    );

    if (!token) {
      return {
        data: null,
        error: NOTION_SHARE_MISSING_TOKEN_MESSAGE,
      };
    }

    if (!databaseId) {
      return {
        data: null,
        error: NOTION_SHARE_MISSING_DATABASE_MESSAGE,
      };
    }

    const payloadResult = await loadShareDocumentPayload(docId);
    if (payloadResult.error || !payloadResult.data) {
      return {
        data: null,
        error: payloadResult.error || NOTION_SHARE_FAILED_MESSAGE,
      };
    }

    const payload = payloadResult.data;

    if (payload.existingShareUrl && !forceReshare) {
      return {
        data: payload.existingShareUrl,
        error: NOTION_SHARE_ALREADY_SHARED_MESSAGE,
      };
    }

    let allowOverwrite = false;
    if (payload.existingShareUrl) {
      // 旧版同步未记录基线、Notion 内容改动后或重试部分失败页面：必须人工批准覆盖。
      const current = await getNotionPageStatus(token, payload.existingShareUrl);
      if (!payload.notionEditedTime || payload.notionEditedTime !== current.lastEdited) {
        allowOverwrite = window.confirm(
          `Notion 页面「${payload.title}」可能存在独立修改或来自旧版分享。\n\n` +
          "继续同步可能覆盖 Notion 上的手动修改；普通重新分享优先执行增量更新，必要时会再次提示全量重建。\n\n确定覆盖吗？",
        );
        if (!allowOverwrite) {
          return { data: null, error: "已取消同步：目标 Notion 页面需要人工确认覆盖。" };
        }
      }
    }

    const zip = await exportDocumentMarkdownZip(docId);
    if (!zip.markdown.trim()) {
      return { data: null, error: NOTION_SHARE_EMPTY_CONTENT_MESSAGE };
    }
    const previousManifest = parseManifest(payload.notionManifest, pageIdFromUrl(payload.existingShareUrl));
    const publishOptions = {
      token, databaseId, title: payload.title || "未命名文档", exportZip: zip,
      existingPageUrl: payload.existingShareUrl,
      expectedEditedTime: payload.notionEditedTime,
      allowOverwrite,
      previousManifest,
      onCreated: async (url: string) => {
        const saved = await saveShareUrlToDocument(docId, url);
        if (saved.error) throw new Error(`Notion 已创建页面但无法保存回链：${saved.error}`);
      },
    };
    let published;
    try {
      published = await publishMarkdownZip({ ...publishOptions, forceFull });
    } catch (error) {
      const message = String(error);
      if (!forceFull && message.includes("NEEDS_FULL_SYNC:")) {
        const reason = message.split("NEEDS_FULL_SYNC:")[1] || "当前变更无法安全进行增量同步";
        if (!window.confirm(`${reason}\n\n是否确认对当前 Notion 页面执行一次完整重建？\n未修改的图片、视频、音频将优先复用已有上传记录。`)) {
          return { data: null, error: "已取消：无法安全增量同步，未进行全量重建。" };
        }
        published = await publishMarkdownZip({ ...publishOptions, forceFull: true });
      } else {
        throw error;
      }
    }
    const serialized = JSON.stringify(published.manifest);
    if (serialized.length > 245_000) throw new Error("增量索引超出大小限制，已停止保存同步记录。请拆分笔记以支持后续增量更新。");
    await saveNotionSyncState(docId, published.url, published.lastEdited, serialized);    return {
      data: `${NOTION_SHARE_SUCCESS_MESSAGE}（${published.mode === "skipped" ? "内容未变，跳过" : published.mode === "incremental" ? "增量同步" : "全量初始化"}；新增上传 ${published.uploaded}，复用 ${published.reused}）：${published.url}`,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `shareDocumentToNotion: docId=${docId}; forceReshare=${String(
        forceReshare
      )}; error=${String(error)}`,
    };
  }
}

export async function unpublishDocumentFromNotion(
  docId: string
): Promise<ShareResult<string>> {
  try {
    const token = settings.getBySpace(
      NOTION_SHARE_PLUGIN_NAME,
      NOTION_SETTING_TOKEN_KEY
    );
    if (!token) {
      return {
        data: null,
        error: NOTION_SHARE_MISSING_TOKEN_MESSAGE,
      };
    }

    const payloadResult = await loadShareDocumentPayload(docId);
    if (payloadResult.error || !payloadResult.data) {
      return {
        data: null,
        error: payloadResult.error || NOTION_SHARE_FAILED_MESSAGE,
      };
    }

    const pageUrl = payloadResult.data.existingShareUrl;
    if (!pageUrl) {
      return {
        data: null,
        error: `${NOTION_SHARE_FAILED_MESSAGE}：当前文档尚未发布到 Notion`,
      };
    }

    const archiveResult = await archiveNotionPage({
      token,
      pageUrl,
    });
    if (archiveResult.error) {
      return {
        data: null,
        error: archiveResult.error,
      };
    }

    const clearResult = await clearShareUrlFromDocument(docId);
    if (clearResult.error) {
      return {
        data: null,
        error: clearResult.error,
      };
    }

    return {
      data: NOTION_UNPUBLISH_SUCCESS_MESSAGE,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `unpublishDocumentFromNotion: docId=${docId}; error=${String(error)}`,
    };
  }
}
