import { DATABASE_VIEW_DEFINITIONS, databaseViewDefinition } from "../view-registry";
import { DatabaseVisualSettings } from "./visual-settings";
import { prepareVisualConfigs, visualAppearance } from "./visual-initializers";
import { visualMountPolicies } from "./visual-mount-policies";
import { visualRenderers } from "./visual-renderers";
import { visualInteractions, type VisualInteractionBridge } from "./visual-interactions";
import { databaseViewHost, currentNativeView } from "../core/view-host";
import { ViewMountLifecycle } from "../core/view-mount-lifecycle";
import { databaseViewWrites } from "../core/view-write-coordinator";
import type { ScheduleMapping } from "../core/schedule-model";
import { Menu, showMessage } from "siyuan";

import { renderAttributeView } from "../../shared/av/kernel-api";
import { adaptAttributeViewRender, type AvRenderData } from "../../shared/av/av-data-adapter";
import { materializeChartFieldBindings } from "../../lets-custom-block/chart/chart-field-initializer";
import { TIMELINE_FIELD_DEFINITIONS, materializeTimelineFieldMapping } from "../../lets-custom-block/timeline/services/field-mapping";
import { type VisualConfig, type VisualKind } from "./visual-types";
import { DatabaseViewConfigStore, activeVisualConfigs, type ViewMode } from "../view-config-store";

import { DatabaseMapViews } from "../map/map-view-service";
import { shouldUseDefaultMapName } from "../map/view-appearance-state";
import { ensureNativeLucideIcon, writeNativeViewAppearance } from "../map/view-appearance";
import type { GanttMapping } from "../gantt/gantt-model";
import { type CalendarEntry } from "../calendar/calendar-model";
import { createCustomApp } from "../custom/storage";
import { createNativeCustomView } from "../custom/native-view-create";
import { customRuntimeReady } from "../custom/renderer";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const ACTIVE = "dodo-av-visual--active";
const PICKER = "dodo-av-view-picker";
const SETTINGS = "dodo-av-view-settings";
const IDLE_DELAY = 400;
export interface Mounted {
  native: HTMLElement;
  host: HTMLDivElement;
  frame: HTMLIFrameElement;
  viewId: string;
  kind: VisualKind;
  search: string;
  ganttMapping?: GanttMapping;
  ganttRevision?: number;
  ganttRenderSequence?: number;
  ganttOpenTargets?: Map<string,{blockId:string;valueId:string;title:string}>;
  calendarEntries?: Map<string,CalendarEntry>;
  calendarMapping?: ScheduleMapping;
  calendarRevision?: number;
  calendarRenderSequence?: number;
  calendarNewRecord?: {title:string;start:string;end:string;allDay:boolean;expires:number};
  calendarSyncTimer?: number;
  calendarGraceUntil?: number;
  customAppId?: string;
  customVersion?: number;
  customRenderSequence?: number;
  customBootFailures?: number;
  resizeObserver?: ResizeObserver;
}

export class DatabaseVisualViews {
  private running = false;
  private unsubscribeHost: (() => void) | null = null;
  private unsubscribeConfig: (() => void) | null = null;
  private unsubscribeWrites: (() => void) | null = null;
  private schedulePending = false;
  private readonly lifecycle = new ViewMountLifecycle<Mounted>(
    entry => entry.frame, (av, entry) => this.cleanupMount(av, entry));
  private mounted = this.lifecycle.entries;
  private cached = new Map<string, Record<string, VisualConfig>>();
  private updating = new Set<string>();
  private refreshing = new Map<HTMLElement, number>();
  private readonly settings = new DatabaseVisualSettings({
    read: blockId => this.read(blockId),
    getAvId: blockId => this.getAvId(blockId),
    mounted: () => this.mounted,
    updated: (blockId, document) => this.cached.set(blockId, activeVisualConfigs(document)),
    scheduleFrame: av => this.scheduleFrame(av),
    isEnabled: kind => this.isKindEnabled(kind),
  });
  private activeMenu: Menu | null = null;
  private ganttSaving = new Set<string>();
  private ganttScaleSaving = new Set<string>();
  private calendarSaving = new Set<string>();
  private readonly rendererBridge: VisualInteractionBridge = {
    mounted: () => this.mounted,
    running: () => this.running,
    read: blockId => this.read(blockId),
    search: av => this.getSearch(av),
    enabled: kind => this.isKindEnabled(kind),
    liveAv: entry => this.liveAvForGantt(entry),
    typography: av => this.ganttTypography(av),
    ganttSaving: this.ganttSaving,
    calendarSaving: this.calendarSaving,
    ganttScaleSaving: this.ganttScaleSaving,
    updated: (blockId, doc) => { this.cached.set(blockId, activeVisualConfigs(doc)); },
    currentView: header => this.currentView(header),
  };
  private readonly messageHandlers = Object.values(visualInteractions)
    .map(factory => factory(this.rendererBridge));

