import { databaseViewHost } from "../core/view-host";
import { ViewMountLifecycle } from "../core/view-mount-lifecycle";
import { databaseViewWrites } from "../core/view-write-coordinator";
import { Dialog, Menu, showMessage } from "siyuan";

import { renderAttributeView } from "../../shared/av/kernel-api";
import { adaptAttributeViewRender, type AvRenderData } from "../../shared/av/av-data-adapter";
import { resolveFieldBinding } from "../../shared/av/field-binding";
import FieldMapping from "../../components/ui/FieldMapping.svelte";
import { MAP_FIELD_DEFINITIONS } from "./map-field-schema";
import { createAvField } from "../../components/ui/av-create-field";
import { MapBlockService } from "./map-block-service";
import { MAP_IFRAME_PATH, type MapBlockConfig } from "./map-data";
import { DatabaseViewConfigStore, activeMapConfigs } from "../view-config-store";
import { PREVIEW_HEIGHT_PRESETS, normalizePreviewHeight, heightPresetValue, isPreviewHeightPreset } from "../../components/ui/preview-height";

import {
  DODO_MAP_VIEW_NAME, DODO_MAP_FALLBACK_ICON, ensureNativeLucideMapIcon,
  writeNativeViewAppearance,
} from "./view-appearance";
import { shouldUseDefaultMapName } from "./view-appearance-state";

/** MVP: a real SiYuan *table view* remains intact; only its presentation is swapped. */
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;
const MAP_IFRAME_CLASS = "dodo-av-map-frame";
const MAP_SETTINGS_CLASS = "dodo-av-map-settings";
const MAP_ADD_CLASS = "dodo-av-map-add";
const MAP_HOST_CLASS = "dodo-av-map-host";
const MAP_ACTIONS_CLASS = "dodo-av-map-actions";

interface MapAttachment {
  viewId: string;
  nativeScroll: HTMLElement;
  host: HTMLDivElement;
  iframe: HTMLIFrameElement;
  addButton: HTMLButtonElement;
  searchQuery: string;
}

export class DatabaseMapViews {
  private unsubscribeHost: (() => void) | null = null;
  private unsubscribeConfig: (() => void) | null = null;
  private unsubscribeWrites: (() => void) | null = null;
  private running = false;
  private scheduled = false;
  private configs = new Map<string, Record<string, MapBlockConfig>>();
  private pendingToggles = new Set<string>();
  private readonly lifecycle = new ViewMountLifecycle<MapAttachment>(
    entry => entry.iframe, (av, entry) => this.cleanupAttachment(av, entry));
  private attachments = this.lifecycle.entries;
  private reloadTimers = new Map<HTMLElement, number>();
  private correctionMuteUntil = new Map<HTMLElement, number>();
  private readonly correctionsInFlight = new Set<HTMLElement>();
  private readonly filterReloadPending = new Set<HTMLElement>();
  private settingsDialog: Dialog | null = null;

  start(): void {
    if (this.running) { this.refresh(); return; }
    this.running = true;
    this.unsubscribeConfig = DatabaseViewConfigStore.subscribe((blockId, document) => {
      this.configs.set(blockId, activeMapConfigs(document));
      for (const av of this.attachments.keys()) {
        if (av.dataset.nodeId === blockId) this.scheduleReload(av);
      }
      this.refresh();
    });
    this.unsubscribeWrites = databaseViewWrites.subscribe(event => {
      if (event.kind === "map" && event.action === "correct") return;
      for (const av of this.attachments.keys()) {
        if (av.dataset.nodeId === event.blockId) this.scheduleReload(av);
      }
    });
    this.unsubscribeHost = databaseViewHost.subscribe({
      scan: () => this.refresh(),
      changed: av => this.scheduleReload(av),
      theme: () => this.refreshFrames(),
    });
    // Native filter editors are floating .av__panel elements outside the AV
    // block. Their interactions do not necessarily mutate .av__scroll.
    document.addEventListener("click", this.handleFilterPanelClick, true);
    document.addEventListener("change", this.handleFilterPanelChange, true);
    document.addEventListener("input", this.handleFilterPanelChange, true);
    this.refresh();
  }

