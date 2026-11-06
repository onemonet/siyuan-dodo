import { SubPlugin } from "@/types/plugin";
import { request } from "@/api";
import { isBlockID } from "@/myscripts/syUtils";
import { settings } from "@/settings";
import {
  formatQuickInputTime,
  parseSemanticTime,
} from "./time-parser";

const STYLE_ID = "dodo-quick-input-style";
const MENU_ID = "dodo-quick-input-menu";
const MENU_CLASS = "dodo-quick-input";
const ITEM_CLASS = "dodo-quick-input__item";
const ITEM_ACTIVE_CLASS = "dodo-quick-input__item--active";
const ITEM_DISABLED_CLASS = "dodo-quick-input__item--disabled";
const TRIGGER = "@";
const MAX_QUERY_LENGTH = 80;
const SEARCH_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 120;
const DEFAULT_TIME_WEIGHT = 10;
const DEFAULT_DOCUMENT_WEIGHT = 20;

interface QuickInputSession {
  editable: HTMLElement;
  range: Range;
  query: string;
  items: QuickInputItem[];
  selectedIndex: number;
}

interface QuickInputItem {
  id: string;
  title: string;
  detail: string;
  value: string;
  blockId?: string;
  weight: number;
  disabled?: boolean;
}

interface SearchBlock {
  id?: string;
  content?: string;
  name?: string;
  hPath?: string;
  hpath?: string;
  path?: string;
}

export default class QuickInputPlugin implements SubPlugin {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  enabled?: boolean;

  private menuElement: HTMLElement | null = null;
  private session: QuickInputSession | null = null;
  private searchRequestId = 0;
  private searchTimer: number | null = null;
  private isComposing = false;
  private readonly handleInput = () => this.refreshFromSelection();
  private readonly handleKeyUp = (event: KeyboardEvent) => {
    if (!["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(event.key)) {
      this.refreshFromSelection();
    }
  };
  private readonly handleSelectionChange = () => this.refreshFromSelection();
  private readonly handleCompositionStart = () => {
    this.isComposing = true;
  };
  private readonly handleCompositionEnd = () => {
    this.isComposing = false;
    this.refreshFromSelection();
  };
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    this.onKeyDown(event);
  };
  private readonly handleMouseDown = (event: MouseEvent) => {
    this.onMouseDown(event);
  };

  onload(): void {
    this.ensureStyle();
    document.addEventListener("input", this.handleInput, true);
    document.addEventListener("keyup", this.handleKeyUp, true);
    window.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("selectionchange", this.handleSelectionChange);
    document.addEventListener("compositionstart", this.handleCompositionStart, true);
    document.addEventListener("compositionend", this.handleCompositionEnd, true);
    document.addEventListener("mousedown", this.handleMouseDown, true);
  }

  onunload(): void {
    document.removeEventListener("input", this.handleInput, true);
    document.removeEventListener("keyup", this.handleKeyUp, true);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("selectionchange", this.handleSelectionChange);
    document.removeEventListener("compositionstart", this.handleCompositionStart, true);
    document.removeEventListener("compositionend", this.handleCompositionEnd, true);
    document.removeEventListener("mousedown", this.handleMouseDown, true);
    this.close();
    document.getElementById(STYLE_ID)?.remove();
  }

  private refreshFromSelection(): void {
    if (this.isComposing) {
      return;
    }

    const context = this.getTriggerContext();
    if (!context) {
      this.close();
      return;
    }

    const requestId = ++this.searchRequestId;
    const items = this.buildItems(context.query);
    if (items.length === 0) {
      this.close();
      return;
    }
    const selectedIndex = this.normalizeSelectedIndex(
      this.session?.selectedIndex ?? 0,
      items
    );

    this.session = {
      editable: context.editable,
      range: context.range,
      query: context.query,
      items,
      selectedIndex,
    };

    this.renderMenu();
    this.positionMenu();

    if (context.query.trim() && this.isSearchEnabled("documentSearchEnabled")) {
      this.scheduleSearch(context, requestId);
    }
  }

