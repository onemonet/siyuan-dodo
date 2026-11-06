import { deleteBlock } from "@/api";
import { ATTRIBUTES, CSS_CLASSES } from "../constants";
import { BlockquoteHandler } from "../types";
import {
  logCustomBlockDebug,
  startCustomBlockTimer,
  waitForNextPaint,
} from "../utils/debug";

export class ToggleBlockquoteHandler implements BlockquoteHandler {
  readonly type = "toggle";

  private readonly pendingBlocks = new Set<string>();
  private readonly cleanupBlocks = new Set<string>();
  private readonly hotspotWidth = 32;
  private readonly hotspotHeight = 32;

  private readonly handleMouseDown = (event: MouseEvent) => {
    const blockquote = this.getToggleBlockFromEvent(event);
    if (!blockquote || !this.isHotspotEvent(event, blockquote)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handleClick = async (event: MouseEvent) => {
    const blockquote = this.getToggleBlockFromEvent(event);
    if (!blockquote || !this.isHotspotEvent(event, blockquote)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    logCustomBlockDebug("toggle.click", {
      blockId: blockquote.getAttribute(ATTRIBUTES.NODE_ID),
      folded: this.isFolded(blockquote),
    });

    await this.toggleBlock(blockquote);
  };

  initialize() {
    document.addEventListener("mousedown", this.handleMouseDown, true);
    document.addEventListener("click", this.handleClick, true);
  }

  process(element: HTMLElement) {
    const blockId = element.getAttribute(ATTRIBUTES.NODE_ID) || "";
    const foldable = this.isFoldable(element);
    const pending = blockId ? this.pendingBlocks.has(blockId) : false;
    const folded = this.isFolded(element);
    const label = this.getToggleLabel({ foldable, folded, pending });

    element.classList.toggle("folded", folded);
    element.classList.toggle(CSS_CLASSES.TOGGLE.FOLDABLE, foldable);
    element.classList.toggle(CSS_CLASSES.TOGGLE.DISABLED, !foldable);
    element.classList.toggle(CSS_CLASSES.TOGGLE.LOADING, pending);
    element.setAttribute("data-dodo-toggle-label", label);
    element.setAttribute("title", label);

    this.cleanupInjectedHtmlBlocks(element);
  }

  cleanup(element: HTMLElement) {
    element.classList.remove(CSS_CLASSES.TOGGLE.FOLDABLE);
    element.classList.remove(CSS_CLASSES.TOGGLE.DISABLED);
    element.classList.remove(CSS_CLASSES.TOGGLE.LOADING);
    element.removeAttribute("data-dodo-toggle-label");
    element.removeAttribute("title");
  }

  destroy() {
    document.removeEventListener("mousedown", this.handleMouseDown, true);
    document.removeEventListener("click", this.handleClick, true);
    this.pendingBlocks.clear();
    this.cleanupBlocks.clear();
  }

  private getToggleBlockFromEvent(event: Event): HTMLElement | null {
    const target = event.target;
    if (!(target instanceof Element)) {
      return null;
    }

    const blockquote = target.closest(
      `[data-type="NodeBlockquote"][${ATTRIBUTES.CUSTOM_BLOCK_TYPE}="toggle"]`
    );

    return blockquote instanceof HTMLElement ? blockquote : null;
  }

  private isHotspotEvent(event: MouseEvent, blockquote: HTMLElement): boolean {
    if (
      blockquote.classList.contains(CSS_CLASSES.TOGGLE.DISABLED) ||
      blockquote.classList.contains(CSS_CLASSES.TOGGLE.LOADING)
    ) {
      return false;
    }

    const rect = blockquote.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    return (
      offsetX >= 0 &&
      offsetX <= this.hotspotWidth &&
      offsetY >= 0 &&
      offsetY <= this.hotspotHeight
    );
  }

  private isFoldable(element: HTMLElement): boolean {
    let childBlockCount = 0;
    const { children } = element;

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (!(child instanceof HTMLElement) || !child.hasAttribute(ATTRIBUTES.NODE_ID)) {
        continue;
      }

      if (child.getAttribute(ATTRIBUTES.DATA_TYPE) === "NodeHTMLBlock" &&
          this.isInjectedToggleHtmlBlock(child)) {
        continue;
      }

      childBlockCount += 1;
      if (childBlockCount > 1) {
        return true;
      }
    }

    return false;
  }

  private async toggleBlock(element: HTMLElement): Promise<void> {
    const blockId = element.getAttribute(ATTRIBUTES.NODE_ID);
    if (!blockId || this.pendingBlocks.has(blockId) || !this.isFoldable(element)) {
      return;
    }

    const shouldFold = !this.isFolded(element);
    const stopTotalTimer = startCustomBlockTimer("toggle.total", {
      blockId,
      action: shouldFold ? "fold" : "unfold",
    });

    this.pendingBlocks.add(blockId);
    this.process(element);
    logCustomBlockDebug("toggle.state.pending", { blockId, pending: true });

    try {
      const stopRequestTimer = startCustomBlockTimer("toggle.request", {
        blockId,
        action: shouldFold ? "fold" : "unfold",
      });
      await this.requestFoldState(blockId, shouldFold);
      stopRequestTimer({ blockId, ok: true });

      const stopDomTimer = startCustomBlockTimer("toggle.dom-update", {
        blockId,
        action: shouldFold ? "fold" : "unfold",
      });
      if (shouldFold) {
        element.setAttribute(ATTRIBUTES.FOLD, "1");
      } else {
        element.removeAttribute(ATTRIBUTES.FOLD);
      }
      element.classList.toggle("folded", shouldFold);
      stopDomTimer({ blockId, folded: shouldFold });

      const paintDelay = await waitForNextPaint();
      logCustomBlockDebug("toggle.next-paint", {
        blockId,
        paintDelayMs: paintDelay,
        folded: shouldFold,
      });
    } catch (error) {
      console.error("[custom-block] toggle fold failed", error);
      logCustomBlockDebug("toggle.error", {
        blockId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.pendingBlocks.delete(blockId);
      this.process(element);
      logCustomBlockDebug("toggle.state.pending", { blockId, pending: false });
      stopTotalTimer({
        blockId,
        folded: this.isFolded(element),
      });
    }
  }

  private isFolded(element: HTMLElement): boolean {
    return element.getAttribute(ATTRIBUTES.FOLD) === "1";
  }

  private async requestFoldState(blockId: string, shouldFold: boolean): Promise<void> {
    const response = await fetch(
      `/api/block/${shouldFold ? "foldBlock" : "unfoldBlock"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId }),
      }
    );

    const result = await response.json();
    logCustomBlockDebug("toggle.request.response", {
      blockId,
      status: response.status,
      ok: response.ok,
      code: result?.code,
      msg: result?.msg || "",
    });
    if (!response.ok || !result || result.code !== 0) {
      throw new Error(result?.msg || "Toggle block request failed");
    }
  }

  private getToggleLabel({
    foldable,
    folded,
    pending,
  }: {
    foldable: boolean;
    folded: boolean;
    pending: boolean;
  }): string {
    if (pending) {
      return "Switching fold state";
    }

    if (!foldable) {
      return "This toggle block has no foldable child blocks yet";
    }

    return folded ? "Expand toggle block" : "Collapse toggle block";
  }

  private cleanupInjectedHtmlBlocks(element: HTMLElement) {
    const htmlBlocks = element.querySelectorAll(':scope > [data-type="NodeHTMLBlock"]');
    htmlBlocks.forEach((htmlBlock) => {
      const htmlElement = htmlBlock as HTMLElement;
      if (!this.isInjectedToggleHtmlBlock(htmlElement)) {
        return;
      }

      const htmlBlockId = htmlElement.getAttribute(ATTRIBUTES.NODE_ID);
      if (!htmlBlockId) {
        htmlElement.remove();
        return;
      }

      if (this.cleanupBlocks.has(htmlBlockId)) {
        return;
      }

      this.cleanupBlocks.add(htmlBlockId);
      logCustomBlockDebug("toggle.cleanup-html", {
        parentBlockId: element.getAttribute(ATTRIBUTES.NODE_ID),
        htmlBlockId,
      });

      void deleteBlock(htmlBlockId)
        .catch((error) => {
          console.error("[custom-block] cleanup toggle html block failed", error);
          logCustomBlockDebug("toggle.cleanup-html.error", {
            htmlBlockId,
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          this.cleanupBlocks.delete(htmlBlockId);
        });
    });
  }

  private isInjectedToggleHtmlBlock(element: HTMLElement): boolean {
    if (element.getAttribute(ATTRIBUTES.DATA_TYPE) !== "NodeHTMLBlock") {
      return false;
    }

    const protyleHtml = element.querySelector("protyle-html");
    const rawContent = protyleHtml?.getAttribute("data-content") || "";

    return rawContent.includes(CSS_CLASSES.TOGGLE.BUTTON);
  }
}
