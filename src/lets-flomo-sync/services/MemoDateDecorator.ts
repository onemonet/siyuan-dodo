import { FLOMO_MEMO_ATTR } from "../../config/constants";
import { formatConfiguredMemoDisplayTime } from "../utils/time";
import {
  getMemoDateDecorationCss,
  MEMO_DATE_LABEL_ATTR,
  MEMO_DATE_STYLE_ID,
} from "./MemoDateStyle";

export interface MemoDateDecoratorConfig {
  enabled: boolean;
  timeFormat: string;
}

const MEMO_ATTR = FLOMO_MEMO_ATTR;
const MEMO_SELECTOR = `[${MEMO_ATTR}]`;

export class MemoDateDecorator {
  private observer: MutationObserver | null = null;
  private queuedRoots = new Set<Element>();
  private flushTimer: number | null = null;
  private config: MemoDateDecoratorConfig = {
    enabled: false,
    timeFormat: "YYYY-MM-DD HH:mm:ss",
  };

  update(config: MemoDateDecoratorConfig): void {
    this.config = { ...config };

    if (!this.config.enabled) {
      this.disconnectObserver();
      this.clearScheduledFlush();
      this.clearDecorations();
      this.removeStyle();
      return;
    }

    this.ensureStyle();
    this.ensureObserver();
    this.processRoot(document.body);
  }

  destroy(): void {
    this.disconnectObserver();
    this.clearScheduledFlush();
    this.clearDecorations();
    this.removeStyle();
  }

  processProtyle(root?: Element | null): void {
    if (!this.config.enabled || !root) {
      return;
    }

    this.ensureStyle();
    this.processRoot(root);
  }

  private ensureStyle(): void {
    let styleElement = document.getElementById(
      MEMO_DATE_STYLE_ID
    ) as HTMLStyleElement | null;

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = MEMO_DATE_STYLE_ID;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = getMemoDateDecorationCss(MEMO_ATTR);
  }

  private removeStyle(): void {
    document.getElementById(MEMO_DATE_STYLE_ID)?.remove();
  }

  private ensureObserver(): void {
    if (this.observer || !document.body) {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          this.queueRoot(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          this.queueRoot(node);
        });
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [MEMO_ATTR],
    });
  }

  private disconnectObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private queueRoot(node: Node): void {
    if (!(node instanceof Element)) {
      return;
    }

    this.queuedRoots.add(node);

    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      const roots = Array.from(this.queuedRoots);
      this.queuedRoots.clear();
      roots.forEach((root) => this.processRoot(root));
    }, 0);
  }

  private clearScheduledFlush(): void {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.queuedRoots.clear();
  }

  private processRoot(root?: ParentNode | null): void {
    if (!root || !this.config.enabled) {
      return;
    }

    this.findMemoBlocks(root).forEach((element) => {
      this.decorateMemoBlock(element);
    });
  }

  private findMemoBlocks(root: ParentNode): HTMLElement[] {
    const result = new Set<HTMLElement>();

    if (root instanceof HTMLElement && this.isMemoBlock(root)) {
      result.add(root);
    }

    if ("querySelectorAll" in root) {
      root.querySelectorAll<HTMLElement>(MEMO_SELECTOR).forEach((element) => {
        if (this.isMemoBlock(element)) {
          result.add(element);
        }
      });
    }

    return Array.from(result);
  }

  private isMemoBlock(element: Element): element is HTMLElement {
    return (
      element instanceof HTMLElement &&
      element.hasAttribute(MEMO_ATTR) &&
      Boolean(element.closest(".protyle-wysiwyg"))
    );
  }

  private decorateMemoBlock(element: HTMLElement): void {
    const rawValue = element.getAttribute(MEMO_ATTR) || "";
    const formattedValue = formatConfiguredMemoDisplayTime(
      rawValue,
      this.config.timeFormat
    );

    if (!formattedValue) {
      this.clearDecorationOnElement(element);
      return;
    }

    element.setAttribute(MEMO_DATE_LABEL_ATTR, formattedValue);
  }

  private clearDecorations(): void {
    document
      .querySelectorAll<HTMLElement>(`[${MEMO_DATE_LABEL_ATTR}]`)
      .forEach((element) => this.clearDecorationOnElement(element));
  }

  private clearDecorationOnElement(element: Element): void {
    element.removeAttribute(MEMO_DATE_LABEL_ATTR);
  }
}
