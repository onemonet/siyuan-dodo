import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { nanoid } from "nanoid";
import type { InteractionFeature } from "../toolbar/types";
import "./siyuan-block-mention.css";
import { createBlockSearchRow, searchNativeBlockReferences } from "./siyuan-search-presentation";

interface SearchBlock {
  id?: string;
  content?: string;
  name?: string;
  hPath?: string;
  hpath?: string;
  path?: string;
}

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 150;
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/i;
const inSiyuan = () => window.parent !== window && location.pathname.includes("/excalidraw/app/");
const selectable = (block: SearchBlock) => typeof block.id === "string" && BLOCK_ID.test(block.id);
const label = (value: unknown) => String(value || "").replace(/<[^>]+>/g, "").trim();

function createEmbeddedBlock(id: string, x: number, y: number) {
  return {
    id: nanoid(),
    type: "embeddable",
    x, y,
    width: 300, height: 185,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: "aO",
    roundness: { type: 3 },
    seed: Math.floor(Math.random() * 10000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 10000),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: `siyuan://blocks/${id}`,
    locked: false,
  };
}

/**
 * @ on the canvas opens a quick-insert picker, following the SiYuan quick-input
 * module's full-text block search and keyboard navigation.
 * Searching inside the Excalidraw hyperlink field remains a separate feature.
 */
const feature: InteractionFeature = {
  id: "siyuanBlockMention",
  label: "@ 搜索并插入思源块",
  description: "在画布非文本编辑状态输入 @，搜索思源块并插入可刷新的内容卡片。",
  defaultEnabled: true,
  mount(api) {
    if (!inSiyuan()) return () => {};
    let lastPoint: { x: number; y: number } | null = null;
    let canvasActive = false;
    let panel: HTMLDivElement | null = null;
    let input: HTMLInputElement | null = null;
    let results: HTMLDivElement | null = null;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let selected = 0;
    let blocks: SearchBlock[] = [];
    let insertionPoint = { x: 0, y: 0 };

    const clearSearch = () => {
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
      controller?.abort(); controller = null;
      blocks = [];
      selected = 0;
    };

    const close = () => {
      clearSearch();
      panel?.remove();
      panel = null;
      input = null;
      results = null;
    };

    const isForm = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], .App-menu, .App-toolbar',
      ));

    const updateActive = () => {
      results?.querySelectorAll<HTMLButtonElement>('[role="option"]').forEach((button, index) => {
        const active = selected === index;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    };

    const choose = (block: SearchBlock) => {
      if (!selectable(block)) return;
      const appState = api.getAppState();
      const { x, y } = viewportCoordsToSceneCoords(
        { clientX: insertionPoint.x, clientY: insertionPoint.y }, appState,
      );
      const element = createEmbeddedBlock(block.id!, x, y);
      api.updateScene({
        elements: [...api.getSceneElements(), element],
        appState: { selectedElementIds: { [element.id]: true } },
      });
      close();
    };

    const render = (message = "") => {
      if (!results) return;
      results.replaceChildren();
      if (!blocks.length) {
        const empty = document.createElement("p");
        empty.className = "dodo-mention-status";
        empty.textContent = message || "没有找到匹配的思源块";
        results.append(empty);
        return;
      }
      blocks.forEach((block, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "option";
        button.className = "dodo-mention-result";
        button.tabIndex = index === selected ? 0 : -1;
        button.append(createBlockSearchRow(block, input?.value.trim() || ""));
        button.addEventListener("pointerdown", event => event.preventDefault());
        button.addEventListener("click", () => choose(block));
        results!.append(button);
      });
      updateActive();
    };

    const search = async (query: string) => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const found = await searchNativeBlockReferences(query, signal);
        if (signal.aborted || !panel || input?.value.trim() !== query) return;
        const unique = new Set<string>();
        blocks = found.filter((block: SearchBlock) => {
          if (!selectable(block) || unique.has(block.id!)) return false;
          unique.add(block.id!);
          return true;
        }).slice(0, MAX_RESULTS);
        selected = 0;
        render();
      } catch (error) {
        if (signal.aborted || !panel) return;
        blocks = [];
        render("搜索失败，请检查思源是否正常运行");
        console.warn("Excalidraw @ 块搜索失败", error);
      }
    };

    const onQuery = () => {
      if (!input) return;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
      blocks = [];
      selected = 0;
      const query = input.value.trim();
      if (!query) { render("输入关键词搜索思源笔记块"); return; }
      if (query.length > 80) { render("关键词不能超过 80 个字符"); return; }
      render("正在搜索…");
      timer = window.setTimeout(() => {
        timer = null;
        void search(query);
      }, DEBOUNCE_MS);
    };

    const open = () => {
      close();
      const host = document.querySelector<HTMLElement>(".excalidraw");
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const x = Math.max(rect.left + 16, Math.min(lastPoint?.x ?? (rect.left + rect.width / 2), rect.right - 60));
      const y = Math.max(rect.top + 16, Math.min(lastPoint?.y ?? (rect.top + rect.height / 2), rect.bottom - 60));
      insertionPoint = { x, y };

      panel = document.createElement("div");
      panel.className = "dodo-mention-picker";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "搜索并插入思源块");
      panel.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 340))}px`;
      panel.style.top = `${Math.max(8, Math.min(y + 12, window.innerHeight - 300))}px`;

      const header = document.createElement("div");
      header.className = "dodo-mention-header";
      const symbol = document.createElement("span");
      symbol.textContent = "@";
      input = document.createElement("input");
      input.type = "search";
      input.placeholder = "搜索思源笔记块…";
      input.setAttribute("aria-label", "搜索思源块");
      input.setAttribute("autocomplete", "off");
      input.maxLength = 80;
      header.append(symbol, input);
      results = document.createElement("div");
      results.className = "dodo-mention-results";
      results.setAttribute("role", "listbox");
      results.setAttribute("aria-label", "思源块搜索结果");
      panel.append(header, results);
      document.body.append(panel);
      input.addEventListener("input", onQuery);
      input.addEventListener("keydown", event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); event.stopPropagation();
          if (blocks.length) {
            selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + blocks.length) % blocks.length;
            updateActive();
            results?.querySelectorAll<HTMLElement>('[role="option"]')[selected]?.scrollIntoView({ block: "nearest" });
          }
        } else if ((event.key === "Enter" || event.key === "Tab") && blocks[selected]) {
          event.preventDefault(); event.stopPropagation(); choose(blocks[selected]);
        }
      });
      render("输入关键词搜索思源笔记块");
      input.focus();
    };

    const onPointer = (event: PointerEvent) => {
      if (panel?.contains(event.target as Node)) return;
      if (panel) close();
      const element = event.target as Element;
      const host = element?.closest?.(".excalidraw");
      canvasActive = Boolean(host && !isForm(element));
      if (canvasActive) lastPoint = { x: event.clientX, y: event.clientY };
    };
    const onKey = (event: KeyboardEvent) => {
      if (panel) return;
      if (event.key !== "@" || event.repeat || event.isComposing || event.keyCode === 229 ||
          event.altKey || event.ctrlKey || event.metaKey || isForm(event.target)) return;
      const target = event.target as Element;
      if (!target?.closest?.(".excalidraw") && !canvasActive) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      open();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      close();
    };
  },
};

export default feature;