  constructor(
    private readonly mapViews: DatabaseMapViews,
    private readonly isMapEnabled: () => boolean,
    private readonly isChartEnabled: () => boolean = () => true,
    private readonly isTimelineEnabled: () => boolean = () => true,
    private readonly isGanttEnabled: () => boolean = () => true,
    private readonly isCalendarEnabled: () => boolean = () => true,
    private readonly isCustomEnabled: () => boolean = () => true,
  ) {}

  private isKindEnabled(kind: ViewMode): boolean {
    return kind === "table" ||
      (kind === "map" && this.isMapEnabled()) ||
      (kind === "chart" && this.isChartEnabled()) ||
      (kind === "timeline" && this.isTimelineEnabled()) ||
      (kind === "gantt" && this.isGanttEnabled()) ||
      (kind === "calendar" && this.isCalendarEnabled()) ||
      (kind === "custom" && this.isCustomEnabled());
  }

  start(): void {
    if (this.running) { this.refresh(); return; }
    this.running = true;
    this.unsubscribeConfig = DatabaseViewConfigStore.subscribe((blockId, document) => {
      this.cached.set(blockId, activeVisualConfigs(document));
      for (const [av, mounted] of this.mounted) {
        if (av.dataset.nodeId !== blockId) continue;
        databaseViewHost.invalidate(blockId, mounted.viewId);
        this.scheduleFrame(av);
      }
      this.refresh();
    });
    for(const handler of this.messageHandlers) window.addEventListener("message",handler);
    this.unsubscribeWrites = databaseViewWrites.subscribe(event => {
      for (const av of this.mounted.keys()) {
        if (av.dataset.nodeId === event.blockId) this.scheduleFrame(av);
      }
    });
    this.unsubscribeHost = databaseViewHost.subscribe({
      scan: () => this.refresh(),
      changed: av => this.scheduleFrame(av),
      theme: () => this.refreshFrames(),
    });
    this.refresh();
  }

  stop(): void {
    this.running = false;
    for(const handler of this.messageHandlers) window.removeEventListener("message",handler);
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = null;
    this.unsubscribeHost?.();
    this.unsubscribeHost = null;
    this.unsubscribeWrites?.();
    this.unsubscribeWrites = null;
    this.settings.stop();
    this.activeMenu?.close();
    this.activeMenu = null;
    for (const av of Array.from(this.mounted.keys())) this.detach(av);
    document.querySelectorAll(`.${PICKER}`).forEach(node => node.remove());
    document.querySelectorAll(`.${SETTINGS}`).forEach(node => node.remove());
    this.cached.clear(); this.updating.clear();
    this.ganttSaving.clear(); this.ganttScaleSaving.clear(); this.calendarSaving.clear();
  }

  refresh(): void {
    if (!this.running || this.schedulePending) return;
    this.schedulePending = true;
    requestAnimationFrame(() => { this.schedulePending = false; if (this.running) void this.scan(); });
  }

  refreshFrames(): void {
    for (const av of this.mounted.keys()) this.scheduleFrame(av);
  }

  /** Accept navigation only from the currently mounted native timeline iframe. */
  getTimelineFrameContext(source: Window): { blockId: string; avID: string; viewId: string } | null {
    if (!databaseViewHost.fromSource(source, "timeline")) return null;
    for (const [av, mounted] of this.mounted) {
      const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      if (av.isConnected && mounted.host.isConnected && mounted.kind === "timeline" &&
          mounted.frame.contentWindow === source && header && this.currentView(header) === mounted.viewId &&
          ID.test(av.dataset.nodeId || "") && ID.test(av.dataset.avId || "")) {
        return { blockId: av.dataset.nodeId as string, avID: av.dataset.avId as string, viewId: mounted.viewId };
      }
    }
    return null;
  }

