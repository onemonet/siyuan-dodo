import { Dialog, showMessage } from "siyuan";
import { renderAttributeView, getAttributeViewName } from "../../shared/av/kernel-api";
import { adaptAttributeViewRender, type AvRenderData } from "../../shared/av/av-data-adapter";
import { resolveFieldBinding } from "../../shared/av/field-binding";
import { normalizePreviewHeight } from "../../components/ui/preview-height";
import { type VisualConfig, type VisualKind } from "./visual-types";
import { DatabaseViewConfigStore, type ViewMode } from "../view-config-store";
import type { DatabaseViewDocument } from "../view-config-schema";
import { materializeChartFieldBindings } from "../../lets-custom-block/chart/chart-field-initializer";
import ChartSettingsPanel from "../../lets-custom-block/chart/ChartSettingsPanel.svelte";
import type { ChartBlockConfig, SupportedChartType } from "../../lets-custom-block/chart/types";
import TimelineSettingsPanel from "../../lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte";
import type { TimelineBlockConfig, TimelineFieldMapping } from "../../lets-custom-block/timeline/types";
import { materializeTimelineFieldMapping, resolveTimelineColumns, TIMELINE_FIELD_DEFINITIONS } from "../../lets-custom-block/timeline/services/field-mapping";
import GanttSettingsPanel from "../gantt/GanttSettingsPanel.svelte";
import { makeGanttResult, prepareGanttMapping, type GanttConfig } from "../gantt/gantt-model";
import CalendarSettingsPanel from "../calendar/CalendarSettingsPanel.svelte";
import { CALENDAR_VIEWS, type CalendarConfig } from "../calendar/calendar-model";
import { prepareScheduleMapping } from "../core/schedule-model";
import { openCustomSettings } from "../custom/settings";

function timelinePreviewHeight(value?: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1200, Math.max(320, Math.round(value))) : 520;
}

interface MountedVisual {
  frame: HTMLIFrameElement;
  viewId: string;
  kind: VisualKind;
}
export interface VisualSettingsBridge {
  read(blockId: string): Promise<Record<string, VisualConfig>>;
  getAvId(blockId: string): Promise<string>;
  mounted(): Iterable<[HTMLElement, MountedVisual]>;
  updated(blockId: string, document: DatabaseViewDocument): void;
  scheduleFrame(av: HTMLElement): void;
  isEnabled(kind: ViewMode): boolean;
}

/** View-specific settings own their dialogs and field validation, not the
 * mounting/selection controller. This bridge has no renderer-private state. */
