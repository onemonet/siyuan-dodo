import type { SubPlugin } from "@/types/plugin";
import { settings } from "@/settings";
import {
  DEFAULT_SYMBOL_REPLACE_RULES_TEXT,
  findSymbolReplacement,
  parseSymbolReplacementRules,
  normalizeSymbolReplacementRulesText,
  RULES_SETTING_KEY,
  SKIP_CODE_SETTING_KEY,
  SYMBOL_REPLACE_PLUGIN_NAME,
  type SymbolReplacementRule,
} from "./rules";

const EDITABLE_SELECTOR = "div[contenteditable='true']";
const CODE_SELECTOR = "[data-type='NodeCodeBlock'], span[data-type~='code'], code, .hljs";

export default class SymbolReplacePlugin implements SubPlugin {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  enabled?: boolean;

  private isComposing = false;
  private rules: SymbolReplacementRule[] = [];
  private maxTriggerLength = 0;
  private skipCode = true;
  private readonly handleInput = (event: Event) => {
    const inputEvent = event as InputEvent;
    if (!this.isComposing && !inputEvent.isComposing) {
      this.replaceAtSelection();
    }
  };
  private readonly handleCompositionStart = () => {
    this.isComposing = true;
  };
  private readonly handleCompositionEnd = () => {
    this.isComposing = false;
    this.replaceAtSelection();
  };

  onload(): void {
    this.loadSettings();
    document.addEventListener("input", this.handleInput, true);
    document.addEventListener("compositionstart", this.handleCompositionStart, true);
    document.addEventListener("compositionend", this.handleCompositionEnd, true);
  }

  onunload(): void {
    document.removeEventListener("input", this.handleInput, true);
    document.removeEventListener("compositionstart", this.handleCompositionStart, true);
    document.removeEventListener("compositionend", this.handleCompositionEnd, true);
  }

  onDataChanged(): void {
    this.loadSettings();
  }

  private loadSettings(): void {
    const rawRules =
      settings.getBySpace(SYMBOL_REPLACE_PLUGIN_NAME, RULES_SETTING_KEY) ??
      DEFAULT_SYMBOL_REPLACE_RULES_TEXT;
    const normalizedRules = normalizeSymbolReplacementRulesText(rawRules);
    if (normalizedRules !== null && normalizedRules !== rawRules) {
      // 将旧版 => / Tab 规则一次性更新为 |，保证设置页展示与实际解析一致。
      settings.setBySpace(SYMBOL_REPLACE_PLUGIN_NAME, RULES_SETTING_KEY, normalizedRules);
      void settings.save().catch((error) => {
        console.warn("[symbolReplace] 旧规则格式迁移保存失败", error);
      });
    }
    this.rules = parseSymbolReplacementRules(normalizedRules ?? rawRules);
    this.maxTriggerLength = this.rules.reduce(
      (max, rule) => Math.max(max, rule.trigger.length),
      0,
    );
    this.skipCode =
      settings.getBySpace(SYMBOL_REPLACE_PLUGIN_NAME, SKIP_CODE_SETTING_KEY) !== false;
  }

  private replaceAtSelection(): void {
    if (!this.maxTriggerLength) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return;
    }

    const caretRange = selection.getRangeAt(0);
    const editable = this.getEditableFromRange(caretRange);
    if (!editable || (this.skipCode && this.isCodeContext(caretRange))) {
      return;
    }

    const textBeforeCaret = this.getTextBeforeCaret(
      editable,
      caretRange,
      this.maxTriggerLength,
    );
    const rule = findSymbolReplacement(textBeforeCaret, this.rules);
    if (!rule) {
      return;
    }

    const replaceRange = this.createRangeBeforeCaret(
      editable,
      caretRange,
      rule.trigger.length,
    );
    if (!replaceRange) {
      return;
    }

