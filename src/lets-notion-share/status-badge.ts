import { getBlockAttrs } from "@/api";
import { DODO_SHARE_ATTR } from "@/config/constants";
import {
  NOTION_SHARED_BADGE_CLASS,
  NOTION_SHARED_BADGE_DOT_CLASS,
  NOTION_SHARED_BADGE_TITLE,
} from "./constants";
import { ShareResult } from "./types";

const TITLE_SELECTOR = ".protyle-title";
const TITLE_INPUT_SELECTOR = ".protyle-title__input";
const BADGE_CONTAINER_TAG = "div";
const BADGE_DOT_TAG = "span";
const ATTR_CONTAINER_SELECTOR = ".protyle-attr";
const WINDOW_OPEN_TARGET = "_blank";
const EMPTY_TEXT = "";

function getDocIdFromProtyleElement(protyleElement: HTMLElement): string {
  const titleElement = protyleElement.querySelector(TITLE_SELECTOR) as HTMLElement | null;
  return titleElement?.dataset?.nodeId || EMPTY_TEXT;
}

function getTitleMountElement(protyleElement: HTMLElement): HTMLElement | null {
  return protyleElement.querySelector(TITLE_INPUT_SELECTOR) as HTMLElement | null;
}

function removeExistingBadge(containerElement: HTMLElement): void {
  const existingBadge = containerElement.querySelector(
    `.${NOTION_SHARED_BADGE_CLASS}`
  ) as HTMLElement | null;
  if (existingBadge) {
    existingBadge.remove();
  }
}

async function loadShareUrl(docId: string): Promise<ShareResult<string>> {
  try {
    const attrs = await getBlockAttrs(docId);
    return {
      data: attrs?.[DODO_SHARE_ATTR] || EMPTY_TEXT,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: `loadShareUrl: docId=${docId}; error=${String(error)}`,
    };
  }
}

function createBadgeElement(shareUrl: string): HTMLElement {
  const badgeElement = document.createElement(BADGE_CONTAINER_TAG);
  const dotElement = document.createElement(BADGE_DOT_TAG);

  badgeElement.className = `${NOTION_SHARED_BADGE_CLASS} protyle-attr--refcount popover__block`;
  badgeElement.title = NOTION_SHARED_BADGE_TITLE;
  badgeElement.setAttribute("data-href", shareUrl);
  badgeElement.setAttribute(
    "style",
    [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "cursor:pointer",
      "width:18px",
      "height:18px",
      "padding:0",
      "margin-right:20px",
      "vertical-align:middle",
    ].join(";")
  );

  dotElement.className = NOTION_SHARED_BADGE_DOT_CLASS;
  dotElement.setAttribute(
    "style",
    [
      "width:8px",
      "height:8px",
      "border-radius:50%",
      "background:#2fb344",
      "box-shadow:0 0 0 2px rgba(47,179,68,.18)",
      "flex-shrink:0",
    ].join(";")
  );

  badgeElement.appendChild(dotElement);
  badgeElement.addEventListener("click", () => {
    window.open(shareUrl, WINDOW_OPEN_TARGET);
  });

  return badgeElement;
}

export async function renderSharedBadgeForProtyle(
  protyleElement: HTMLElement
): Promise<void> {
  const docId = getDocIdFromProtyleElement(protyleElement);
  const mountElement = getTitleMountElement(protyleElement);
  const attrContainer = protyleElement.querySelector(ATTR_CONTAINER_SELECTOR) as
    | HTMLElement
    | null;

  if (!docId || !mountElement || !mountElement.parentElement || !attrContainer) {
    return;
  }

  removeExistingBadge(attrContainer);

  const shareUrlResult = await loadShareUrl(docId);
  if (shareUrlResult.error || !shareUrlResult.data) {
    return;
  }

  const badgeElement = createBadgeElement(shareUrlResult.data);
  attrContainer.insertBefore(badgeElement, attrContainer.firstChild);
}