export class DatabaseVisualSettings {
  private settingsDialog: Dialog | null = null;
  constructor(private readonly bridge: VisualSettingsBridge) {}
  stop(): void {
    this.settingsDialog?.destroy();
    this.settingsDialog = null;
  }
  /** Database views use the exact same full-featured ChartSettingsPanel as legacy chart blocks. */
  private openChartSettings(blockId: string, viewId: string): void {
    this.settingsDialog?.destroy();
    let panel: ChartSettingsPanel | undefined;
    const dialog = new Dialog({
      title: "数据库图表设置",
      content: '<div class="dodo-chart-settings-panel" style="height:100%;overflow:hidden"></div>',
      width: "400px", height: "min(680px,85vh)",
      destroyCallback: () => {
        panel?.$destroy();
        if (this.settingsDialog === dialog) this.settingsDialog = null;
      },
    });
    this.settingsDialog = dialog;
    const target = dialog.element.querySelector<HTMLElement>(".dodo-chart-settings-panel");
    if (!target) { dialog.destroy(); return; }
    panel = new ChartSettingsPanel({ target, props: { databaseView: {
      load: async () => {
        const configs = await this.bridge.read(blockId);
        const selected = configs[viewId];
        if (!selected || selected.kind !== "chart" || selected.enabled === false) {
          throw new Error("图表视图已关闭，请重新打开设置。");
        }
        const avID = await this.bridge.getAvId(blockId);
        const data = adaptAttributeViewRender(await renderAttributeView({
          id: avID, blockID: blockId, viewID: viewId, pageSize: 1,
        }) as AvRenderData);
        const initialized = materializeChartFieldBindings(data, selected.chart || {});
        if (initialized.changed) {
          const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
           if(entry.mode!=="chart")throw new Error("图表视图已关闭。");
           return {...entry,configs:{...entry.configs,chart:initialized.config}};
          });this.bridge.updated(blockId, doc);
        }
        return {
          ok: true, headers: data.headers, columnIds: data.columnIds,
          columnNames: data.columnNames, fieldTypes: data.fieldTypes,
          chartType: selected.chart?.type || "bar-basic" as SupportedChartType,
          config: initialized.config, sourceId: blockId, sourceFolded: false,
        };
      },
      apply: async (type: SupportedChartType, config: ChartBlockConfig) => {
        try {
          if (!this.bridge.isEnabled("chart")) throw new Error("图表视图已在插件配置中关闭。");
          const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
           if(entry.mode!=="chart")throw new Error("图表视图已关闭，请重新打开设置。");
           return {...entry,configs:{...entry.configs,chart:{...config,type}}};
          });this.bridge.updated(blockId, doc);
          for (const [av, item] of this.bridge.mounted()) {
            if (av.dataset.nodeId === blockId && item.viewId === viewId && item.kind === "chart") {
              // Resize the live iframe; keep the current chart instance.
              item.frame.style.height = normalizePreviewHeight(config.height) + "px";
              this.bridge.scheduleFrame(av);
            }
          }
          return { success: true };
        } catch (error) { return { success: false, message: error instanceof Error ? error.message : String(error) }; }
      },
      refresh: async () => {
        for (const [av, item] of this.bridge.mounted()) {
          if (av.dataset.nodeId === blockId && item.viewId === viewId) this.bridge.scheduleFrame(av);
        }
        return { success: true };
      },
    } } });
  }


  private openCalendarSettings(blockId: string, viewId: string): void {
    this.settingsDialog?.destroy();
    let panel: CalendarSettingsPanel | undefined;
    const dialog = new Dialog({
      title: "数据库日历设置",
      content: '<div class="dodo-calendar-settings-host" style="height:100%;overflow:hidden"></div>',
      width: "430px", height: "min(620px,85vh)",
      destroyCallback: () => {
        panel?.$destroy();
        if (this.settingsDialog === dialog) this.settingsDialog = null;
      },
    });
    this.settingsDialog = dialog;
    const target = dialog.element.querySelector<HTMLElement>(".dodo-calendar-settings-host");
    if (!target) { dialog.destroy(); return; }
    panel = new CalendarSettingsPanel({ target, props: {
      load: async () => {
        const current = (await DatabaseViewConfigStore.load(blockId)).views[viewId];
        if (current?.mode !== "calendar") throw new Error("日历视图已切换");
        const raw = await renderAttributeView({
          id: await this.bridge.getAvId(blockId), blockID: blockId, viewID: viewId, pageSize: 1,
        }) as AvRenderData;
        return { raw, config: {
          ...current.configs.calendar,
          fieldMapping: prepareScheduleMapping(raw, current.configs.calendar?.fieldMapping),
        }};
      },
      apply: async (config: CalendarConfig) => {
        if (!this.bridge.isEnabled("calendar")) throw new Error("日历视图已关闭");
        const raw = await renderAttributeView({
          id: await this.bridge.getAvId(blockId), blockID: blockId, viewID: viewId, pageSize: 1,
        }) as AvRenderData;
        const table = adaptAttributeViewRender(raw);
        const mapping = prepareScheduleMapping(raw, config.fieldMapping);
        for (const field of ["title", "start", "end", "color"] as const) {
          const key = mapping[field];
          if (!key) {
            if (field === "title" || field === "start")
              throw new Error("必须设置日程名称和开始日期字段");
            continue;
          }
          const types = field === "title" ? ["block", "text"]
            : field === "color" ? ["select", "mSelect"] : ["date"];
          if (resolveFieldBinding(table, key, types).status !== "resolved")
            throw new Error("日历字段已失效或类型不匹配：" + field);
        }
        if (config.defaultView && !CALENDAR_VIEWS.includes(config.defaultView))
          throw new Error("不支持的日历显示方式");
        const document = await DatabaseViewConfigStore.updateView(blockId, viewId, entry => {
          if (entry.mode !== "calendar") throw new Error("日历视图已切换");
          return { ...entry, configs: { ...entry.configs, calendar: {
            fieldMapping: mapping,
            defaultView: config.defaultView || "dayGridMonth",
          }}};
        });
        this.bridge.updated(blockId, document);
        for (const [av, entry] of this.bridge.mounted()) {
          if (av.dataset.nodeId === blockId && entry.viewId === viewId && entry.kind === "calendar")
            this.bridge.scheduleFrame(av);
        }
      },
    }});
  }

  private openGanttPreviewSettings(blockId:string,viewId:string): void {
    this.settingsDialog?.destroy();
    let panel:GanttSettingsPanel|undefined;
    const dialog=new Dialog({
      title:"数据库甘特设置",
      content:'<div class="dodo-gantt-settings-host" style="height:100%;overflow:hidden"></div>',
      width:"440px",height:"min(700px,85vh)",
      destroyCallback:()=>{
        panel?.$destroy();
        if(this.settingsDialog===dialog)this.settingsDialog=null;
      },
    });
    this.settingsDialog=dialog;
    const target=dialog.element.querySelector<HTMLElement>(".dodo-gantt-settings-host");
    if(!target){dialog.destroy();return;}
    panel=new GanttSettingsPanel({target,props:{
      load:async()=>{
        const latest=(await DatabaseViewConfigStore.load(blockId)).views[viewId];
        if(latest?.mode!=="gantt")throw new Error("甘特视图已切换");
        const avID=await this.bridge.getAvId(blockId);
        const raw=await renderAttributeView({id:avID,blockID:blockId,viewID:viewId,pageSize:1}) as AvRenderData;
        const config=latest.configs.gantt||{};
        return {raw,config:{...config,fieldMapping:prepareGanttMapping(raw,config.fieldMapping)}};
      },
      apply:async(config:GanttConfig)=>{
        if(!this.bridge.isEnabled("gantt"))throw new Error("甘特视图已关闭");
        const avID=await this.bridge.getAvId(blockId);
        const raw=await renderAttributeView({id:avID,blockID:blockId,viewID:viewId,pageSize:1}) as AvRenderData;
        const mapped=makeGanttResult(raw,config);
        if(!mapped.mapping.title || !mapped.mapping.start)throw new Error("必须配置任务名称和开始日期");
        const table=adaptAttributeViewRender(raw);
        const titleField=resolveFieldBinding(table,mapped.mapping.title,["block","text"]);
        const startField=resolveFieldBinding(table,mapped.mapping.start,["date"]);
        if(titleField.status!=="resolved")throw new Error("任务名称字段已删除或类型改变");
        if(startField.status!=="resolved")throw new Error("开始日期字段已删除或类型改变");
        const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
          if(entry.mode!=="gantt")throw new Error("甘特视图已切换");
          return {...entry,configs:{...entry.configs,gantt:{
            fieldMapping:mapped.mapping,
            progressMax:config.progressMax===1?1:100,
            timeStep:config.timeStep===15?15:config.timeStep===30?30:0,
            zoom:config.zoom||((config.timeStep===15||config.timeStep===30)?"hour":"week"),
            demo:false,
          }}};
        });
        this.bridge.updated(blockId, doc);
        for(const [av,item] of this.bridge.mounted()){
          if(av.dataset.nodeId===blockId && item.viewId===viewId){
            this.bridge.scheduleFrame(av);
          }
        }
      },
    }});
  }

  /** Reuse the same Svelte settings UI as standalone timeline blocks. */
  async openSettings(blockId: string, viewId: string): Promise<void> {
    try {
      const configs = await this.bridge.read(blockId);
      const selected = configs[viewId];
      if (!selected || selected.enabled === false || !this.bridge.isEnabled(selected.kind)) return;
      if (selected.kind === "custom") {
        this.settingsDialog?.destroy();
        this.settingsDialog = await openCustomSettings(blockId, viewId, () => {
          for (const [av, mounted] of this.bridge.mounted())
            if (av.dataset.nodeId === blockId && mounted.viewId === viewId &&
                mounted.kind === "custom") this.bridge.scheduleFrame(av);
        });
        return;
      }
      if (selected.kind === "chart") { this.openChartSettings(blockId, viewId); return; }
      if (selected.kind === "gantt") { this.openGanttPreviewSettings(blockId, viewId); return; }
      if (selected.kind === "calendar") { this.openCalendarSettings(blockId, viewId); return; }
      this.settingsDialog?.destroy();
      let panel: TimelineSettingsPanel | undefined;
      const dialog = new Dialog({
        title: "数据库时间线设置",
        content: '<div class="dodo-timeline-database-settings" style="height:100%;overflow:hidden"></div>',
        width: "420px", height: "min(720px,85vh)",
        destroyCallback: () => {
          panel?.$destroy();
          if (this.settingsDialog === dialog) this.settingsDialog = null;
        },
      });
      this.settingsDialog = dialog;
      const target = dialog.element.querySelector<HTMLElement>(".dodo-timeline-database-settings");
      if (!target) { dialog.destroy(); return; }
      panel = new TimelineSettingsPanel({ target, props: {
        timelineBlockId: blockId,
        databaseView: {
          load: async () => {
            const latest = (await this.bridge.read(blockId))[viewId];
            if (latest?.kind !== "timeline" || latest.enabled === false) throw new Error("时间线视图已经关闭。");
            const avID = await this.bridge.getAvId(blockId);
            const raw = await renderAttributeView({ id: avID, blockID: blockId, viewID: viewId, pageSize: 1 }) as AvRenderData;
            const table = adaptAttributeViewRender(raw);
            const initialized = materializeTimelineFieldMapping(table, latest.timeline?.fieldMapping || {});
            if (initialized.changed) {
              const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
               if(entry.mode!=="timeline")throw new Error("时间线视图已切换，请重新打开设置。");
               return {...entry,configs:{...entry.configs,timeline:{...entry.configs.timeline,fieldMapping:initialized.mapping}}};
              });this.bridge.updated(blockId, doc);
            }
            let sourceName = raw.name?.trim() || "";
            try { sourceName = (await getAttributeViewName(avID)) || sourceName; }
            catch (error) { console.warn("[Dodo 时间线] 数据库名称读取失败", error); }
            return {
              sourceName,
              headers: table.headers, columnIds: table.columnIds,
              columnNames: table.columnNames, fieldTypes: table.fieldTypes,
              config: {
                ...latest.timeline, fieldMapping: initialized.mapping, sourceType: "database" as const,
                sourceBlockId: blockId, sourceAvID: avID, sourceViewID: viewId,
                height: timelinePreviewHeight(latest.timeline?.height),
                timenavHeightPercent: latest.timeline?.timenavHeightPercent ?? 50,
                startPosition: latest.timeline?.startPosition === "last" ? "last" : "first",
              },
            };
          },
          apply: async (config: TimelineBlockConfig) => {
            try {
              if (!this.bridge.isEnabled("timeline")) throw new Error("时间线视图已在插件配置中关闭。");
              const avID = await this.bridge.getAvId(blockId);
              const table = adaptAttributeViewRender(await renderAttributeView({
                id: avID, blockID: blockId, viewID: viewId, pageSize: 1,
              }) as AvRenderData);
              const mapping: TimelineFieldMapping = {};
              for (const field of TIMELINE_FIELD_DEFINITIONS) {
                const saved = config.fieldMapping?.[field.key];
                if (saved === "") { mapping[field.key] = ""; continue; }
                if (!saved) continue;
                const resolved = resolveFieldBinding(table, saved, field.acceptedTypes);
                if (resolved.status !== "resolved") throw new Error(`${field.label}字段类型不匹配或已删除，请重新选择。`);
                mapping[field.key] = resolved.id;
              }
              const matched = resolveTimelineColumns(table.headers, mapping, table.headers.length,
                table.columnIds, table.columnNames, table.fieldTypes);
              for (const field of TIMELINE_FIELD_DEFINITIONS.filter(item => item.required)) {
                if (matched[field.key] === null) throw new Error(`必填字段「${field.label}」未绑定，请选择有效的字段。`);
              }
              const doc=await DatabaseViewConfigStore.updateView(blockId,viewId,entry=>{
               if(entry.mode!=="timeline")throw new Error("时间线视图已切换，请重新打开设置。");
               return {...entry,configs:{...entry.configs,timeline:{...entry.configs.timeline,fieldMapping:mapping,
                height:timelinePreviewHeight(config.height),
                timenavHeightPercent:Math.min(100,Math.max(0,Math.round(config.timenavHeightPercent??50))),
                startPosition:config.startPosition==="last"?"last":"first"}}};
              });this.bridge.updated(blockId, doc);
              for (const [av, mounted] of this.bridge.mounted()) {
                if (av.dataset.nodeId === blockId && mounted.viewId === viewId && mounted.kind === "timeline") {
                  mounted.frame.style.height = `${timelinePreviewHeight(config.height)}px`;
                  this.bridge.scheduleFrame(av);
                }
              }
              return { success: true };
            } catch (error) { return { success: false, message: error instanceof Error ? error.message : String(error) }; }
          },
          refresh: async () => {
            for (const [av, mounted] of this.bridge.mounted()) {
              if (av.dataset.nodeId === blockId && mounted.viewId === viewId && mounted.kind === "timeline") this.bridge.scheduleFrame(av);
            }
            return { success: true };
          },
        },
      } });
    } catch (error) { showMessage(`打开设置失败：${error instanceof Error ? error.message : String(error)}`, 5500, "error"); }
  }

}
