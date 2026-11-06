import { showMessage } from "siyuan";
import { DatabaseViewConfigStore } from "../view-config-store";
import { databaseViewWrites } from "../core/view-write-coordinator";
import { createCalendarItem, type NewCalendarItem } from "./calendar-create";
import { saveScheduleChange } from "../core/schedule-write";
import type { Mounted } from "../visual/visual-view-service";
import type { CalendarEntry } from "./calendar-model";
import { databaseViewHost } from "../core/view-host";
import { renderAttributeView } from "../../shared/av/kernel-api";
import type { AvRenderData } from "../../shared/av/av-data-adapter";
import { makeCalendarResult, CALENDAR_VIEWS } from "./calendar-model";
import type { VisualRenderBridge, VisualWriteBridge } from "../visual/visual-render-bridge";
const ID = /^\d{14}-[a-z0-9]{7}$/;

export async function renderCalendarView(av: HTMLElement, bridge: VisualRenderBridge): Promise<void> {
    const mounted = bridge.mounted().get(av);
    if (!bridge.enabled('calendar') || !mounted || mounted.kind !== "calendar" ||
        !mounted.frame.isConnected) return;
    const prefix = (av.dataset.nodeId || "") + ":" + mounted.viewId + ":";
    if (Array.from(bridge.calendarSaving).some(key => key.startsWith(prefix))) return;
    const sequence = (mounted.calendarRenderSequence || 0) + 1;
    mounted.calendarRenderSequence = sequence;
    const frameWindow = mounted.frame.contentWindow;
    if (!frameWindow) return;
    const isCurrent = databaseViewHost.beginRead(mounted.frame);
    const send = (payload: Record<string, unknown>) => {
      const live = bridge.liveAv(mounted);
      if (isCurrent() && live && mounted.calendarRenderSequence === sequence &&
          frameWindow === mounted.frame.contentWindow) {
        frameWindow.postMessage({ type: "dodoCalendarData", ...payload }, location.origin);
      }
    };
    try {
      const blockId = av.dataset.nodeId || "";
      const avID = av.dataset.avId || "";
      if (![blockId, avID, mounted.viewId].every(id => ID.test(id)))
        throw new Error("数据库 ID 无效");
      const config = (await bridge.read(blockId))[mounted.viewId]?.calendar || {};
      const raw = await renderAttributeView({
        id: avID, blockID: blockId, viewID: mounted.viewId, pageSize: 100000, query: bridge.search(av),
      }) as AvRenderData;
      if (!raw?.view || !Array.isArray(raw.view.columns) ||
          raw.view.columns.length === 0)
        throw new Error("思源数据库正重新加载，请稍候");
      const result = makeCalendarResult(raw, config);
      if (!isCurrent() || bridge.liveAv(mounted) !== av || mounted.calendarRenderSequence !== sequence ||
          Array.from(bridge.calendarSaving).some(key => key.startsWith(prefix))) return;
      const created = mounted.calendarNewRecord;
      if (created) {
        const hasNativeRow = result.events.some(item =>
          item.title === created.title && item.allDay === created.allDay &&
          item.start.replace("T", " ") === created.start &&
          item.end.replace("T", " ") === created.end);
        if (hasNativeRow || Date.now() >= created.expires) {
          mounted.calendarNewRecord = undefined;
        } else {
          // Appending a detached AV row is asynchronous inside SiYuan:
          // a transient response may still contain the OLD row list (or none).
          // Retry until the new row appears without blanking the calendar.
          if (mounted.calendarSyncTimer === undefined) {
            mounted.calendarSyncTimer = window.setTimeout(() => {
              mounted.calendarSyncTimer = undefined;
              const live = bridge.liveAv(mounted);
              if (live) void renderCalendarView(live, bridge);
            }, 450);
          }
          if (result.events.length === 0 && (mounted.calendarEntries?.size || 0) > 0) {
            send({events: Array.from(mounted.calendarEntries!.values()),
              revision: mounted.calendarRevision || 0, transient: true,
              warning: "新建日程正在同步到思源数据库…"});
            return;
          }
        }
      }
      mounted.calendarMapping = result.mapping;
      mounted.calendarEntries = new Map(result.events.map(item => [item.id, item]));
      mounted.calendarRevision = (mounted.calendarRevision || 0) + 1;
      const style = getComputedStyle(av);
      const theme: Record<string,string> = {};
      for (const name of [
        "--b3-theme-background", "--b3-theme-on-background",
        "--b3-theme-surface", "--b3-theme-on-surface", "--b3-theme-on-surface-light", "--b3-theme-on-surface-lighter",
        "--b3-theme-primary", "--b3-theme-on-primary", "--b3-theme-error",
        "--b3-theme-primary-light", "--b3-theme-primary-lighter", "--b3-theme-primary-lightest",
        "--b3-border-color", "--b3-list-hover", "--b3-list-icon-hover", "--b3-menu-background",
        "--b3-dialog-shadow", "--b3-mask-background", "--b3-av-calendar-background",
        "--b3-card-info-background", "--b3-card-info-color",
      ]) {
        const value = style.getPropertyValue(name).trim();
        theme[name] = value; // Clear overrides absent from the newly selected theme.
      }
      const font = bridge.typography(av);
      theme["--dodo-calendar-font"] = font.fontFamily;
      theme["--dodo-calendar-font-size"] = font.fontSize;
      const appearance = (window as any).siyuan?.config?.appearance;
      const isDark = typeof appearance?.mode === "number" ? appearance.mode === 1 :
        document.documentElement.dataset.themeMode === "dark" || document.documentElement.dataset.theme === "dark";
      send({ events: result.events, warning: result.warning,
        defaultView: CALENDAR_VIEWS.includes(config.defaultView as any)
          ? config.defaultView : "dayGridMonth",
        revision: mounted.calendarRevision, theme, colorScheme: isDark ? "dark" : "light" });
    } catch (error) {
      // A temporary native AV read failure must not erase previously
      // displayed events. A full page refresh already proves the rows exist.
      console.warn("[Dodo 日历] 数据刷新暂时失败", error);
      if (mounted.calendarRenderSequence === sequence) send({
        events: Array.from(mounted.calendarEntries?.values() || []),
        revision: mounted.calendarRevision || 0, transient: true,
        warning: "日历暂时无法读取，已保留原有日程：" +
          (error instanceof Error ? error.message : String(error)),
      });
    }
  
}

