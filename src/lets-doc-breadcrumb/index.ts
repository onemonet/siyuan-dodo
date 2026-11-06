import { lsNotebooks, sql } from "@/api";
import { settings } from "@/settings";
import { SubPlugin } from "@/types/plugin";
import { getCurrentDoc, openBlockByID } from "@/myscripts/syUtils";
import { getActiveEditor } from "siyuan";

const STYLE_ID = "dodo-doc-breadcrumb-style";
const CONTAINER_CLASS = "dodo-doc-breadcrumb";
const ITEM_CLASS = "dodo-doc-breadcrumb__item";
const SEP_CLASS = "dodo-doc-breadcrumb__sep";

export default class DocBreadcrumbPlugin implements SubPlugin {
  private refreshTimer: number | null = null;
  private layoutSyncFrame: number | null = null;
  private layoutSyncTimers: number[] = [];
  private titleResizeObserver: ResizeObserver | null = null;
  private titleMutationObserver: MutationObserver | null = null;
  private observedTitleElement: HTMLElement | null = null;
  private notebookNameCache: Map<string, string> = new Map();
  private resizeHandler = () => this.scheduleRefresh();
  private layoutTransitionHandler = (event: TransitionEvent) => {
    const titleElement = this.observedTitleElement;
    const target = event.target;
    if (!titleElement || !(target instanceof HTMLElement)) {
      return;
    }

    if (!titleElement.contains(target) && !target.contains(titleElement)) {
      return;
    }

    this.scheduleLayoutSyncSettled();
  };
  private pendingTrail:
    | {
        notebookId: string;
        pathIds: string[];
        targetId: string;
        expiresAt: number;
      }
    | null = null;

  onload(): void {
    this.ensureStyle();
    window.addEventListener("resize", this.resizeHandler);
    document.addEventListener("transitionend", this.layoutTransitionHandler, true);
  }

  async onLayoutReady(): Promise<void> {
    this.scheduleRefresh();
  }

