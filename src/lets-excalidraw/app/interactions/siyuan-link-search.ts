import type { InteractionFeature } from "../toolbar/types";
import "./siyuan-link-search.css";
import { createBlockSearchRow, searchNativeBlockReferences, type SiyuanSearchBlock } from "./siyuan-search-presentation";

const embedded = () => window.parent !== window && location.pathname.includes("/excalidraw/app/");
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/i;
const MAX_RESULTS = 32;

type BlockResult = SiyuanSearchBlock;

export const linkKeyword = (input: string): string | null => {
  const offset = Math.max(input.lastIndexOf("[["), input.lastIndexOf("【【"), input.lastIndexOf("@"));
  return offset < 0 ? null : input.slice(offset + (input[offset] === "@" ? 1 : 2)).trim();
};

function isLinkInput(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement)) return false;
  // Excalidraw 0.18 Web-Embed uses a stand-alone hyperlink container,
  // NOT a popover/dialog. This exact class is the important case.
  if (target.matches(".excalidraw-hyperlinkContainer-input")) return true;
  return Boolean(target.closest('[class*="popover"], [class*="dialog"], [class*="modal"]')) &&
    /link|url|http|链接/i.test([
      target.placeholder, target.className, target.parentElement?.className,
    ].join(" "));
}

const feature: InteractionFeature = {
  id: "siyuanLinkSearch",
  label: "思源块链接搜索",
  description: "在 Web-Embed 链接输入框输入 @、[[ 或 【【，搜索思源块并插入可预览的链接。",
  defaultEnabled: true,
  mount() {
    if (!embedded()) return () => {};
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let active: HTMLInputElement | null = null;
    let dropdown: HTMLDivElement | null = null;
    let options: HTMLButtonElement[] = [];
    let selected = 0;
    let requestVersion = 0;
    let composing = false;

    const clear = () => {
      dropdown?.remove();
      dropdown = null;
      options = [];
      selected = 0;
    };
    const cancel = () => {
      requestVersion++;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      controller?.abort();
      controller = null;
      clear();
    };
    const renderMessage = (input: HTMLInputElement, message: string) => {
      clear();
      if (!document.contains(input)) return;
      dropdown = document.createElement("div");
      dropdown.className = "dodo-link-search-results";
      dropdown.setAttribute("role", "listbox");
      dropdown.setAttribute("aria-label", "思源块链接搜索结果");
      const rect = input.getBoundingClientRect();
      dropdown.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(650, window.innerWidth - 16) - 8))}px`;
      const height = Math.min(380, Math.floor(window.innerHeight * 0.55));
      const roomBelow = window.innerHeight - rect.bottom;
      dropdown.style.top = `${roomBelow > height + 14 ? rect.bottom + 5 : Math.max(8, rect.top - height - 5)}px`;
      if (message) {
        const info = document.createElement("div");
        info.className = "dodo-link-search-status";
        info.setAttribute("role", "status");
        info.textContent = message;
        dropdown.append(info);
      }
      document.body.append(dropdown);
    };
    const commit = (input: HTMLInputElement, block: BlockResult) => {
      if (!block.id || !BLOCK_ID.test(block.id)) return;
      const link = `siyuan://blocks/${block.id}`;
      cancel(); // prevent our own synthetic Enter from selecting again
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, link);
      else input.value = link;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      // Excalidraw's own Hyperlink onKeyDown commits the URL to its embeddable.
      // Submit the actual input rather than creating a second overlapping card.
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", bubbles: true, cancelable: true,
      }));
      active = null;
    };
    const search = async (input: HTMLInputElement, keyword: string, version: number) => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const blocks = await searchNativeBlockReferences(keyword, signal);
        if (signal.aborted || version !== requestVersion ||
            active !== input || !document.contains(input) || linkKeyword(input.value) !== keyword) return;
        const unique = new Set<string>();
        const valid = blocks.filter(block => {
          if (!block.id || !BLOCK_ID.test(block.id) || unique.has(block.id)) return false;
          unique.add(block.id);
          return true;
        }).slice(0, MAX_RESULTS);
        renderMessage(input, valid.length ? "" : "没有找到匹配的思源块");
        for (const block of valid) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "dodo-link-search-item";
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(options.length === 0));
          button.append(createBlockSearchRow(block, keyword));
          // Prevent Excalidraw's URL field blurring before the selection.
          button.addEventListener("pointerdown", event => { event.preventDefault(); commit(input, block); });
          dropdown!.append(button);
          options.push(button);
        }
      } catch (error) {
        if (signal.aborted || version !== requestVersion || active !== input) return;
        console.warn("思源块链接搜索失败", error);
        renderMessage(input, "思源块搜索失败，请检查搜索接口或登录状态");
      }
    };
    const onInput = (event: Event) => {
      if (!isLinkInput(event.target)) return;
      const input = event.target;
      active = input;
      cancel();
      if (composing) return;
      const keyword = linkKeyword(input.value);
      if (keyword === null) return;
      if (!keyword) { renderMessage(input, "输入 @关键词 搜索思源笔记块"); return; }
      if (keyword.length > 80) { renderMessage(input, "关键词不能超过 80 个字符"); return; }
      renderMessage(input, "正在搜索…");
      const version = requestVersion;
      timer = window.setTimeout(() => {
        timer = null;
        void search(input, keyword, version);
      }, 150);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!dropdown || event.target !== active) return;
      if (event.isComposing || composing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        cancel();
        return;
      }
      if (!options.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); event.stopImmediatePropagation();
        selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options.forEach((button, index) => button.setAttribute("aria-selected", String(index === selected)));
        options[selected].scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault(); event.stopImmediatePropagation();
        const button = options[selected];
        button?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      }
    };
    const onBlur = (event: FocusEvent) => {
      if (event.target === active) window.setTimeout(() => {
        if (document.activeElement !== active) { cancel(); active = null; }
      }, 180);
    };
    const onCompositionStart = (event: CompositionEvent) => {
      if (isLinkInput(event.target)) composing = true;
    };
    const onCompositionEnd = (event: CompositionEvent) => {
      if (isLinkInput(event.target)) {
        composing = false;
        onInput(event);
      }
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusout", onBlur, true);
    document.addEventListener("compositionstart", onCompositionStart, true);
    document.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      cancel(); active = null;
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusout", onBlur, true);
      document.removeEventListener("compositionstart", onCompositionStart, true);
      document.removeEventListener("compositionend", onCompositionEnd, true);
    };
  },
};
export default feature;
