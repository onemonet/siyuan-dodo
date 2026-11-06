import { currentNativeView } from "../core/view-host";

const SIYUAN_ID = /^\d{14}-[a-z0-9]{7}$/;

/** The same database may have several DOM copies (split tabs / background editors).
 * Target selection must never arbitrarily pick the first match. */
export interface CurrentDatabaseTarget {
  av: HTMLElement;
  blockId: string;
  avID: string;
  viewId: string;
  viewName: string;
  search: string;
}

let lastInteracted: {blockId: string; avID: string} | null = null;
let listeners = 0;

function avFromEvent(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const av = target.closest<HTMLElement>(".av[data-av-id][data-node-id]");
  if (av) return av;
  // User-generated HTML lives in a sibling sandbox iframe, not the AV subtree.
  const host = target.closest<HTMLElement>(".dodo-av-visual-host, .dodo-av-map-host");
  const sibling = host?.previousElementSibling;
  return sibling instanceof HTMLElement && sibling.matches(".av[data-av-id][data-node-id]")
    ? sibling : null;
}

function remember(event: Event): void {
  const av = avFromEvent(event.target);
  if (!av) return;
  const blockId = av.dataset.nodeId || "", avID = av.dataset.avId || "";
  if (SIYUAN_ID.test(blockId) && SIYUAN_ID.test(avID))
    lastInteracted = {blockId,avID};
}

/** Capture interactions before the user switches to the SiYuan Agent tab. */
export function startCurrentDatabaseTracking(): () => void {
  listeners++;
  if (listeners === 1) {
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("focusin", remember, true);
  }
  return () => {
    listeners = Math.max(0, listeners - 1);
    if (listeners === 0) {
      document.removeEventListener("pointerdown", remember, true);
      document.removeEventListener("focusin", remember, true);
      lastInteracted = null;
    }
  };
}

export function openedDatabaseTargets(): CurrentDatabaseTarget[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".av[data-av-id][data-node-id]"))
    .flatMap(av => {
      if (!av.isConnected) return [];
      const blockId = av.dataset.nodeId || "", avID = av.dataset.avId || "";
      const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      const viewId = header ? currentNativeView(header) : "";
      if (![blockId,avID,viewId].every(id => SIYUAN_ID.test(id))) return [];
      const tab = header?.querySelector<HTMLElement>(`.layout-tab-bar .item[data-id="${viewId}"]`);
      // A native gallery/kanban is not a table-backed Dodo custom view.
      if (tab?.dataset.avType && tab.dataset.avType !== "table") return [];
      const viewName = tab?.textContent?.trim() || "";
      const search = header?.querySelector<HTMLInputElement>('input[data-type="av-search"]')?.value ||
        header?.querySelector<HTMLElement>('[data-type="av-search"]')?.textContent?.trim() || "";
      return [{av,blockId,avID,viewId,viewName,search}];
    });
}

function isVisible(target: CurrentDatabaseTarget): boolean {
  return target.av.getClientRects().length > 0 &&
    !target.av.closest(".fn__none, [hidden]");
}

function matchesRemembered(target: CurrentDatabaseTarget): boolean {
  return !!lastInteracted && target.blockId === lastInteracted.blockId &&
    target.avID === lastInteracted.avID;
}

function uniqueByIdentity(targets: CurrentDatabaseTarget[]): CurrentDatabaseTarget[] {
  const seen = new Set<string>();
  return targets.filter(item => {
    const key = [item.blockId,item.avID,item.viewId].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Visible active pane > focused AV > last interacted AV > unique open view.
 * A hidden editor is still eligible when the SiYuan Agent tab has focus.
 * Multiple candidates without reliable focus are deliberately ambiguous.
 */
export function currentDatabaseTarget(): CurrentDatabaseTarget {
  const all = openedDatabaseTargets();
  if (!all.length) throw new Error("未找到打开的原生表格数据库。请在思源中打开目标数据库视图。");
  const visible = all.filter(isVisible);
  const focusAv = avFromEvent(document.activeElement);
  const focused = visible.filter(item => item.av === focusAv);
  if (uniqueByIdentity(focused).length === 1) return focused[0];
  const activeWindow = visible.filter(item => !!item.av.closest(".layout__wnd--active"));
  if (uniqueByIdentity(activeWindow).length === 1) return activeWindow[0];
  const recentlyVisible = visible.filter(matchesRemembered);
  if (uniqueByIdentity(recentlyVisible).length === 1) return recentlyVisible[0];
  if (uniqueByIdentity(visible).length === 1) return visible[0];
  if (visible.length > 1)
    throw new Error("同时打开了多个数据库，无法确定要修改哪一张。请先点击目标数据库，再返回 Agent。");

  const recentlyOpened = all.filter(matchesRemembered);
  if (uniqueByIdentity(recentlyOpened).length === 1) return recentlyOpened[0];
  if (uniqueByIdentity(all).length === 1) return all[0];
  throw new Error("已打开多个后台数据库，无法确定目标。请先点击目标数据库标签页，再返回 Agent。");
}