  onunload(): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.disconnectTitleLayoutObservers();
    window.removeEventListener("resize", this.resizeHandler);
    document.removeEventListener("transitionend", this.layoutTransitionHandler, true);
    document.getElementById(STYLE_ID)?.remove();
    document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((node) => node.remove());
  }

  onProtyleLoaded(event: any): void {
    this.scheduleRefresh(event?.detail?.protyle);
  }

  switchProtyleEvent({ detail }: any): void {
    this.scheduleRefresh(detail?.protyle);
  }

  private scheduleRefresh(protyle?: any): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refresh(protyle).catch((error) => {
        console.error("[doc-breadcrumb] refresh failed", error);
      });
    }, 80);
  }

  private async refresh(preferredProtyle?: any): Promise<void> {
    const currentDoc = getCurrentDoc() as
      | { id: string; path: string; notebookId: string }
      | null;
    const activeEditor = getActiveEditor(false);
    const protyle = preferredProtyle ?? activeEditor?.protyle;
    if (!currentDoc || !protyle?.element || !currentDoc.path) {
      this.disconnectTitleLayoutObservers();
      return;
    }

    const titleElement = this.getMountHost(protyle.element as HTMLElement);
    if (!titleElement) {
      this.disconnectTitleLayoutObservers();
      return;
    }

    titleElement.parentElement?.querySelectorAll(`:scope > .${CONTAINER_CLASS}`).forEach((node) => {
      if (node !== titleElement.nextElementSibling) {
        node.remove();
      }
    });

    const container = titleElement.parentElement?.querySelector(`:scope > .${CONTAINER_CLASS}[data-doc-id="${currentDoc.id}"]`) as HTMLElement | null;
    const breadcrumb = await this.buildBreadcrumb(currentDoc);
    this.syncLayoutFromTitle(breadcrumb, titleElement);
    const previous = titleElement.parentElement?.querySelector(`:scope > .${CONTAINER_CLASS}`) as HTMLElement | null;

    if (container) {
      container.replaceWith(breadcrumb);
    } else if (previous) {
      previous.replaceWith(breadcrumb);
    } else {
      titleElement.insertAdjacentElement("afterend", breadcrumb);
    }

    this.observeTitleLayout(titleElement);
  }

  private getMountHost(protyleElement: HTMLElement): HTMLElement | null {
    return protyleElement.querySelector(".protyle-title") as HTMLElement | null;
  }

  private syncLayoutFromTitle(container: HTMLElement, titleElement: HTMLElement): void {
    const computed = window.getComputedStyle(titleElement);
    container.style.boxSizing = computed.boxSizing;
    container.style.width = computed.width;
    container.style.maxWidth = computed.maxWidth;
    container.style.marginLeft = computed.marginLeft;
    container.style.marginRight = computed.marginRight;
    container.style.paddingLeft = computed.paddingLeft;
    container.style.paddingRight = computed.paddingRight;
  }

  private observeTitleLayout(titleElement: HTMLElement): void {
    if (this.observedTitleElement === titleElement) {
      this.scheduleLayoutSync();
      return;
    }

    this.disconnectTitleLayoutObservers();
    this.observedTitleElement = titleElement;
    const layoutElements = this.getTitleLayoutElements(titleElement);

    if (typeof ResizeObserver !== "undefined") {
      this.titleResizeObserver = new ResizeObserver(() => {
        this.scheduleLayoutSyncSettled();
      });
      layoutElements.forEach((element) => this.titleResizeObserver?.observe(element));
    }

    if (typeof MutationObserver !== "undefined") {
      this.titleMutationObserver = new MutationObserver(() => {
        this.scheduleLayoutSyncSettled();
      });
      this.titleMutationObserver.observe(titleElement, {
        attributes: true,
        attributeFilter: ["class", "style"],
        subtree: true,
      });
      layoutElements
        .filter((element) => element !== titleElement)
        .forEach((element) => {
          this.titleMutationObserver?.observe(element, {
            attributes: true,
            attributeFilter: ["class", "style"],
          });
        });
      if (titleElement.parentElement) {
        this.titleMutationObserver.observe(titleElement.parentElement, {
          attributes: true,
          attributeFilter: ["class", "style"],
          childList: true,
        });
      }
    }

    this.scheduleLayoutSyncSettled();
  }

  private disconnectTitleLayoutObservers(): void {
    this.titleResizeObserver?.disconnect();
    this.titleResizeObserver = null;
    this.titleMutationObserver?.disconnect();
    this.titleMutationObserver = null;
    this.observedTitleElement = null;

    if (this.layoutSyncFrame !== null) {
      window.cancelAnimationFrame(this.layoutSyncFrame);
      this.layoutSyncFrame = null;
    }
    this.clearLayoutSyncTimers();
  }

  private getTitleLayoutElements(titleElement: HTMLElement): HTMLElement[] {
    const candidates = [
      titleElement,
      titleElement.parentElement,
      titleElement.closest(".protyle-content") as HTMLElement | null,
      titleElement.closest(".protyle") as HTMLElement | null,
      titleElement.closest(".layout__wnd") as HTMLElement | null,
    ];

    return candidates.filter(
      (element, index): element is HTMLElement =>
        Boolean(element) && candidates.indexOf(element) === index
    );
  }

  private scheduleLayoutSync(): void {
    if (!this.observedTitleElement) {
      return;
    }

    if (this.layoutSyncFrame !== null) {
      return;
    }

    this.layoutSyncFrame = window.requestAnimationFrame(() => {
      this.layoutSyncFrame = null;
      this.syncObservedBreadcrumbLayout();
    });
  }

  private scheduleLayoutSyncSettled(): void {
    this.scheduleLayoutSync();
    this.clearLayoutSyncTimers();
    this.queueDelayedLayoutSync(120);
    this.queueDelayedLayoutSync(320);
  }

  private queueDelayedLayoutSync(delay: number): void {
    const timer = window.setTimeout(() => {
      this.layoutSyncTimers = this.layoutSyncTimers.filter((item) => item !== timer);
      this.scheduleLayoutSync();
    }, delay);
    this.layoutSyncTimers.push(timer);
  }

  private clearLayoutSyncTimers(): void {
    this.layoutSyncTimers.forEach((timer) => window.clearTimeout(timer));
    this.layoutSyncTimers = [];
  }

  private syncObservedBreadcrumbLayout(): void {
    const titleElement = this.observedTitleElement;
    if (!titleElement?.isConnected) {
      this.disconnectTitleLayoutObservers();
      this.scheduleRefresh();
      return;
    }

    const breadcrumb = this.getBreadcrumbForTitle(titleElement);
    if (!breadcrumb) {
      this.scheduleRefresh();
      return;
    }

    this.syncLayoutFromTitle(breadcrumb, titleElement);
  }

  private getBreadcrumbForTitle(titleElement: HTMLElement): HTMLElement | null {
    const nextElement = titleElement.nextElementSibling as HTMLElement | null;
    if (nextElement?.classList.contains(CONTAINER_CLASS)) {
      return nextElement;
    }

    return titleElement.parentElement?.querySelector(
      `:scope > .${CONTAINER_CLASS}`
    ) as HTMLElement | null;
  }

  private async buildBreadcrumb(currentDoc: {
    id: string;
    path: string;
    notebookId: string;
  }): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.className = CONTAINER_CLASS;
    container.dataset.docId = currentDoc.id;

    const currentPathIds = currentDoc.path
      .replace(/\.sy$/, "")
      .split("/")
      .filter(Boolean);
    const displayPathIds = this.getDisplayPathIds(
      currentDoc.notebookId,
      currentDoc.id,
      currentPathIds
    );

    const showNotebook =
      settings.getBySpace("docBreadcrumb", "showNotebook") !== false;

    const items: Array<{
      id?: string;
      title: string;
      clickable: boolean;
      stale?: boolean;
    }> = [];

    if (showNotebook) {
      const notebookTitle = await this.getNotebookTitle(currentDoc.notebookId);
      items.push({
        id: undefined,
        title: notebookTitle,
        clickable: false,
      });
    }

    const docs = await this.getDocTitles(displayPathIds);
    displayPathIds.forEach((id, index) => {
      items.push({
        id,
        title: docs.get(id) ?? id,
        clickable: true,
        stale: index >= currentPathIds.length,
      });
    });

    items.forEach((item, index) => {
      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = SEP_CLASS;
        sep.textContent = "/";
        container.appendChild(sep);
      }

      const node = document.createElement(item.clickable ? "button" : "span");
      node.className = ITEM_CLASS;
      node.textContent = item.title;
      node.setAttribute("title", item.title);

      if (item.stale) {
        node.setAttribute("data-stale", "true");
      }

      if (item.clickable && item.id) {
        node.addEventListener("click", () => {
          this.rememberTrailBeforeJump(currentDoc.notebookId, displayPathIds, item.id!);
          openBlockByID(item.id!);
        });
        if (item.id === currentDoc.id) {
          node.setAttribute("aria-current", "page");
        }
      } else {
        node.setAttribute("data-static", "true");
      }

      container.appendChild(node);
    });

    return container;
  }

  private async getNotebookTitle(notebookId: string): Promise<string> {
    if (this.notebookNameCache.has(notebookId)) {
      return this.notebookNameCache.get(notebookId)!;
    }

    const notebooks = await lsNotebooks();
    const notebook = notebooks?.notebooks?.find((item) => item.id === notebookId);
    const title = notebook?.name || "Notebook";
    this.notebookNameCache.set(notebookId, title);
    return title;
  }

  private async getDocTitles(docIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (docIds.length === 0) {
      return result;
    }

    const escapedIds = docIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    const rows = await sql(
      `SELECT id, content FROM blocks WHERE id IN (${escapedIds})`
    );

    rows.forEach((row) => {
      result.set(row.id, this.normalizeTitle(row.content, row.id));
    });

    return result;
  }

  private normalizeTitle(title: string, fallback: string): string {
    const trimmed = (title || "").replace(/\s+/g, " ").trim();
    return trimmed || fallback;
  }

  private getDisplayPathIds(
    notebookId: string,
    currentDocId: string,
    currentPathIds: string[]
  ): string[] {
    const trail = this.pendingTrail;
    const isTrailValid =
      trail &&
      trail.expiresAt > Date.now() &&
      trail.notebookId === notebookId &&
      trail.targetId === currentDocId &&
      trail.pathIds.length > currentPathIds.length &&
      this.isPrefix(currentPathIds, trail.pathIds);

    if (isTrailValid) {
      return trail.pathIds;
    }

    if (trail && trail.expiresAt <= Date.now()) {
      this.pendingTrail = null;
    }

    return currentPathIds;
  }

  private rememberTrailBeforeJump(
    notebookId: string,
    pathIds: string[],
    targetId: string
  ): void {
    this.pendingTrail = {
      notebookId,
      pathIds: [...pathIds],
      targetId,
      expiresAt: Date.now() + 15_000,
    };
  }

  private isPrefix(prefix: string[], full: string[]): boolean {
    if (prefix.length > full.length) {
      return false;
    }

    return prefix.every((item, index) => full[index] === item);
  }

  private ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.${CONTAINER_CLASS} {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 6px 0 10px;
  padding: 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.6;
  box-sizing: border-box;
}

.${ITEM_CLASS} {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  color: inherit;
  cursor: pointer;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.${ITEM_CLASS}[data-static="true"] {
  cursor: default;
  opacity: 0.75;
}

.${ITEM_CLASS}[aria-current="page"] {
  color: var(--b3-theme-on-background);
  font-weight: 600;
}

.${ITEM_CLASS}[data-stale="true"] {
  color: var(--b3-theme-on-surface-light);
  opacity: 0.55;
}

.${ITEM_CLASS}:hover {
  color: var(--b3-theme-primary);
  opacity: 1;
}

.${ITEM_CLASS}[data-static="true"]:hover {
  color: inherit;
}

.${SEP_CLASS} {
  color: var(--b3-theme-on-surface-light);
  opacity: 0.7;
}
`;
    document.head.appendChild(style);
  }
}