  stop(): void {
    this.running = false;
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = null;
    this.unsubscribeHost?.();
    this.unsubscribeHost = null;
    this.unsubscribeWrites?.();
    this.unsubscribeWrites = null;
    document.removeEventListener("click", this.handleFilterPanelClick, true);
    document.removeEventListener("change", this.handleFilterPanelChange, true);
    document.removeEventListener("input", this.handleFilterPanelChange, true);
    this.settingsDialog?.destroy();
    this.settingsDialog = null;
    for (const av of Array.from(this.attachments.keys())) this.detach(av);
    document.querySelectorAll<HTMLElement>(`.${MAP_SETTINGS_CLASS}`).forEach(el => el.remove());
    this.configs.clear();
    this.correctionMuteUntil.clear();
    this.correctionsInFlight.clear();
    this.filterReloadPending.clear();
    this.activeFilterAv = null;
    this.scheduled = false;
  }

  /** Filter popup input is outside .av; explicitly refresh its active map view. */
  private handleFilterPanelClick = (event: MouseEvent): void => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;
    const trigger = element.closest('[data-type="av-filter"]');
    const av = trigger?.closest<HTMLElement>(".av");
    if (av && this.attachments.has(av)) {
      // The popup opens asynchronously; subsequent clicks inside it are tracked.
      this.activeFilterAv = av;
      return;
    }
    if (element.closest(".av__panel")) this.requestFilterRefresh();
  };

  private handleFilterPanelChange = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest(".av__panel")) {
      this.requestFilterRefresh();
    }
  };

  private activeFilterAv: HTMLElement | null = null;
  private requestFilterRefresh(): void {
    const av = this.activeFilterAv;
    if (av?.isConnected && this.attachments.has(av)) this.scheduleReload(av, true);
  }
  /** Block SiYuan's early AV DOM refresh while the coordinate write is in flight. */
  beginPointCorrection(blockId: string, viewId: string): void {
    for (const [av, attachment] of this.attachments) {
      if (av.dataset.nodeId !== blockId || attachment.viewId !== viewId) continue;
      this.correctionsInFlight.add(av);
      const timer = this.reloadTimers.get(av);
      if (timer !== undefined) window.clearTimeout(timer);
      this.reloadTimers.delete(av);
    }
  }

  finishPointCorrection(blockId: string, viewId: string): void {
    for (const [av, attachment] of this.attachments) {
      if (av.dataset.nodeId === blockId && attachment.viewId === viewId) {
        this.correctionsInFlight.delete(av);
        if (this.filterReloadPending.delete(av)) this.scheduleReload(av, true);
      }
    }
  }
  /** Broadcast coordinate changes without a map refresh after the write succeeds. */
  broadcastPointCorrection(blockId: string, itemId: string, latitude: number,
    longitude: number, exclude?: Window | null): void {
    for (const [av, attachment] of this.attachments) {
      if (av.dataset.nodeId !== blockId || !attachment.host.isConnected) continue;
      this.correctionMuteUntil.set(av, Date.now() + 1200);
      const timer = this.reloadTimers.get(av);
      if (timer !== undefined) window.clearTimeout(timer);
      this.reloadTimers.delete(av);
      const target = attachment.iframe.contentWindow;
      if (target && target !== exclude) target.postMessage({
        type: "dodoMapPointCorrected", itemId, latitude, longitude,
      }, window.location.origin);
    }
  }
  invalidate(blockId: string): void { this.configs.delete(blockId); }
  refreshFrames(): void {
    for (const av of this.attachments.keys()) this.scheduleReload(av);
  }

  refresh(): void {
    if (!this.running || this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      if (this.running) void this.scan();
    });
  }

  /** Accept messages only from a mounted iframe belonging to the currently selected table view. */
  getFrameContext(source: Window): { blockId: string; viewId: string } | null {
    if (!databaseViewHost.fromSource(source, "map")) return null;
    for (const [av, attachment] of this.attachments) {
      const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      const activeViewId = header?.dataset.currentViewId ||
        header?.querySelector<HTMLElement>(".layout-tab-bar .item--focus")?.dataset.id;
      if (av.isConnected && attachment.host.isConnected &&
          attachment.iframe.contentWindow === source && activeViewId === attachment.viewId &&
          BLOCK_ID.test(av.dataset.nodeId || "")) {
        return { blockId: av.dataset.nodeId as string, viewId: attachment.viewId };
      }
    }
    return null;
  }

  isMapFrame(source: Window): boolean {
    return this.getFrameContext(source) !== null;
  }

  setAddModeForFrame(source: Window, enabled: boolean): void {
    if (!this.getFrameContext(source)) return;
    for (const attachment of this.attachments.values()) {
      if (attachment.iframe.contentWindow !== source) continue;
      attachment.addButton.dataset.addMode = String(enabled);
      attachment.addButton.classList.toggle("dodo-av-map-add--active", enabled);
      attachment.addButton.setAttribute("aria-label", enabled ? "取消添加地点" : "添加地点");
      attachment.addButton.title = enabled ? "取消添加地点" : "添加地点";
      attachment.addButton.innerHTML = `<svg><use xlink:href="#${enabled ? "iconClose" : "iconAdd"}"></use></svg>`;
      return;
    }
  }

  async createPointForFrame(source: Window, point: { name: string; latitude: number; longitude: number }) {
    const ctx = this.getFrameContext(source);
    if (!ctx) throw new Error("地图视图已经切换，请返回地图后重新操作。");
    const result = await MapBlockService.createPoint(ctx.blockId, point, ctx.viewId);
    for (const [av, attachment] of this.attachments) {
      if (av.dataset.nodeId === ctx.blockId && attachment.viewId === ctx.viewId) this.scheduleReload(av);
    }
    return result;
  }

  private async readConfigs(blockId: string): Promise<Record<string, MapBlockConfig>> {
  if (this.configs.has(blockId)) return this.configs.get(blockId)!;
  const maps=activeMapConfigs(await DatabaseViewConfigStore.load(blockId));
  if(this.configs.has(blockId))return this.configs.get(blockId)!;
  this.configs.set(blockId,maps);return maps;
}

  private async scan(): Promise<void> {
    const databases = Array.from(document.querySelectorAll<HTMLElement>('.av[data-av-id][data-node-id]'));
    for (const av of databases) {
      const blockId = av.dataset.nodeId || "";
      const header = av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      const viewId = header?.dataset.currentViewId || header?.querySelector<HTMLElement>(".layout-tab-bar .item--focus")?.dataset.id || "";
      const selected = header?.querySelector<HTMLElement>(`.layout-tab-bar .item[data-id="${viewId}"]`);
      const isTable = selected?.dataset.avType === "table";
      if (!BLOCK_ID.test(blockId)) {
        this.detach(av);
        continue;
      }
      const currentAttachment = this.attachments.get(av);
      // A cell update may temporarily replace the native AV header/scroll.
      // Wait for valid metadata instead of treating this as a view switch.
      if (!header || !BLOCK_ID.test(viewId) || !selected) {
        if (!currentAttachment) this.detach(av);
        continue;
      }
      if (!isTable) {
        this.detach(av);
        continue;
      }
      let configs: Record<string, MapBlockConfig>;
      try { configs = await this.readConfigs(blockId); } catch (error) {
        console.warn("[Dodo 地图视图] 读取数据库配置失败", error);
        continue;
      }
      const currentViewId = header.dataset.currentViewId ||
        header.querySelector<HTMLElement>(".layout-tab-bar .item--focus")?.dataset.id;
      if (!this.running || !av.isConnected || av.querySelector(":scope > .av__container > .av__header") !== header ||
          currentViewId !== viewId) continue;
        if (av.classList.contains("dodo-av-visual--active")) this.detach(av);
      else if (configs[viewId]) this.attach(av, blockId, viewId);
      else this.detach(av);
    }
    for (const av of Array.from(this.attachments.keys())) {
      if (!av.isConnected || !databases.includes(av)) this.detach(av);
    }
  }

  private attach(av: HTMLElement, blockId: string, viewId: string): void {
    const scroll = av.querySelector<HTMLElement>(":scope > .av__container > .av__scroll");
    if (!scroll) return;
    this.lifecycle.reconcile(av, {
      viewId, kind: "map",
      frame: entry => entry.iframe,
      reusable: current => current.viewId === viewId &&
        current.host.parentElement === av && current.host.isConnected && current.iframe.isConnected,
      update: current => {

      // Native cell updates replace the AV scroll or container, but should not
      // rebuild the map iframe and lose its browsing context and zoom.
      if (current.nativeScroll !== scroll) {
        current.nativeScroll.style.removeProperty("display");
        current.nativeScroll = scroll;
        // A new native scroll usually means that SiYuan applied filters/sorts.
        // Keep the same iframe but refetch rows for the selected view.
        this.scheduleReload(av);
      }
      scroll.style.display = "none";
      current.iframe.style.height = normalizePreviewHeight(this.configs.get(blockId)?.[viewId]?.height) + "px";
      av.classList.add("dodo-av-map--active");
      const query = this.getSearch(av);
      if (query !== current.searchQuery) {
        current.searchQuery = query;
        this.scheduleReload(av);
      }
      },
      create: () => {
    const mapHost = document.createElement("div");
    mapHost.className = MAP_HOST_CLASS;
    const iframe = document.createElement("iframe");
    iframe.className = MAP_IFRAME_CLASS;
    iframe.dataset.dodoMapView = viewId;
    iframe.title = "Dodo 数据库地图视图";
    iframe.style.cssText = "display:block;width:100%;height:" + normalizePreviewHeight(this.configs.get(blockId)?.[viewId]?.height) + "px;border:0;min-width:0;";
    const url = new URL(MAP_IFRAME_PATH, window.location.origin);
    url.searchParams.set("blockId", blockId);
    url.searchParams.set("viewId", viewId);
    // Invalidate HTML and its iframe JS after changes to persistent AV mounting.
    url.searchParams.set("v", "20261105-locate-existing");
    iframe.src = url.toString();
    const actions = document.createElement("div");
    actions.className = MAP_ACTIONS_CLASS;
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = MAP_ADD_CLASS;
    addButton.title = "添加地点";
    addButton.setAttribute("aria-label", "添加地点");
    addButton.innerHTML = '<svg><use xlink:href="#iconAdd"></use></svg>';
    addButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const attachment = this.attachments.get(av);
      if (!attachment || attachment.viewId !== viewId) return;
      const send = (type: string, payload: Record<string, unknown> = {}) => {
        const current = this.attachments.get(av);
        if (current?.viewId !== viewId || !current.iframe.contentWindow) return;
        current.iframe.contentWindow.postMessage({type, ...payload}, window.location.origin);
      };
      const menu = new Menu("dodo-db-map-add-point");
      menu.addItem({icon: "iconAdd", label: "新建地点",
        click: () => send("dodoMapSetAddMode", {enabled: true})});
      menu.addItem({icon: "iconMap", label: "为已有条目添加位置",
        click: () => send("dodoMapBeginLocateExisting")});
      const rect = addButton.getBoundingClientRect();
      menu.open({x: rect.left, y: rect.bottom + 4});
    });
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = MAP_SETTINGS_CLASS;
    settingsButton.title = "地图设置";
    settingsButton.setAttribute("aria-label", "地图设置");
    settingsButton.innerHTML = '<svg><use xlink:href="#iconSettings"></use></svg>';
    settingsButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const attachment = this.attachments.get(av);
      if (attachment?.viewId === viewId) void this.openSettings(blockId, viewId);
    });
    actions.append(addButton, settingsButton);
    mapHost.append(iframe, actions);
    av.classList.add("dodo-av-map--active");
    scroll.style.display = "none";
    // The kernel may replace .av__container during a cell update. Mount the
    // iframe under the stable .av block, outside its native data container.
    av.append(mapHost);
    return { viewId, nativeScroll: scroll, host: mapHost, iframe, addButton, searchQuery: this.getSearch(av) };
      },
    });
  }

  private detach(av: HTMLElement): void { this.lifecycle.detach(av); }

  private cleanupAttachment(av: HTMLElement, attachment: MapAttachment | undefined): void {
    av.classList.remove("dodo-av-map--active");
    const timer = this.reloadTimers.get(av);
    if (timer !== undefined) window.clearTimeout(timer);
    this.reloadTimers.delete(av);
    this.correctionMuteUntil.delete(av);
    this.correctionsInFlight.delete(av);
    this.filterReloadPending.delete(av);
    if (this.activeFilterAv === av) this.activeFilterAv = null;
    if (!attachment) return;
    // restore only the specific original scroll node we hid; do not touch refreshed DOM.
    attachment.nativeScroll.style.removeProperty("display");
  }

  private getSearch(av: HTMLElement): string {
    return av.querySelector<HTMLElement>('.av__header [data-type="av-search"]')?.textContent?.trim() || "";
  }

  private scheduleReload(av: HTMLElement, filterChanged = false): void {
    if (!this.running || !this.attachments.has(av)) return;
    if (this.correctionsInFlight.has(av)) {
      if (filterChanged) this.filterReloadPending.add(av);
      return;
    }
    // Real filter changes may happen during the brief correction mute window.
    // Never discard them; only skip refreshes from the coordinate write.
    if (!filterChanged && Date.now() < (this.correctionMuteUntil.get(av) || 0)) return;
    if (!filterChanged) this.correctionMuteUntil.delete(av);
    const old = this.reloadTimers.get(av);
    if (old !== undefined) window.clearTimeout(old);
    const timer = window.setTimeout(() => {
      this.reloadTimers.delete(av);
      const attachment = this.attachments.get(av);
      if (attachment?.iframe.isConnected) {
        attachment.iframe.contentWindow?.postMessage({ type: "dodoMapRefresh" }, window.location.origin);
      }
    }, 300);
    this.reloadTimers.set(av, timer);
  }

  async toggleView(blockId: string, viewId: string): Promise<boolean> {
 const key=blockId+":"+viewId;if(this.pendingToggles.has(key))return false;
 this.pendingToggles.add(key);
 try {
  const prior=(await DatabaseViewConfigStore.load(blockId)).views[viewId];
  const active=prior?.mode==="map";
  if(!active && prior?.mode && prior.mode!=="table") throw new Error("请先切回表格，再启用地图视图。");
  let identity: {previous:{name:string;icon:string};next:{name:string;icon:string}} | null=null;
  let avID="";let mapConfig=prior?.configs.map;
  if(!active){
   avID=await this.getAvId(blockId);
   const raw=await renderAttributeView({id:avID,blockID:blockId,viewID:viewId,pageSize:1}) as AvRenderData;
   const table=adaptAttributeViewRender(raw);
   const view=(raw as unknown as {views?:Array<{id:string;name?:string;icon?:string}>}).views?.find(v=>v.id===viewId);
   if(!view)throw new Error("未找到原生数据库视图");
   if(!prior?.appearance?.initialized){
    const previous={name:view.name||"",icon:view.icon||""};let icon=previous.icon;
    if(!icon){icon=DODO_MAP_FALLBACK_ICON;try{icon=await ensureNativeLucideMapIcon();}catch(e){console.warn(e);}}
    identity={previous,next:{name:shouldUseDefaultMapName(previous.name)?DODO_MAP_VIEW_NAME:previous.name,icon}};
   }
   if(!mapConfig){
    const location=table.fieldTypes.indexOf("location"),image=table.fieldTypes.indexOf("mAsset");
    mapConfig={fieldMapping:{coordinate:location<0?"":table.columnIds[location],image:image<0?"":table.columnIds[image]}};
   }
  }
  const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>({
   ...entry,mode:active?"table":"map",
   configs:{...entry.configs,...(active?{}:{map:mapConfig!})},
   appearance:{...entry.appearance,initialized:entry.appearance?.initialized||!!identity}
  }));
  const maps=activeMapConfigs(doc);this.configs.set(blockId,maps);this.refresh();
  if(identity)try{await writeNativeViewAppearance(avID,blockId,viewId,identity.previous,identity.next);}
    catch(error){console.warn(error);showMessage("地图已启用，但图标或名称未更新。",4500);}
  if(!active&&!maps[viewId]?.fieldMapping.coordinate)showMessage("请在地图设置中选择位置字段。",5500);
  return true;
 }catch(error){showMessage("切换地图视图失败："+(error instanceof Error?error.message:String(error)),5500,"error");return false;}
 finally{this.pendingToggles.delete(key);}
}

  private async getAvId(blockId: string): Promise<string> {
    const block = Array.from(document.querySelectorAll<HTMLElement>('.av[data-av-id][data-node-id]'))
      .find(item => item.dataset.nodeId === blockId);
    const avId = block?.dataset.avId;
    if (!avId || !BLOCK_ID.test(avId)) throw new Error("没有找到有效的数据库 ID。");
    return avId;
  }

  private async openSettings(blockId: string, viewId: string): Promise<void> {
    try {
      const configs = await this.readConfigs(blockId);
      if (!configs[viewId]) return;
      let table = adaptAttributeViewRender(await renderAttributeView({
        id: await this.getAvId(blockId), blockID: blockId, viewID: viewId, pageSize: 1,
      }) as AvRenderData);
      let draftMapping = { ...configs[viewId].fieldMapping };
      let selectedHeight = heightPresetValue(configs[viewId].height);
      this.settingsDialog?.destroy();
      let mappingPanel: FieldMapping | undefined;
      const dialog = new Dialog({
        title: "数据库地图视图设置",
        content: '<div class="dodo-av-map-settings-panel" style="padding:16px;display:flex;flex-direction:column;gap:14px"></div>',
        width: "390px",
        destroyCallback: () => {
          mappingPanel?.$destroy();
          if (this.settingsDialog === dialog) this.settingsDialog = null;
        },
      });
      this.settingsDialog = dialog;
      const panel = dialog.element.querySelector<HTMLElement>(".dodo-av-map-settings-panel");
      if (!panel) return;
      const heightRow = document.createElement("label");
      heightRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 8px;";
      const heightText = document.createElement("span");
      heightText.textContent = "高度";
      const heightSelect = document.createElement("select");
      heightSelect.className = "b3-select";
      heightSelect.style.cssText = "width:170px;max-width:65%;";
      for (const option of PREVIEW_HEIGHT_PRESETS) {
        const item = document.createElement("option");
        item.value = String(option.value);
        item.textContent = option.label;
        heightSelect.append(item);
      }
      heightSelect.value = String(selectedHeight);
      heightSelect.addEventListener("change", () => {
        const nextHeight = Number(heightSelect.value);
        if (!isPreviewHeightPreset(nextHeight)) return;
        // Save height separately from draft field mappings and resize immediately.
        heightSelect.disabled = true;
        void (async () => {
          try {
            const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
             if(entry.mode!=="map"||!entry.configs.map)throw new Error("地图视图已关闭。");
             return {...entry,configs:{...entry.configs,map:{...entry.configs.map,height:nextHeight}}};
            });this.configs.set(blockId,activeMapConfigs(doc));
            selectedHeight = nextHeight;
            for (const [av, attachment] of this.attachments) {
              if (av.dataset.nodeId === blockId && attachment.viewId === viewId) {
                attachment.iframe.style.height = String(nextHeight) + "px";
              }
            }
          } catch (error) {
            heightSelect.value = String(selectedHeight);
            showMessage("保存地图高度失败：" + (error instanceof Error ? error.message : String(error)), 5500, "error");
          } finally { heightSelect.disabled = false; }
        })();
      });
      heightRow.append(heightText, heightSelect);
      panel.append(heightRow);
      const mappingHost = document.createElement("div");
      panel.append(mappingHost);
      mappingPanel = new FieldMapping({ target: mappingHost, props: {
        definitions: MAP_FIELD_DEFINITIONS, table, mapping: draftMapping,
      } });
      mappingPanel.$on("change", event => {
        draftMapping = { ...draftMapping, [event.detail.field]: event.detail.value };
        mappingPanel?.$set({ mapping: draftMapping });
      });
      let creatingField = "";
      mappingPanel.$set({ canCreate: true });
      mappingPanel.$on("create", event => {
        const field = MAP_FIELD_DEFINITIONS.find(item => item.key === event.detail);
        if (!field || creatingField) return;
        creatingField = field.key;
        mappingPanel?.$set({ creatingField });
        void (async () => {
          let createdName = "";
          try {
            const created = await createAvField({
              avID: await this.getAvId(blockId),
              blockID: blockId,
              viewID: viewId,
              field,
              existingNames: table.columnNames,
            });
            createdName = created.name;
            // Persist the binding immediately, without requiring Save.
            const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
             if(entry.mode!=="map"||!entry.configs.map)throw new Error("地图视图已关闭。");
             return {...entry,configs:{...entry.configs,map:{...entry.configs.map,
              fieldMapping:{...entry.configs.map.fieldMapping,[field.key]:created.id}}}};
            });this.configs.set(blockId,activeMapConfigs(doc));
            draftMapping = { ...draftMapping, [field.key]: created.id };
            table = adaptAttributeViewRender(await renderAttributeView({
              id: await this.getAvId(blockId), blockID: blockId, viewID: viewId, pageSize: 1,
            }) as AvRenderData);
            mappingPanel?.$set({ table, mapping: draftMapping });
            for (const [av, attachment] of this.attachments) {
              if (av.dataset.nodeId === blockId && attachment.viewId === viewId) this.scheduleReload(av);
            }
            showMessage("已创建并绑定字段「" + created.name + "」");
          } catch (error) {
            showMessage((createdName ? "字段已创建但绑定失败：" : "添加字段失败：") +
              (error instanceof Error ? error.message : String(error)), 5500, "error");
          } finally {
            creatingField = "";
            mappingPanel?.$set({ creatingField });
          }
        })();
      });
      const hint = document.createElement("p");
      hint.style.cssText = "margin:0;font-size:12px;line-height:1.6;color:var(--b3-theme-on-surface);";
      hint.textContent = "标题使用数据库主键。此配置保存在当前数据库块中，地图只显示当前表格视图经过筛选的记录。";
      const save = document.createElement("button");
      save.className = "b3-button";
      save.textContent = "保存地图设置";
      save.onclick = () => { void (async () => {
        save.disabled = true;
        try {
          const latest = await this.readConfigs(blockId);
          if (!latest[viewId]) throw new Error("地图视图已关闭。");
          const mapping = { ...draftMapping };
          for (const field of MAP_FIELD_DEFINITIONS) {
            if (!mapping[field.key]) continue;
            const result = resolveFieldBinding(table, mapping[field.key], field.acceptedTypes);
            if (result.status !== "resolved") throw new Error(`${field.label}字段类型不匹配或已删除，请重新选择。`);
            mapping[field.key] = result.id;
          }
          const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
           if(entry.mode!=="map"||!entry.configs.map)throw new Error("地图视图已关闭。");
           return {...entry,configs:{...entry.configs,map:{...entry.configs.map,fieldMapping:mapping}}};
          });this.configs.set(blockId,activeMapConfigs(doc));
          for (const [av, attachment] of this.attachments) {
            if (av.dataset.nodeId === blockId && attachment.viewId === viewId) this.scheduleReload(av);
          }
          dialog.destroy();
        } catch (error) {
          showMessage(`保存地图字段失败：${error instanceof Error ? error.message : String(error)}`, 5500, "error");
        } finally { save.disabled = false; }
      })(); };
      panel.append(hint, save);
    } catch (error) {
      showMessage(`打开地图设置失败：${error instanceof Error ? error.message : String(error)}`, 5500, "error");
    }
  }
}
