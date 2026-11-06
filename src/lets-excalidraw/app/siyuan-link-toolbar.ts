import { CaptureUpdateAction } from "@excalidraw/excalidraw";

const LINK = /^siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})$/i;
const ID = /^\d{14}-[a-z0-9]{7}$/i;
let openPopover: HTMLElement | null = null;
let dispose: (() => void) | null = null;

export const closeSiyuanLinkPopover = () => {
  dispose?.();
  dispose = null;
  openPopover?.remove();
  openPopover = null;
};

/** Generalize the existing link editor only for previously blank Web-Embeds. */
const isEmptyWebEmbed = (el: any) =>
  el?.type === "embeddable" && !String(el.link || "").trim() &&
  !el.customData?.embedMarkdown;

const normalizeEmbedLink = (raw: string, allowBlank: boolean): string | null => {
  const link = raw.trim();
  const candidate = ID.test(link) ? "siyuan://blocks/" + link : link;
  if (LINK.test(candidate)) return candidate;
  if (!allowBlank) return null;
  const url = /^[\\w-]+\\.[\\w.-]+(?:[/:?#]|$)/.test(candidate) ? "https://" + candidate : candidate;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return null;
    return url;
  } catch { return null; }
};

/** One Excalidraw-undoable scene update; do not store duplicate block content. */
export const updateSiyuanBlockLink = (
  elementId: string, raw: string, allowBlank = false
): boolean => {
  const normalized = normalizeEmbedLink(raw, allowBlank);
  if (!normalized) return false;
  const api = window.excalidrawAPI;
  if (!api) return false;
  const scene = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements();
  if (!scene.some((el: any) => el.id === elementId &&
      el.type === "embeddable" &&
      (LINK.test(el.link || "") || (allowBlank && isEmptyWebEmbed(el))))) return false;
  const next = scene.map((el: any) => el.id !== elementId ? el : {
    ...el, link: normalized, version: (el.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 0x7fffffff), updated: Date.now(),
  });
  api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return true;
};

/** Small, single-purpose link editor. @, [[ and 【【 reuse the installed SiYuan search picker. */
export const openSiyuanLinkPopover = (
  elementId: string, anchor?: HTMLElement | null, allowBlank = false
) => {
  closeSiyuanLinkPopover();
  const current = window.excalidrawAPI?.getSceneElements?.().find((el: any) =>
    el.id === elementId && el.type === "embeddable" &&
      (LINK.test(el.link || "") || (allowBlank && isEmptyWebEmbed(el))));
  if (!current) return;

  const isBlank = isEmptyWebEmbed(current);
  const popup = document.createElement("div");
  popup.className = "dodo-siyuan-link-popover";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", isBlank ? "设置嵌入链接" : "编辑思源块链接");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "输入网址或 @搜索思源块";
  input.value = current.link || "";
  input.setAttribute("aria-label", isBlank ? "嵌入链接" : "思源块链接");
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "确定";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  const error = document.createElement("small");
  error.className = "dodo-siyuan-link-error";
  error.setAttribute("role", "status");
  popup.append(input, save, cancel, error);
  document.body.append(popup);
  openPopover = popup;
  const position = anchor?.getBoundingClientRect();
  const width = Math.min(390, window.innerWidth - 24);
  popup.style.width = `${width}px`;
  popup.style.left = `${Math.max(12, Math.min((position?.right ?? window.innerWidth / 2) - width, window.innerWidth - width - 12))}px`;
  popup.style.top = `${Math.max(12, Math.min((position?.bottom ?? 70) + 8, window.innerHeight - 80))}px`;
  // Prevent canvas click handlers from interpreting a popup action as a
  // shape action, but let the search dropdown catch its own pointer events.
  popup.addEventListener("pointerdown", event => event.stopPropagation());
  const submit = () => {
    if (!updateSiyuanBlockLink(elementId, input.value, allowBlank)) {
      error.textContent = isBlank
        ? "请输入有效网址或思源块 ID"
        : "请输入有效的思源块 ID 或 siyuan://blocks/链接";
      return;
    }
    closeSiyuanLinkPopover();
  };
  save.addEventListener("click", submit);
  cancel.addEventListener("click", closeSiyuanLinkPopover);
  input.addEventListener("input", () => { error.textContent = ""; });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.stopPropagation(); event.preventDefault(); submit(); }
    if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); closeSiyuanLinkPopover(); }
  });
  const outside = (event: PointerEvent) => {
    const target = event.target;
    if (target instanceof Node && popup.contains(target)) return;
    // The search component creates a separate listbox on document.body.
    if (target instanceof Element && target.closest(".dodo-link-search-results")) return;
    closeSiyuanLinkPopover();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeSiyuanLinkPopover();
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape, true);
  dispose = () => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape, true);
  };
  input.focus();
  input.select();
};