export async function saveCalendarCreateView(
    av: HTMLElement, mounted: Mounted,
    message: NewCalendarItem & { requestId: number; revision: number },
  bridge: VisualWriteBridge): Promise<void> {
    let error = "";
    try {
      if (mounted.calendarRevision !== message.revision)
        throw new Error("日历已刷新，请重新提交");
      const blockId = av.dataset.nodeId || "", avID = av.dataset.avId || "";
      if (![blockId, avID, mounted.viewId].every(id => ID.test(id)))
        throw new Error("数据库 ID 无效");
      const current = (await DatabaseViewConfigStore.load(blockId)).views[mounted.viewId];
      if (current?.mode !== "calendar") throw new Error("日历视图已关闭");
      const stored = current.configs.calendar?.fieldMapping;
      if (stored && mounted.calendarMapping &&
          (["title", "start", "end"] as const).some(
            key => (stored[key] || "") !== (mounted.calendarMapping![key] || "")))
        throw new Error("字段绑定已修改，请刷新后再新增");
      const live = bridge.liveAv(mounted);
      const header = live?.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      if (!live || live.dataset.nodeId !== blockId || live.dataset.avId !== avID ||
          !header || bridge.currentView(header) !== mounted.viewId)
        throw new Error("日历视图已经切换");
      await databaseViewWrites.run({
        blockId, viewId: mounted.viewId, kind: "calendar", action: "create",
      }, () => createCalendarItem({ avID, blockId, viewID: mounted.viewId },
        stored || mounted.calendarMapping || {}, message));
      mounted.calendarNewRecord = {
        title: message.title.trim(), start: message.start, end: message.end,
        allDay: message.allDay, expires: Date.now() + 7500,
      };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    if (Array.from(bridge.mounted().values()).includes(mounted) && mounted.frame.contentWindow) {
      mounted.frame.contentWindow.postMessage({
        type: "dodoCalendarCreateResult", requestId: message.requestId,
        success: !error, error,
      }, location.origin);
      if (error) showMessage("日程创建失败：" + error, 6000, "error");
    }
  
}

export async function saveCalendarEditView(
    av: HTMLElement, mounted: Mounted, entry: CalendarEntry,
    message: { id: string; requestId: number; revision: number;
      after: { start_date: string; end_date: string } },
  bridge: VisualWriteBridge): Promise<void> {
    let error = "";
    try {
      if (mounted.calendarRevision !== message.revision ||
          mounted.calendarEntries?.get(message.id) !== entry)
        throw new Error("日程已刷新，请重新拖动");
      const blockId = av.dataset.nodeId || "", avID = av.dataset.avId || "";
      if (![blockId, avID, mounted.viewId].every(id => ID.test(id)))
        throw new Error("数据库 ID 无效");
      const current = (await DatabaseViewConfigStore.load(blockId)).views[mounted.viewId];
      if (current?.mode !== "calendar") throw new Error("日历视图已切换");
      const stored = current.configs.calendar?.fieldMapping;
      if (stored && mounted.calendarMapping &&
          (["title", "start", "end", "color"] as const).some(
            key => (stored[key] || "") !== (mounted.calendarMapping![key] || "")))
        throw new Error("字段映射已修改，请刷新日历再编辑");
      const live = bridge.liveAv(mounted);
      const header = live?.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      if (!live || live.dataset.nodeId !== blockId || live.dataset.avId !== avID ||
          !header || bridge.currentView(header) !== mounted.viewId)
        throw new Error("日历视图已关闭或切换");
      await databaseViewWrites.run({
        blockId, viewId: mounted.viewId, kind: "calendar", action: "dates", itemId: entry.id,
      }, () => saveScheduleChange({ avID, blockId, viewID: mounted.viewId }, {
        fieldMapping: stored || mounted.calendarMapping,
        timeStep: entry.allDay ? 0 : 15,
      }, {
        id: entry.id, kind: "dates", before: entry.before,
        after: { ...entry.before, ...message.after },
      }));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    if (Array.from(bridge.mounted().values()).includes(mounted) && mounted.frame.contentWindow) {
      mounted.frame.contentWindow.postMessage({
        type: "dodoCalendarSaveResult", requestId: message.requestId,
        success: !error, error,
      }, location.origin);
      if (error) showMessage("日历日期保存失败：" + error, 6000, "error");
    }
  
}