  private async read(blockId:string):Promise<Record<string,VisualConfig>>{
 if(this.cached.has(blockId))return this.cached.get(blockId)!;
 const configs=activeVisualConfigs(await DatabaseViewConfigStore.load(blockId));
 if(this.cached.has(blockId))return this.cached.get(blockId)!;
 this.cached.set(blockId,configs);return configs;
}

  private async initializeChartMapping(blockId:string,viewId:string,avID:string):Promise<VisualConfig|undefined>{
 if(!ID.test(avID))return this.cached.get(blockId)?.[viewId];
 const raw=await renderAttributeView({id:avID,blockID:blockId,viewID:viewId,pageSize:1}) as AvRenderData;
 const table=adaptAttributeViewRender(raw);
 const current=activeVisualConfigs(await DatabaseViewConfigStore.load(blockId))[viewId];
 if(current?.kind!=="chart")return current;
 const initialized=materializeChartFieldBindings(table,current.chart||{});
 if(initialized.changed){
  const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
   if(entry.mode!=="chart")throw new Error("图表视图已关闭。");
   return {...entry,configs:{...entry.configs,chart:initialized.config}};
  });
  this.cached.set(blockId,activeVisualConfigs(doc));return activeVisualConfigs(doc)[viewId];
 }return current;
}

  private async initializeTimelineMapping(blockId:string,viewId:string,avID:string):Promise<VisualConfig|undefined>{
 if(!ID.test(avID))return this.cached.get(blockId)?.[viewId];
 const raw=await renderAttributeView({id:avID,blockID:blockId,viewID:viewId,pageSize:1}) as AvRenderData;
 const table=adaptAttributeViewRender(raw);
 const current=activeVisualConfigs(await DatabaseViewConfigStore.load(blockId))[viewId];
 if(current?.kind!=="timeline")return current;
 const initialized=materializeTimelineFieldMapping(table,current.timeline?.fieldMapping||{});
 if(initialized.changed){
  const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
   if(entry.mode!=="timeline")throw new Error("时间线视图已关闭。");
   return {...entry,configs:{...entry.configs,timeline:{...entry.configs.timeline,fieldMapping:initialized.mapping}}};
  });
  this.cached.set(blockId,activeVisualConfigs(doc));return activeVisualConfigs(doc)[viewId];
 }return current;
}

  private currentView(header: HTMLElement): string {
    return currentNativeView(header);
  }

  private async scan(): Promise<void> {
    const databases = Array.from(document.querySelectorAll<HTMLElement>(".av[data-av-id][data-node-id]"));
    for (const av of databases) {
      const blockId = av.dataset.nodeId || "";
      const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      const viewId = header ? this.currentView(header) : "";
      const tab = header?.querySelector<HTMLElement>(`.layout-tab-bar .item[data-id="${viewId}"]`);
      // SiYuan may briefly recreate the AV view tab during a cell write.
      // Only an explicit non-table type is a real reason to unmount; a
      // missing tab while the same viewID remains selected is transient.
      if (!ID.test(blockId) || !ID.test(viewId) ||
          (tab?.dataset.avType && tab.dataset.avType !== "table")) {
        const mounted = this.mounted.get(av);
        // A missing header is a native DOM rebuild, even before a save.
        // Keep the iframe and IME draft until the header is restored;
        // an explicit switch to another view still detaches normally.
        if (ID.test(blockId) && !viewId && mounted?.kind === "calendar" &&
            mounted.host.isConnected) {
          continue;
        }
        this.detach(av);
        continue;
      }
      let config: VisualConfig | undefined;
      try { config = (await this.read(blockId))[viewId]; }
      catch (error) { console.warn("[Dodo 数据库可视化] 配置读取失败", error); continue; }
      if (!this.running || !av.isConnected || !header?.isConnected || this.currentView(header) !== viewId) continue;
      if (config?.kind === "chart" && this.isChartEnabled() && config.enabled !== false &&
          (!Object.prototype.hasOwnProperty.call(config.chart?.x || {}, "column") ||
           !Object.prototype.hasOwnProperty.call(config.chart?.y || {}, "column"))) {
        try { config = await this.initializeChartMapping(blockId, viewId, av.dataset.avId || ""); }
        catch (error) { console.warn("[Dodo 图表] 初次字段绑定失败", error); }
      }
      if (config?.kind === "timeline" && this.isTimelineEnabled() && config.enabled !== false &&
          TIMELINE_FIELD_DEFINITIONS.some(field => !Object.prototype.hasOwnProperty.call(config?.timeline?.fieldMapping || {}, field.key))) {
        try { config = await this.initializeTimelineMapping(blockId, viewId, av.dataset.avId || ""); }
        catch (error) { console.warn("[Dodo 时间线] 初次映射存储失败", error); }
      }
      // Field initialization may await a native read/write while the user switches views.
      if (!this.running || !av.isConnected ||
          av.querySelector(":scope > .av__container > .av__header") !== header ||
          this.currentView(header) !== viewId) continue;
      this.ensurePicker(av, header, blockId);
      if (av.classList.contains("dodo-av-map--active")) { this.detach(av); continue; }
      // Disabling an extension only suspends its renderer. Keep the viewID
      // and per-type configuration unchanged in custom-dodo-views.
      const active = config?.enabled !== false && config?.kind && this.isKindEnabled(config.kind)
        ? config.kind : undefined;
      if (config && active) this.attach(av, blockId, viewId, config.kind);
      else this.detach(av);
      this.ensureSettingsButton(av, header, blockId, active);
    }
    for (const av of Array.from(this.mounted.keys())) {
      if (av.isConnected && databases.includes(av)) continue;
      const mounted = this.mounted.get(av);
      if (mounted?.kind === "calendar" && mounted.host.isConnected &&
          Date.now() < (mounted.calendarGraceUntil || 0)) {
        // Allow the new native AV element to adopt this iframe on next scan.
        window.setTimeout(() => this.refresh(), 300);
        continue;
      }
      this.detach(av);
    }
  }

  /** A single entry in the leftmost AV toolbar position, with native SiYuan menu items. */
  private ensurePicker(av: HTMLElement, header: HTMLElement, blockId: string): void {
    const tools = header.querySelector<HTMLElement>(".av__views");
    if (!tools) return;
    if (!this.isMapEnabled() && !this.isChartEnabled() &&
        !this.isTimelineEnabled() && !this.isGanttEnabled() && !this.isCalendarEnabled() && !this.isCustomEnabled()) {
      tools.querySelector<HTMLButtonElement>("." + PICKER)?.remove();
      tools.querySelector<HTMLButtonElement>("." + SETTINGS)?.remove();
      return;
    }
    const filterButton = tools.querySelector<HTMLElement>(':scope > [data-type="av-filter"]');
    if (!filterButton) return;
    // The native filter is in the right-hand toolbar after the flex spacer.
    // Reposition an existing picker too, e.g. after SiYuan rebuilds its AV header.
    const existing = tools.querySelector<HTMLButtonElement>(`:scope > .${PICKER}`);
    const settings = tools.querySelector<HTMLButtonElement>(`:scope > .${SETTINGS}`);
    if (existing) {
      if (existing.nextElementSibling !== (settings || filterButton))
        tools.insertBefore(existing, settings || filterButton);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `block__icon block__icon--show ${PICKER}`;
    button.title = "Dodo：选择数据库展示方式";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = '<svg class="dodo-av-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><svg class="dodo-av-picker-chevron"><use xlink:href="#iconDown"></use></svg>';
    button.addEventListener("click", event => {
      event.stopPropagation(); event.preventDefault();
      const selectedHeader = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      const viewId = selectedHeader && this.currentView(selectedHeader);
      if (viewId) void this.openPicker(button, blockId, viewId);
    });
    // Immediately left of the native Filter button (right-hand AV toolbar).
    tools.insertBefore(button, filterButton);
  }

  /** Current custom view's settings live beside the view-type picker, never over the iframe. */
  private ensureSettingsButton(av:HTMLElement,header:HTMLElement,blockId:string,kind?:VisualKind):void {
    const tools=header.querySelector<HTMLElement>(".av__views");
    const picker=tools?.querySelector<HTMLButtonElement>(`:scope > .${PICKER}`);
    let button=tools?.querySelector<HTMLButtonElement>(`:scope > .${SETTINGS}`);
    if(!tools || !picker || !kind){button?.remove();return;}
    if(!button){
      button=document.createElement("button");button.type="button";
      button.className=`block__icon block__icon--show ${SETTINGS}`;
      button.innerHTML='<svg><use xlink:href="#iconSettings"></use></svg>';
      button.addEventListener("click",event=>{
        event.preventDefault();event.stopPropagation();
        const currentHeader=av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
        const viewId=currentHeader && this.currentView(currentHeader);
        if(viewId)void this.openSettings(blockId,viewId);
      });
    }
    const label=databaseViewDefinition(kind).label+"视图设置";
    if(button.title!==label){button.title=label;button.setAttribute("aria-label",label);}
    if(button.previousElementSibling!==picker)picker.after(button);
  }

  private async openPicker(button:HTMLButtonElement,blockId:string,viewId:string):Promise<void>{
 try{
  const data=await DatabaseViewConfigStore.load(blockId);
  const active=data.views[viewId]?.mode||"table";
  this.activeMenu?.close();
  const menu=new Menu("dodo-db-view-picker");this.activeMenu=menu;
  const icon=(paths:string)=>"<svg class=\"b3-menu__icon dodo-db-view-menu-icon\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">"+paths+"</svg>";
  for(const item of DATABASE_VIEW_DEFINITIONS){
   menu.addItem({label:item.label,iconHTML:icon(item.icon),current:active===item.id,
    disabled:!this.isKindEnabled(item.id),
    click:()=>{void this.switchMode(blockId,viewId,active,item.id);}});
  }
  const rect=button.getBoundingClientRect();menu.open({x:rect.left,y:rect.bottom+4});
 }catch(error){showMessage("无法打开自定义视图菜单："+(error instanceof Error?error.message:String(error)),5000,"error");}
}

  private async switchMode(blockId:string,viewId:string,previous:ViewMode,next:ViewMode):Promise<void>{
  if(previous===next)return;
  databaseViewHost.invalidate(blockId, viewId);
  if(!this.isKindEnabled(next)) {
    showMessage("该视图类型已在插件配置中关闭。", 4000, "error");
    return;
  }
  try {
    // A single view can have exactly one active mode. Historical per-mode
    // configs stay on the same view entry even when it returns to table.
    if(previous==="map") {
      const data=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>({...entry,mode:"table"}));
      this.cached.set(blockId,activeVisualConfigs(data));
      this.mapViews.invalidate(blockId);
    }
    if(next==="map"){
      if(previous==="chart"||previous==="timeline"||previous==="gantt"||previous==="calendar"||previous==="custom"){
        const data=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>({...entry,mode:"table"}));
        this.cached.set(blockId,activeVisualConfigs(data));
      }
      this.mapViews.invalidate(blockId);
      if(!(await this.mapViews.toggleView(blockId,viewId)))return;
    }else if(next==="table"){
      if(previous!=="map"){
        const data=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>({...entry,mode:"table"}));
        this.cached.set(blockId,activeVisualConfigs(data));
      }
    }else {
      if(!(await this.toggleView(blockId,viewId,next)))return;
    }
    this.mapViews.invalidate(blockId);
    this.mapViews.refresh();
    this.refresh();
  }catch(error){
    showMessage("切换视图失败："+(error instanceof Error?error.message:String(error)),5000,"error");
  }
}
  private attach(av: HTMLElement, blockId: string, viewId: string, kind: VisualKind): void {
    const native = av.querySelector<HTMLElement>(":scope > .av__container > .av__scroll");
    if (!native) return;
    const policy = visualMountPolicies[kind];
    this.lifecycle.reconcile(av, {
      viewId, kind, frame: entry => entry.frame,
      adopt: entries => {
        if (!policy.outsideAv) return;
        return Array.from(entries.entries()).find(([oldAv, entry]) =>
          oldAv !== av && !oldAv.isConnected && entry.kind === kind &&
          oldAv.dataset.nodeId === blockId && oldAv.dataset.avId === av.dataset.avId &&
          entry.viewId === viewId && entry.host.isConnected);
      },
      adopted: oldAv => {
        const timer = this.refreshing.get(oldAv);
        if (timer !== undefined) clearTimeout(timer);
        this.refreshing.delete(oldAv);
        this.scheduleFrame(av);
      },
      reusable: current => current.viewId === viewId && current.kind === kind && current.host.isConnected,
      update: current => {
      current.native=native;
      native.style.display = "none"; av.classList.add(ACTIVE);
      av.classList.toggle("dodo-av-visual--chart", kind === "chart");
      av.classList.toggle("dodo-av-visual--gantt", kind === "gantt");
       av.classList.toggle("dodo-av-visual--custom", kind === "custom");
       av.classList.toggle("dodo-av-visual--calendar", kind === "calendar");
      // Moving an iframe between DOM parents may reload it in Chromium.
      // During ordinary AV cell updates the sibling stays put.
      if(current.host.previousElementSibling!==av)av.after(current.host);
      if (!policy.outsideAv || kind === "custom" || kind === "timeline") current.frame.style.height =
        policy.height(this.cached.get(blockId)?.[viewId]);
      const search = this.getSearch(av);
      if (current.search !== search) { current.search = search; this.scheduleFrame(av); }
      },
      create: () => {
    const host = document.createElement("div");
    host.className = "dodo-av-visual-host";
    host.contentEditable = "false";
    const frame = document.createElement("iframe");
    frame.title = "Dodo 数据库" + databaseViewDefinition(kind).label + "视图";
    frame.className = "dodo-av-visual-frame";
     // User-selected unrestricted HTML runs as a normal same-origin iframe.
     // Do NOT set iframe.sandbox or inject a CSP in its srcdoc.
    frame.style.cssText = "width:100%;height:520px;border:0;display:block;";
    frame.style.height = policy.height(this.cached.get(blockId)?.[viewId]);
    frame.src = policy.url({blockId, viewId, avID: av.dataset.avId || "", search: this.getSearch(av)});
    host.append(frame);
    native.style.display = "none"; av.classList.add(ACTIVE);
    av.classList.toggle("dodo-av-visual--chart", kind === "chart");
    av.classList.toggle("dodo-av-visual--gantt", kind === "gantt");
       av.classList.toggle("dodo-av-visual--custom", kind === "custom");
       av.classList.toggle("dodo-av-visual--calendar", kind === "calendar");
    // Keep the Gantt iframe *outside* SiYuan's replaceable AV subtree.
    // SiYuan rebuilds .av__scroll and sometimes the complete .av after
    // write operations; iframe siblings survive both without reloading.
    if(policy.outsideAv) av.after(host);
    else native.after(host);
    const entry: Mounted = { native, host, frame, viewId, kind, search: this.getSearch(av) };
    if (policy.loaded) frame.onload = () => {
      const active = Array.from(this.mounted.entries()).find(([, value]) => value.frame === frame);
      if (!active) return;
      const [currentAv, mounted] = active;
      // srcdoc fires an iframe 'load' event too. The ready HTML has already
      // initialized itself; rendering again here causes an immediate redundant
      // dodoCustomRefresh. A blank reload after DOM reparenting, by contrast,
      // must be hydrated even when appId/version have not changed.
      if (kind === "custom") {
        if (customRuntimeReady(frame)) {
          mounted.customBootFailures = 0;
          return;
        }
        // Do not reload a deliberately rendered error document forever.
        if (frame.contentDocument?.querySelector("[data-dodo-custom-error]")) return;
        mounted.customBootFailures = (mounted.customBootFailures || 0) + 1;
        if (mounted.customBootFailures > 2) {
          frame.srcdoc = "<!doctype html><html><head><meta charset='utf-8'></head>" +
            "<body style='padding:20px;font:14px system-ui;color:#ad3434' data-dodo-custom-error>" +
            "<h3>自定义视图初始化失败</h3><p>HTML 运行时未能启动。请检查控制台日志或重新加载插件。</p>" +
            "</body></html>";
          console.warn("[Dodo 自定义视图] iframe 运行时多次初始化失败，已停止重试");
          return;
        }
      }
      policy.loaded?.(mounted, () => { void this.renderers[kind](currentAv); });
    };

    return entry;
      },
    });
    const live = this.mounted.get(av);
    if (kind === "custom" && live && !live.customVersion) this.scheduleFrame(av);
  }

  private detach(av: HTMLElement): void { this.lifecycle.detach(av); }

  private cleanupMount(av: HTMLElement, current: Mounted | undefined): void {
    av.classList.remove(ACTIVE, "dodo-av-visual--chart", "dodo-av-visual--gantt", "dodo-av-visual--calendar", "dodo-av-visual--custom");
    av.querySelector(`:scope > .av__container > .av__header .${SETTINGS}`)?.remove();
    const timer = this.refreshing.get(av);
    if (timer !== undefined) clearTimeout(timer);
    this.refreshing.delete(av);
    if (!current) return;
    current.resizeObserver?.disconnect();
    if (current.calendarSyncTimer !== undefined) clearTimeout(current.calendarSyncTimer);
    current.native.style.removeProperty("display");
  }

  private getSearch(av: HTMLElement): string {
    return av.querySelector<HTMLElement>('.av__header [data-type="av-search"]')?.textContent?.trim() || "";
  }

  private readonly renderers: Record<VisualKind, (av: HTMLElement) => void | Promise<void>> =
    Object.fromEntries(Object.entries(visualRenderers).map(([kind, render]) =>
      [kind, (av: HTMLElement) => render(av, this.rendererBridge)])) as
      Record<VisualKind, (av: HTMLElement) => void | Promise<void>>;

  private scheduleFrame(av: HTMLElement): void {
    if (!this.running || !this.mounted.has(av)) return;
    const old = this.refreshing.get(av);
    if (old !== undefined) clearTimeout(old);
    this.refreshing.set(av, window.setTimeout(() => {
      this.refreshing.delete(av);
      const item = this.mounted.get(av);
      if (!item?.frame.isConnected) return;
      void this.renderers[item.kind](av);
    }, IDLE_DELAY));
  }

  /** Read the native AV item's *computed* text style (87.5% of editor font).
   * An iframe does not inherit SiYuan's editor font/theme CSS variables. */
  private ganttTypography(av:HTMLElement):Record<"fontFamily"|"fontSize"|"fontWeight"|"color",string> {
    const row=av.querySelector<HTMLElement>(
      ".av__row:not(.av__row--header):not(.av__row--footer):not(.av__row--util)");
    const item=row?.querySelector<HTMLElement>(
      ".av__cell[data-dtype='block'] .av__celltext, .av__celltext, .av__cell");
    const style=getComputedStyle(item||row||av);
    // For empty/paginated tables, recreate SiYuan's .av__row {font-size:87.5%}.
    const editorFont=parseFloat(getComputedStyle(av).fontSize)||16;
    return {fontFamily:style.fontFamily,
      fontSize:row?style.fontSize:(editorFont*.875)+"px",
      fontWeight:style.fontWeight,color:style.color};
  }

  /** Find the currently adopted AV node for a stable mounted iframe. */
  private liveAvForGantt(mounted:Mounted):HTMLElement|null {
    for(const [av,entry] of this.mounted)
      if(entry===mounted && av.isConnected && mounted.host.isConnected)
        return av;
    return null;
  }

  async toggleView(blockId:string,viewId:string,kind:VisualKind):Promise<boolean>{
    if(!this.isKindEnabled(kind))return false;
    const key=blockId+":"+viewId;
    if(this.updating.has(key))return false;
    this.updating.add(key);
    try{
      const prior=(await DatabaseViewConfigStore.load(blockId)).views[viewId];
      if(prior?.mode==="map")throw new Error("当前是地图视图，请先切回表格。");
      const initial=prior?.mode!==kind;
      let raw: AvRenderData|undefined;
      if(initial)raw=await renderAttributeView({
        id:await this.getAvId(blockId),blockID:blockId,viewID:viewId,pageSize:1,
      }) as AvRenderData;
      const prepared=prepareVisualConfigs(kind,prior?.configs||{},raw);
      if (kind === "custom" && !prior?.configs?.custom?.appId) {
        const app = await createCustomApp();
        prepared.custom = { appId: app.manifest.id, height: 650, allowWrites: false };
      }
      let appearance:{previous:{name:string;icon:string};next:{name:string;icon:string}}|null=null;
      if(raw&&!prior?.appearance?.initialized){
        const v=(raw as unknown as {views?:Array<{id:string;name:string;icon:string}>})
          .views?.find(v=>v.id===viewId);
        if(!v)throw new Error("无法获取数据库视图元数据。");
        const previous={name:v.name||"",icon:v.icon||""};
        const definition=visualAppearance[kind];
        let icon=previous.icon;
        if(!icon){
          try{icon=await ensureNativeLucideIcon(definition.iconFile,definition.iconSvg);}
          catch(error){console.warn(error);icon=definition.fallback;}
        }
        appearance={previous,next:{
          name:shouldUseDefaultMapName(previous.name)?definition.name:previous.name,icon,
        }};
      }
      const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>({
        ...entry,mode:entry.mode===kind?"table":kind,
        configs:{...entry.configs,...prepared},
        appearance:{...entry.appearance,initialized:entry.appearance?.initialized||!!appearance},
      }));
      this.cached.set(blockId,activeVisualConfigs(doc));
      this.refresh();
      if(appearance){
        try{await writeNativeViewAppearance(await this.getAvId(blockId),blockId,viewId,appearance.previous,appearance.next);}
        catch(error){console.warn(error);showMessage("视图已启用，但图标或名称未更新。",5000);}
      }
      return true;
    }catch(error){
      showMessage("切换视图失败："+(error instanceof Error?error.message:String(error)),6000,"error");
      return false;
    }finally{this.updating.delete(key);}
  }

  /**
   * Agent CREATE must never call toggleView on an existing non-custom view.
   * First add a separate native SiYuan tab, then configure only the new ID.
   * An already-custom active view is an edit, so retain its appId.
   */
  async ensureCustomViewForAgent(blockId:string,viewId:string,avID:string):Promise<string> {
    if (!this.running || !this.isCustomEnabled())
      throw new Error("AI 自定义视图功能尚未启用。");
    const isStillCurrent = () => Array.from(document.querySelectorAll<HTMLElement>(
      ".av[data-av-id][data-node-id]")).some(item => {
        if (!item.isConnected || item.dataset.nodeId !== blockId || item.dataset.avId !== avID) return false;
        const header = item.querySelector<HTMLElement>(":scope > .av__container > .av__header");
        return !!header && this.currentView(header) === viewId;
      });
    if (!isStillCurrent()) throw new Error("目标数据库已关闭或切换，请先调用 current。");
    const entry = (await DatabaseViewConfigStore.load(blockId)).views[viewId];
    if (entry?.mode === "custom") {
      if (!entry.configs.custom?.appId) throw new Error("当前自定义视图缺少 HTML 应用引用，请先修复当前视图。");
      return viewId;
    }
    if (!isStillCurrent()) throw new Error("数据库视图已切换，已取消创建。");
    const newViewId = await createNativeCustomView(blockId, avID, viewId);
    // toggleView only touches the newly created native view's Dodo config.
    const created = await this.toggleView(blockId, newViewId, "custom");
    if (!created ||
        (await DatabaseViewConfigStore.load(blockId)).views[newViewId]?.mode !== "custom")
      throw new Error("原生视图已新建，但初始化 HTML 自定义视图失败；请检查新视图。原视图未被修改。");
    this.refresh();
    return newViewId;
  }

  private async getAvId(blockId: string): Promise<string> {
    const av = Array.from(document.querySelectorAll<HTMLElement>(".av[data-av-id][data-node-id]")).find(el => el.dataset.nodeId === blockId);
    if (!av?.dataset.avId || !ID.test(av.dataset.avId)) throw new Error("找不到数据库 ID");
    return av.dataset.avId;
  }

  private openSettings(blockId: string, viewId: string): Promise<void> {
    return this.settings.openSettings(blockId, viewId);
  }

}