  private getTriggerContext():
    | { editable: HTMLElement; range: Range; query: string }
    | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const editable = this.getEditableFromRange(range);
    if (!editable) {
      return null;
    }

    const textBeforeCaret = this.getTextBeforeCaret(editable, range);
    const triggerIndex = this.findTriggerIndex(textBeforeCaret);
    if (triggerIndex < 0) {
      return null;
    }

    const query = textBeforeCaret.slice(triggerIndex + TRIGGER.length);
    if (query.includes("\n") || query.length > MAX_QUERY_LENGTH) {
      return null;
    }

    const replaceRange = this.createRangeByTextOffset(
      editable,
      triggerIndex,
      textBeforeCaret.length
    );
    if (!replaceRange) {
      return null;
    }

    return {
      editable,
      range: replaceRange,
      query,
    };
  }

  private getEditableFromRange(range: Range): HTMLElement | null {
    const node = range.startContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    const editable = element?.closest<HTMLElement>("div[contenteditable='true']");
    if (!editable || editable.classList.contains("protyle-attr")) {
      return null;
    }

    if (!editable.closest(".protyle-wysiwyg")) {
      return null;
    }

    return editable;
  }

  private getTextBeforeCaret(editable: HTMLElement, caretRange: Range): string {
    const beforeRange = caretRange.cloneRange();
    beforeRange.selectNodeContents(editable);
    beforeRange.setEnd(caretRange.endContainer, caretRange.endOffset);
    return beforeRange.toString();
  }

  private findTriggerIndex(text: string): number {
    // Allow @ anywhere in a paragraph, including immediately after normal text.
    // getTriggerContext replaces only the active @query range.
    return text.lastIndexOf(TRIGGER);
  }

  private createRangeByTextOffset(
    root: HTMLElement,
    startOffset: number,
    endOffset: number
  ): Range | null {
    const range = document.createRange();
    const start = this.findTextPosition(root, startOffset);
    const end = this.findTextPosition(root, endOffset);
    if (!start || !end) {
      return null;
    }

    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  private findTextPosition(
    root: HTMLElement,
    targetOffset: number
  ): { node: Text; offset: number } | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let consumed = 0;
    let node = walker.nextNode() as Text | null;
    let lastTextNode: Text | null = null;

    while (node) {
      lastTextNode = node;
      const nextConsumed = consumed + node.data.length;
      if (targetOffset <= nextConsumed) {
        return {
          node,
          offset: Math.max(0, targetOffset - consumed),
        };
      }
      consumed = nextConsumed;
      node = walker.nextNode() as Text | null;
    }

    if (lastTextNode && targetOffset === consumed) {
      return { node: lastTextNode, offset: lastTextNode.data.length };
    }

    return null;
  }

  private buildItems(query: string): QuickInputItem[] {
    const timeEnabled = this.isSearchEnabled("timeSearchEnabled");
    const documentEnabled = this.isSearchEnabled("documentSearchEnabled");
    const timeWeight = this.getSearchWeight("timeSearchWeight", DEFAULT_TIME_WEIGHT);
    const documentWeight = this.getSearchWeight(
      "documentSearchWeight",
      DEFAULT_DOCUMENT_WEIGHT,
    );

    if (!query.trim()) {
      if (!timeEnabled) {
        return [];
      }
      const today = new Date();
      return [
        {
          id: "time",
          title: "时间",
          detail: "输入 @明天 9:00、@下周五下午3点；回车插入今天",
          value: formatQuickInputTime(today, false),
          weight: timeWeight,
        },
      ];
    }

    const items: QuickInputItem[] = [];
    const parsed = timeEnabled ? parseSemanticTime(query) : null;
    if (parsed) {
      items.push({
        id: "time",
        title: "时间",
        detail: `${parsed.source} -> ${parsed.text}`,
        value: parsed.text,
        weight: timeWeight,
      });
    }

    if (documentEnabled) {
      items.push({
        id: "search-loading",
        title: "文档",
        detail: "搜索中...",
        value: "",
        weight: documentWeight,
        disabled: true,
      });
    }
    return this.sortItems(items);
  }

  private scheduleSearch(
    context: { editable: HTMLElement; range: Range; query: string },
    requestId: number,
  ): void {
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
    }

    this.searchTimer = window.setTimeout(() => {
      this.searchTimer = null;
      void this.loadSearchItems(context, requestId);
    }, SEARCH_DEBOUNCE_MS);
  }

  private async loadSearchItems(
    context: { editable: HTMLElement; range: Range; query: string },
    requestId: number,
  ): Promise<void> {
    try {
      const blocks = await this.searchDocumentBlocks(context.query);
      if (!this.isCurrentSearch(context, requestId)) {
        return;
      }

      const documentWeight = this.getSearchWeight(
        "documentSearchWeight",
        DEFAULT_DOCUMENT_WEIGHT,
      );
      const searchItems = blocks
        .map((block) => this.createBlockItem(block, documentWeight))
        .filter(Boolean) as QuickInputItem[];
      const documentItems = searchItems.length
        ? searchItems
        : [{
            id: "search-empty",
            title: "文档",
            detail: "未找到匹配的文档",
            value: "",
            weight: documentWeight,
            disabled: true,
          }];

      this.session.items = this.sortItems([
        ...this.session.items.filter((item) => item.id === "time"),
        ...documentItems,
      ]);
      this.session.selectedIndex = this.normalizeSelectedIndex(
        0,
        this.session.items,
      );
      this.renderMenu();
      this.positionMenu();
    } catch (_error) {
      if (!this.isCurrentSearch(context, requestId)) {
        return;
      }

      this.session.items = this.sortItems([
        ...this.session.items.filter((item) => item.id === "time"),
        {
          id: "search-error",
          title: "文档",
          detail: "搜索失败，请稍后重试",
          value: "",
          weight: this.getSearchWeight(
            "documentSearchWeight",
            DEFAULT_DOCUMENT_WEIGHT,
          ),
          disabled: true,
        },
      ]);
      this.renderMenu();
      this.positionMenu();
    }
  }

  private async searchDocumentBlocks(query: string): Promise<SearchBlock[]> {
    const data = await request("/api/search/fullTextSearchBlock", {
      query: query.trim(),
      method: 0,
      orderBy: 7,
      groupBy: 0,
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      types: { document: true },
      subTypes: {},
      paths: [],
      boxes: [],
    });

    return Array.isArray(data?.blocks) ? data.blocks : [];
  }

  private createBlockItem(
    block: SearchBlock,
    weight: number,
  ): QuickInputItem | null {
    const id = typeof block.id === "string" ? block.id : "";
    if (!isBlockID(id)) {
      return null;
    }

    const title = this.cleanSearchText(
      block.content || block.name || block.hPath || block.hpath || id,
    );
    if (!title) {
      return null;
    }

    const path = this.cleanSearchText(
      block.hPath || block.hpath || block.path || "",
    ).replace(/^\/+/, "");
    return {
      id: "block-ref",
      title,
      detail: path && path !== title ? path : "",
      value: title,
      blockId: id,
      weight,
    };
  }

  private isSearchEnabled(key: string): boolean {
    return settings.getBySpace("quickInput", key) !== false;
  }

  private getSearchWeight(key: string, fallback: number): number {
    const value = Number(settings.getBySpace("quickInput", key));
    return Number.isFinite(value) ? value : fallback;
  }

  private sortItems(items: QuickInputItem[]): QuickInputItem[] {
    return items.sort((left, right) => left.weight - right.weight);
  }

  private cleanSearchText(value: string): string {
    return new DOMParser()
      .parseFromString(String(value), "text/html")
      .body.textContent.replace(/\s+/g, " ")
      .trim();
  }

  private isCurrentSearch(
    context: { editable: HTMLElement; range: Range; query: string },
    requestId: number,
  ): boolean {
    return Boolean(
      requestId === this.searchRequestId &&
        this.session &&
        this.session.editable === context.editable &&
        this.session.query === context.query,
    );
  }

  private renderMenu(): void {
    const session = this.session;
    if (!session) {
      return;
    }

    const menu = this.ensureMenu();
    menu.innerHTML = "";
    menu.dataset.open = "true";

    session.items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${ITEM_CLASS} b3-list-item`;
      button.dataset.index = String(index);
      button.dataset.itemId = item.id;
      if (index === session.selectedIndex) {
        button.classList.add(ITEM_ACTIVE_CLASS);
        button.classList.add("b3-list-item--focus");
      }
      if (item.disabled) {
        button.classList.add(ITEM_DISABLED_CLASS);
      }

      const title = document.createElement("span");
      title.className = "b3-list-item__text dodo-quick-input__title";
      this.appendHighlightedText(title, item.title, session.query);

      const firstLine = document.createElement("div");
      firstLine.className = "b3-list-item__first";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "b3-list-item__graphic");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", item.id === "time" ? "#iconCalendar" : "#iconFile");
      icon.appendChild(use);
      firstLine.append(icon, title);

      const detail = document.createElement("span");
      detail.className = "b3-list-item__meta dodo-quick-input__detail";
      detail.textContent = item.detail;

      button.append(firstLine);
      if (item.detail) {
        button.classList.add("b3-list-item--two");
        button.append(detail);
      }
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.applyItem(index, event.ctrlKey);
      });
      menu.appendChild(button);
      if (index === session.selectedIndex) {
        button.scrollIntoView({ block: "nearest" });
      }
    });
  }

  private appendHighlightedText(target: HTMLElement, text: string, query: string): void {
    const needle = query.trim();
    const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
    if (!needle || index < 0) {
      target.textContent = text;
      return;
    }

    target.append(text.slice(0, index));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(index, index + needle.length);
    target.append(mark, text.slice(index + needle.length));
  }

  private ensureMenu(): HTMLElement {
    if (this.menuElement?.isConnected) {
      return this.menuElement;
    }

    const existing = document.getElementById(MENU_ID);
    if (existing) {
      this.menuElement = existing;
      return existing;
    }

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.className = `${MENU_CLASS} protyle-hint b3-list b3-list--background`;
    menu.dataset.close = "false";
    menu.setAttribute("role", "listbox");
    document.body.appendChild(menu);
    this.menuElement = menu;
    return menu;
  }

  private positionMenu(): void {
    const menu = this.menuElement;
    const session = this.session;
    if (!menu || !session) {
      return;
    }

    const rect = this.getCaretRect(session.range, session.editable);
    const margin = 8;
    const width = menu.offsetWidth || 280;
    const height = menu.offsetHeight || 72;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left;
    let top = rect.bottom + margin;

    if (top + height > viewportHeight && rect.top > height + margin) {
      top = rect.top - height - margin;
    }

    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }

    menu.style.left = `${Math.max(margin, left + window.scrollX)}px`;
    menu.style.top = `${Math.max(margin, top + window.scrollY)}px`;
  }

  private getCaretRect(range: Range, fallback: HTMLElement): DOMRect {
    const selection = window.getSelection();
    const caretRange = selection?.rangeCount
      ? selection.getRangeAt(0).cloneRange()
      : range.cloneRange();
    const rect = caretRange.getBoundingClientRect();
    if (rect.width || rect.height) {
      return rect;
    }

    const rects = caretRange.getClientRects();
    if (rects.length > 0) {
      return rects[0];
    }

    return fallback.getBoundingClientRect();
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Enter/Tab may be used to confirm Chinese IME candidates.
    if (this.isComposing || event.isComposing || event.keyCode === 229) return;
    const session = this.session;
    if (!session) {
      return;
    }

    if (event.key === "Escape") {
      this.consumeKeyboardEvent(event);
      this.close();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      this.consumeKeyboardEvent(event);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      session.selectedIndex = this.normalizeSelectedIndex(
        session.selectedIndex + direction,
        session.items
      );
      this.renderMenu();
      return;
    }

    if (event.key === "Tab" || event.key === "Enter") {
      const item = session.items[session.selectedIndex];
      if (!item || item.disabled) {
        return;
      }

      this.consumeKeyboardEvent(event);
      this.applyItem(session.selectedIndex, event.key === "Enter" && event.ctrlKey);
    }
  }

  private consumeKeyboardEvent(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private onMouseDown(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && this.menuElement?.contains(target)) {
      return;
    }

    if (this.session) {
      this.close();
    }
  }

  private applyItem(index: number, useStaticAnchor = false): void {
    const session = this.session;
    const item = session?.items[index];
    if (!session || !item || item.disabled || !item.value) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    session.editable.focus();
    selection.removeAllRanges();
    selection.addRange(session.range);

    if (item.id === "block-ref") {
      if (!item.blockId) return;
      const reference = document.createElement("span");
      reference.dataset.type = "block-ref";
      reference.dataset.id = item.blockId;
      reference.dataset.subtype = useStaticAnchor ? "s" : "d";
      reference.textContent = item.title;
      session.range.deleteContents();
      session.range.insertNode(reference);
      session.range.setStartAfter(reference);
      session.range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(session.range);
      session.editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
      this.close();
      return;
    }

    const inserted = document.execCommand("insertText", false, item.value);
    if (!inserted) {
      session.range.deleteContents();
      const text = document.createTextNode(item.value);
      session.range.insertNode(text);
      session.range.setStartAfter(text);
      session.range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(session.range);
      session.editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    this.close();
  }

  private normalizeSelectedIndex(index: number, items: QuickInputItem[]): number {
    if (items.length === 0) {
      return 0;
    }

    let nextIndex = ((index % items.length) + items.length) % items.length;
    for (let i = 0; i < items.length; i++) {
      if (!items[nextIndex]?.disabled) {
        return nextIndex;
      }
      nextIndex = (nextIndex + 1) % items.length;
    }
    return 0;
  }

  private close(): void {
    this.searchRequestId += 1;
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.session = null;
    if (this.menuElement) {
      this.menuElement.dataset.open = "false";
      this.menuElement.innerHTML = "";
    }
  }

  private ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.${MENU_CLASS} {
  position: absolute;
  z-index: 10000;
  display: none;
  min-width: 280px;
  max-width: min(420px, calc(100vw - 16px));
  max-height: min(360px, calc(100vh - 16px));
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
  border: 1px solid var(--b3-theme-background-light);
  border-radius: 6px;
  background: var(--b3-menu-background);
  box-shadow: var(--b3-dialog-shadow);
  color: var(--b3-theme-on-background);
  font-family: var(--b3-font-family);
}

.${MENU_CLASS}[data-open="true"] {
  display: block;
}

.${ITEM_CLASS} {
  width: calc(100% - 16px);
  display: block;
  padding: 5px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.${ITEM_CLASS} .b3-list-item__first {
  display: flex;
  align-items: center;
  min-width: 0;
}

.${ITEM_CLASS} .b3-list-item__graphic {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-right: 8px;
}

.${ITEM_ACTIVE_CLASS} {
  background: var(--b3-list-hover);
}

.${ITEM_DISABLED_CLASS} {
  cursor: default;
  opacity: 0.62;
}

.dodo-quick-input__title {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dodo-quick-input__detail {
  display: block;
  margin: 2px 0 0 26px;
  min-width: 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
    document.head.appendChild(style);
  }
}