    this.insertReplacement(editable, replaceRange, rule.replacement);
  }

  private getEditableFromRange(range: Range): HTMLElement | null {
    const node = range.startContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    const editable = element?.closest<HTMLElement>(EDITABLE_SELECTOR);
    if (!editable || editable.classList.contains("protyle-attr")) {
      return null;
    }

    return editable.closest(".protyle-wysiwyg") ? editable : null;
  }

  private isCodeContext(range: Range): boolean {
    const node = range.startContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    return Boolean(element?.closest(CODE_SELECTOR));
  }

  private getTextBeforeCaret(
    root: HTMLElement,
    caretRange: Range,
    maxLength: number,
  ): string {
    let text = "";
    let node = caretRange.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      text = textNode.data.slice(0, caretRange.startOffset);
      node = textNode;
    } else {
      const previous = this.lastTextNodeBefore(node, caretRange.startOffset);
      if (!previous) {
        return "";
      }
      text = previous.data;
      node = previous;
    }

    while (text.length < maxLength) {
      const previous = this.previousTextNode(root, node);
      if (!previous) {
        break;
      }
      text = previous.data + text;
      node = previous;
    }

    return text.slice(-maxLength);
  }

  private createRangeBeforeCaret(
    root: HTMLElement,
    caretRange: Range,
    length: number,
  ): Range | null {
    const start = this.findStartBeforeCaret(root, caretRange, length);
    if (!start) {
      return null;
    }

    const range = caretRange.cloneRange();
    range.setStart(start.node, start.offset);
    return range;
  }

  private findStartBeforeCaret(
    root: HTMLElement,
    caretRange: Range,
    length: number,
  ): { node: Text; offset: number } | null {
    let remaining = length;
    let node = caretRange.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      if (caretRange.startOffset >= remaining) {
        return { node: textNode, offset: caretRange.startOffset - remaining };
      }
      remaining -= caretRange.startOffset;
      node = textNode;
    } else {
      const previous = this.lastTextNodeBefore(node, caretRange.startOffset);
      if (!previous) {
        return null;
      }
      if (previous.data.length >= remaining) {
        return { node: previous, offset: previous.data.length - remaining };
      }
      remaining -= previous.data.length;
      node = previous;
    }

    while (node) {
      const previous = node.nodeType === Node.TEXT_NODE ? (node as Text) : null;
      if (previous && previous.data.length >= remaining) {
        return { node: previous, offset: previous.data.length - remaining };
      }
      if (previous) {
        remaining -= previous.data.length;
      }

      const next = this.previousTextNode(root, node);
      if (!next) {
        return null;
      }
      node = next;
    }

    return null;
  }

  private lastTextNodeBefore(container: Node, offset: number): Text | null {
    let child = container.childNodes[Math.min(offset, container.childNodes.length) - 1];
    while (child) {
      const text = this.lastTextNodeIn(child);
      if (text) {
        return text;
      }
      child = child.previousSibling;
    }
    return this.previousTextNode(container, container);
  }

  private previousTextNode(root: Node, node: Node): Text | null {
    let current: Node | null = node;
    while (current && current !== root) {
      let sibling = current.previousSibling;
      while (sibling) {
        const text = this.lastTextNodeIn(sibling);
        if (text) {
          return text;
        }
        sibling = sibling.previousSibling;
      }
      current = current.parentNode;
    }
    return null;
  }

  private lastTextNodeIn(node: Node): Text | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return node as Text;
    }

    let child = node.lastChild;
    while (child) {
      const text = this.lastTextNodeIn(child);
      if (text) {
        return text;
      }
      child = child.previousSibling;
    }
    return null;
  }

  private insertReplacement(
    editable: HTMLElement,
    range: Range,
    replacement: string,
  ): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    editable.focus();
    selection.removeAllRanges();
    selection.addRange(range);

    const inserted = document.execCommand("insertText", false, replacement);
    if (inserted) {
      return;
    }

    range.deleteContents();
    const text = document.createTextNode(replacement);
    range.insertNode(text);
    range.setStartAfter(text);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}
