import type { ViewMode } from "../view-config-schema";

export function currentNativeView(header: HTMLElement): string {
  return header.dataset.currentViewId ||
    header.querySelector<HTMLElement>(".layout-tab-bar .item--focus")?.dataset.id || "";
}

interface HostListener {
  scan(): void;
  changed(av: HTMLElement): void;
  theme(): void;
}
interface Attachment {
  av: HTMLElement;
  blockId: string;
  avID: string;
  viewId: string;
  kind: ViewMode;
  host: HTMLElement;
  frame: HTMLIFrameElement;
  revision: number;
}

/** One observer and one frame registry for all native database renderers.
 * Renderer-specific mounting policies (map controls, calendar IME grace) stay
 * with their renderer; native identity and asynchronous validity live here.
 */
export class DatabaseViewHost {
  private listeners = new Set<HostListener>();
  private observer: MutationObserver | null = null;
  private frames = new Map<HTMLIFrameElement, Attachment>();
  private readonly onStylesheetLoad = (event: Event) => {
    if ((event.target as Element)?.matches?.('link[rel="stylesheet"]')) {
      for (const listener of this.listeners) listener.theme();
    }
  };

  subscribe(listener: HostListener): () => void {
    this.listeners.add(listener);
    if (!this.observer) {
      this.observer = new MutationObserver(changes => this.observe(changes));
      // Native SiYuan AV view switches can update only the selected tab's
      // class and the header's current-view ID. Without attribute listening,
      // no scan occurs until a later document navigation replaces the DOM.
      this.observer.observe(document.body, { childList: true, characterData: true,
        subtree: true, attributes: true,
        attributeFilter: ["class", "data-current-view-id"] });
      this.observer.observe(document.documentElement, { attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-theme-mode", "data-light-theme", "data-dark-theme"] });
      this.observer.observe(document.head, { childList: true, characterData: true, subtree: true,
        attributes: true, attributeFilter: ["href", "media", "disabled"] });
      document.head.addEventListener("load", this.onStylesheetLoad, true);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.observer?.disconnect();
      this.observer = null;
      document.head.removeEventListener("load", this.onStylesheetLoad, true);
    };
  }

  private observe(changes: MutationRecord[]): void {
    let scan = false;
    let theme = false;
    const changed = new Set<HTMLElement>();
    for (const change of changes) {
      const node = change.target;
      const element = node.nodeType === 1 ? node as Element : node.parentElement;
      if (!element) continue;
      if (element === document.documentElement || element.closest("head")) {
        theme = true;
        continue;
      }
      if (element.closest(".dodo-av-visual-host, .dodo-av-map-host, .dodo-av-view-picker, .dodo-av-view-settings, .dodo-av-map-settings")) continue;
      const av = element.closest<HTMLElement>(".av[data-av-id]");
      if (av) {
        if (change.type === "attributes") {
          // Filtering avoids rescanning the entire database on every card
          // hover, row selection, renderer class or native button update.
          const activeTab = change.attributeName === "class" &&
            element.matches(".layout-tab-bar .item");
          const activeHeader = change.attributeName === "data-current-view-id" &&
            element.matches(".av__header");
          if (!activeTab && !activeHeader) continue;
        }
        scan = true;
        if (element.closest(".av__scroll, .av__header") ||
            change.type === "attributes" ||
            (change.type === "childList" && (element === av || element.classList.contains("av__container")))) {
          changed.add(av);
        }
      } else if ([...change.addedNodes, ...change.removedNodes].some(child => child.nodeType === 1 &&
          ((child as Element).matches(".av, .dodo-av-visual-host, .dodo-av-map-host") ||
           (child as Element).querySelector(".av, .dodo-av-visual-host, .dodo-av-map-host")))) {
        scan = true;
      }
    }
    for (const listener of this.listeners) {
      if (theme) listener.theme();
      for (const av of changed) listener.changed(av);
      if (scan) listener.scan();
    }
  }

  track(av: HTMLElement, viewId: string, kind: ViewMode, host: HTMLElement, frame: HTMLIFrameElement): void {
    const previous = this.frames.get(frame);
    if (previous && previous.viewId === viewId && previous.kind === kind &&
        previous.blockId === av.dataset.nodeId && previous.avID === av.dataset.avId) {
      previous.av = av;
      previous.host = host;
      return;
    }
    this.frames.set(frame, { av, blockId: av.dataset.nodeId || "", avID: av.dataset.avId || "",
      viewId, kind, host, frame, revision: 0 });
  }

  untrack(frame: HTMLIFrameElement): void {
    this.frames.delete(frame);
  }

  fromSource(source: MessageEventSource | null, kind?: ViewMode): Attachment | null {
    if (!source) return null;
    for (const attachment of this.frames.values()) {
      if (source === attachment.frame.contentWindow && (!kind || attachment.kind === kind) &&
          this.isLive(attachment)) return attachment;
    }
    return null;
  }

  private isLive(attachment: Attachment): boolean {
    const { av, frame, host, blockId, avID, viewId } = attachment;
    const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
    const tab = header?.querySelector<HTMLElement>(`.layout-tab-bar .item[data-id="${viewId}"]`);
    return av.isConnected && frame.isConnected && host.isConnected &&
      av.dataset.nodeId === blockId && av.dataset.avId === avID &&
      (!tab?.dataset.avType || tab.dataset.avType === "table") &&
      Boolean(header && currentNativeView(header) === viewId);
  }

  /** A ticket belongs to a frame instance, not a shared block/view config. */
  beginRead(frame: HTMLIFrameElement): () => boolean {
    const attachment = this.frames.get(frame);
    if (!attachment) return () => false;
    const revision = ++attachment.revision;
    const source = frame.contentWindow;
    return () => this.frames.get(frame) === attachment && attachment.revision === revision &&
      frame.contentWindow === source && this.isLive(attachment);
  }

  invalidateBlock(blockId: string): void {
    for (const attachment of this.frames.values()) {
      if (attachment.blockId === blockId) attachment.revision++;
    }
  }

  invalidate(blockId: string, viewId: string): void {
    for (const attachment of this.frames.values()) {
      if (attachment.blockId === blockId && attachment.viewId === viewId) attachment.revision++;
    }
  }
}

export const databaseViewHost = new DatabaseViewHost();
