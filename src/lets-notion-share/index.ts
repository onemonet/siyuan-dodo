import { showMessage } from "siyuan";
import { SubPlugin } from "@/types/plugin";
import {
  NOTION_SHARE_ALREADY_SHARED_MESSAGE,
  NOTION_SHARE_FORCE_MENU_LABEL,
  NOTION_SHARE_MENU_LABEL,
  NOTION_UNPUBLISH_CONFIRM_MESSAGE,
  NOTION_UNPUBLISH_MENU_LABEL,
} from "./constants";
import { renderSharedBadgeForProtyle } from "./status-badge";
import {
  shareDocumentToNotion,
  unpublishDocumentFromNotion,
} from "./share-service";

const CONFIRM_RESHARE_MESSAGE =
  "当前笔记已经分享到 Notion，是否按差异增量同步？未修改的图片和音视频将跳过上传。";
const MISSING_DOC_ID_MESSAGE = "无法获取当前文档 ID";

function getDocId(detail: any): string {
  return detail?.protyle?.block?.id || "";
}

async function executeShare(docId: string, forceReshare: boolean, forceFull = false): Promise<void> {
  const shareResult = await shareDocumentToNotion(docId, forceReshare, forceFull);
  if (shareResult.error === NOTION_SHARE_ALREADY_SHARED_MESSAGE && shareResult.data) {
    const shouldReshare = window.confirm(
      `${CONFIRM_RESHARE_MESSAGE}\n\n已分享链接：${shareResult.data}`
    );
    if (!shouldReshare) {
      showMessage(shareResult.data, 4000, "info");
      return;
    }

    const retryResult = await shareDocumentToNotion(docId, true);
    if (retryResult.error) {
      showMessage(retryResult.error, 5000, "error");
      return;
    }

    if (retryResult.data) {
      showMessage(retryResult.data, 4000, "info");
    }
    return;
  }

  if (shareResult.error) {
    showMessage(shareResult.error, 5000, "error");
    return;
  }

  if (shareResult.data) {
    showMessage(shareResult.data, 4000, "info");
  }
}

async function executeUnpublish(docId: string): Promise<void> {
  const shouldUnpublish = window.confirm(NOTION_UNPUBLISH_CONFIRM_MESSAGE);
  if (!shouldUnpublish) {
    return;
  }

  const result = await unpublishDocumentFromNotion(docId);
  if (result.error) {
    showMessage(result.error, 5000, "error");
    return;
  }

  if (result.data) {
    showMessage(result.data, 4000, "info");
  }
}

export default class NotionSharePlugin implements SubPlugin {
  onload(): void {}

  onunload(): void {}

  onProtyleLoaded(event: CustomEvent<{ protyle?: { element?: HTMLElement } }>): void {
    const protyleElement = event.detail?.protyle?.element;
    if (protyleElement) {
      void renderSharedBadgeForProtyle(protyleElement);
    }
  }

  public editortitleiconEvent({ detail }: any): void {
    const docId = getDocId(detail);

    detail.menu.addItem({
      iconHTML: "",
      label: NOTION_SHARE_MENU_LABEL,
      click: async () => {
        if (!docId) {
          showMessage(MISSING_DOC_ID_MESSAGE, 3000, "error");
          return;
        }
        await executeShare(docId, false);
        const protyleElement = detail?.protyle?.element as HTMLElement | undefined;
        if (protyleElement) {
          await renderSharedBadgeForProtyle(protyleElement);
        }
      },
    });

    detail.menu.addItem({
      iconHTML: "",
      label: NOTION_SHARE_FORCE_MENU_LABEL,
      click: async () => {
        if (!docId) {
          showMessage(MISSING_DOC_ID_MESSAGE, 3000, "error");
          return;
        }
        await executeShare(docId, true);
        const protyleElement = detail?.protyle?.element as HTMLElement | undefined;
        if (protyleElement) {
          await renderSharedBadgeForProtyle(protyleElement);
        }
      },
    });

    detail.menu.addItem({
      iconHTML: "",
      label: "强制全量重建 Notion 页面",
      click: async () => {
        if (!docId) { showMessage(MISSING_DOC_ID_MESSAGE, 3000, "error"); return; }
        if (!window.confirm("确定全量重建当前 Notion 页面正文吗？\n\n这会更新原有页面的所有正文块，但仍会尽量复用未修改附件的上传记录。")) return;
        await executeShare(docId, true, true);
        const element = detail?.protyle?.element as HTMLElement | undefined;
        if (element) await renderSharedBadgeForProtyle(element);
      },
    });
    detail.menu.addItem({
      iconHTML: "",
      label: NOTION_UNPUBLISH_MENU_LABEL,
      click: async () => {
        if (!docId) {
          showMessage(MISSING_DOC_ID_MESSAGE, 3000, "error");
          return;
        }
        await executeUnpublish(docId);
        const protyleElement = detail?.protyle?.element as HTMLElement | undefined;
        if (protyleElement) {
          await renderSharedBadgeForProtyle(protyleElement);
        }
      },
    });
  }
}
