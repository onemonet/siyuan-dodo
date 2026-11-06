import { Menu, showMessage } from "siyuan";
import { databaseViewHost } from "../core/view-host";
import { openMapItem } from "../map/open-map-item";
import type { Mounted } from "../visual/visual-view-service";
import type { CalendarEntry } from "./calendar-model";
import type { NewCalendarItem } from "./calendar-create";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const CALENDAR_MENU_ITEMS = [
  ["dayGridMonth", "月"],
  ["timeGridWeek", "周"],
  ["timeGridDay", "日"],
  ["listWeek", "日程"],
] as const;
export interface CalendarMessageContext {
  running(): boolean;
  mounted(): Map<HTMLElement, Mounted>;
  currentView(header: HTMLElement): string;
  render(av: HTMLElement): Promise<void>;
  saveCreate(av: HTMLElement, mounted: Mounted,
    message: NewCalendarItem & { requestId: number; revision: number }): Promise<void>;
  saveEdit(av: HTMLElement, mounted: Mounted, entry: CalendarEntry,
    message: { id: string; requestId: number; revision: number;
      after: { start_date: string; end_date: string } }): Promise<void>;
  saving: Set<string>;
}
/** Owns the calendar iframe protocol and protects active IME/edit sessions. */
export function createCalendarMessageHandler(ctx: CalendarMessageContext): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (!ctx.running() || event.origin !== location.origin || !databaseViewHost.fromSource(event.source, "calendar")) return;
    const pair = Array.from(ctx.mounted().entries()).find(([, item]) =>
      item.kind === "calendar" && item.frame.contentWindow === event.source);
    if (!pair) return;
    const [av, mounted] = pair;
    const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
    if (!av.isConnected || !mounted.host.isConnected || !header ||
        ctx.currentView(header) !== mounted.viewId) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "dodoCalendarOpenViewMenu") {
      if (!CALENDAR_MENU_ITEMS.some(([id]) => id === msg.view)) return;
      const frame = mounted.frame;
      const button = frame.contentDocument?.querySelector<HTMLButtonElement>(".dodo-calendar-view-menu");
      if (!button || !button.isConnected) return;
      const frameRect = frame.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      if (!frameRect.width || !frameRect.height) return;
      // Translate the iframe button's viewport coordinates into the SiYuan host
      // viewport; the host-native Menu must be outside the clipped iframe.
      const scaleX = frameRect.width / (frame.offsetWidth || frameRect.width);
      const scaleY = frameRect.height / (frame.offsetHeight || frameRect.height);
      const x = frameRect.left + (frame.clientLeft + buttonRect.left) * scaleX;
      const y = frameRect.top + (frame.clientTop + buttonRect.bottom) * scaleY + 4;
      // SiYuan Menu toggles itself when constructed with the same open ID.
      // Calling close() first would erase the ID and immediately reopen it.
      const menu = new Menu("dodo-calendar-view-picker");
      if (menu.isOpen) return;
      for (const [view, label] of CALENDAR_MENU_ITEMS) {
        menu.addItem({
          label, current: msg.view === view, iconHTML: "",
          click: () => {
            // A delayed selection must never affect a detached or switched AV.
            if (!ctx.running() || ctx.mounted().get(av) !== mounted ||
                !frame.isConnected || ctx.currentView(header) !== mounted.viewId) return;
            frame.contentWindow?.postMessage({ type: "dodoCalendarChangeView", view }, location.origin);
          },
        });
      }
      menu.open({ x, y });
      return;
    }
    if (msg.type === "dodoCalendarReady" || msg.type === "dodoCalendarReload") {
      void ctx.render(av);
      return;
    }
    if (msg.type === "dodoCalendarOpenItem") {
      if (typeof msg.id !== "string" || !ID.test(msg.id)) return;
      const entry = mounted.calendarEntries?.get(msg.id);
      if (!entry || (!ID.test(entry.blockId || "") && !ID.test(entry.valueId || ""))) return;
      void openMapItem({ blockId: entry.blockId || "", itemId: entry.id,
        valueId: entry.valueId || "", avID: av.dataset.avId || "",
        databaseBlockID: av.dataset.nodeId || "", title: entry.title }).catch(error => {
        showMessage(error instanceof Error ? error.message : "打开数据库日程失败", 5000, "error");
      });
      return;
    }
    if (msg.type === "dodoCalendarCreate") {
      if (!Number.isSafeInteger(msg.requestId) ||
          !Number.isSafeInteger(msg.revision) ||
          typeof msg.title !== "string" ||
          typeof msg.start !== "string" || typeof msg.end !== "string" ||
          typeof msg.allDay !== "boolean") return;
      const key = (av.dataset.nodeId || "") + ":" + mounted.viewId + ":create";
      if (ctx.saving.has(key)) {
        mounted.frame.contentWindow?.postMessage({
          type: "dodoCalendarCreateResult", requestId: msg.requestId,
          success: false, error: "正在创建另一项日程，请稍后再试",
        }, location.origin);
        return;
      }
      ctx.saving.add(key);
      mounted.calendarGraceUntil = Date.now() + 7500;
      void ctx.saveCreate(av, mounted, msg as {
        requestId: number; revision: number;
      } & NewCalendarItem).finally(() => ctx.saving.delete(key));
      return;
    }
    if (msg.type !== "dodoCalendarEdit") return;
    if (!Number.isSafeInteger(msg.requestId) || !Number.isSafeInteger(msg.revision) ||
        typeof msg.id !== "string" || !ID.test(msg.id) ||
        typeof msg.after?.start_date !== "string" ||
        typeof msg.after?.end_date !== "string") return;
    const entry = mounted.calendarEntries?.get(msg.id);
    if (!entry || !entry.editable) return;
    const key = (av.dataset.nodeId || "") + ":" + mounted.viewId + ":" + msg.id;
    if (ctx.saving.has(key)) {
      mounted.frame.contentWindow?.postMessage({
        type: "dodoCalendarSaveResult", requestId: msg.requestId,
        success: false, error: "该日程的上一项修改仍在保存中",
      }, location.origin);
      return;
    }
    ctx.saving.add(key);
    void ctx.saveEdit(av, mounted, entry, msg).finally(() => ctx.saving.delete(key));
  };
}
