import { Menu, showMessage } from "siyuan";
import { databaseViewHost } from "../core/view-host";
import { openMapItem } from "../map/open-map-item";
import type { Mounted } from "../visual/visual-view-service";
import type { GanttChange } from "./gantt-write";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const GANTT_ZOOM_ITEMS = [
  ["hour", "小时"], ["day", "日"], ["week", "周"], ["month", "月"],
] as const;
export interface GanttMessageContext {
  running(): boolean;
  mounted(): Map<HTMLElement, Mounted>;
  currentView(header: HTMLElement): string;
  render(av: HTMLElement): Promise<void>;
  saveTimeStep(av: HTMLElement, mounted: Mounted, requestId: number,
    timeStep: 0 | 15 | 30, zoom: "hour" | "day" | "week" | "month"): Promise<void>;
  saveEdit(av: HTMLElement, mounted: Mounted,
    change: GanttChange & { requestId: number; revision: number }): Promise<void>;
  saving: Set<string>;
}
/** Owns the Gantt frame protocol, including source validation and ACK locks. */
export function createGanttMessageHandler(ctx: GanttMessageContext): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if(!ctx.running() || event.origin !== location.origin || !databaseViewHost.fromSource(event.source, "gantt")) return;
    const av = Array.from(ctx.mounted().keys()).find(el => {
      const m=ctx.mounted().get(el);
      return m?.kind==="gantt" && m.frame.contentWindow===event.source;
    });
    if(!av)return;
    const mounted=ctx.mounted().get(av)!;
    if(!av.isConnected || !mounted.host.isConnected)return;
    const header=av.querySelector<HTMLElement>(":scope > .av__container > .av__header");
    if(!header || ctx.currentView(header)!==mounted.viewId)return;
    const msg=event.data;
    if(!msg || typeof msg!=="object")return;
    if(msg.type==="dodoGanttOpenZoomMenu") {
      if(!GANTT_ZOOM_ITEMS.some(([value])=>value===msg.zoom))return;
      const frame=mounted.frame;
      const button=frame.contentDocument?.getElementById("dodo-gantt-zoom") as HTMLButtonElement | null;
      if(!button || !button.isConnected || button.disabled)return;
      const frameRect=frame.getBoundingClientRect();
      const buttonRect=button.getBoundingClientRect();
      if(!frameRect.width || !frameRect.height)return;
      // Translate from iframe coordinates into the SiYuan host viewport.
      const scaleX=frameRect.width/(frame.offsetWidth||frameRect.width);
      const scaleY=frameRect.height/(frame.offsetHeight||frameRect.height);
      const x=frameRect.left+(frame.clientLeft+buttonRect.left)*scaleX;
      const y=frameRect.top+(frame.clientTop+buttonRect.bottom)*scaleY+4;
      // SiYuan's Menu constructor toggles a menu with the same active ID.
      const menu=new Menu("dodo-gantt-native-zoom-menu");
      if(menu.isOpen)return;
      for(const [zoom,label] of GANTT_ZOOM_ITEMS) {
        menu.addItem({label,current:zoom===msg.zoom,iconHTML:"",click:()=>{
          // Do not change a detached frame or a database view that switched away.
          if(!ctx.running() || ctx.mounted().get(av)!==mounted ||
            !frame.isConnected || ctx.currentView(header)!==mounted.viewId ||
            button.disabled)return;
          frame.contentWindow?.postMessage({type:"dodoGanttChangeZoom",zoom},location.origin);
        }});
      }
      menu.open({x,y});
      return;
    }
    if(msg.type==="dodoGanttReady" || msg.type==="dodoGanttReload") {
      void ctx.render(av);return;
    }
    if(msg.type==="dodoGanttOpenItem"){
      if(typeof msg.id!=="string"||!ID.test(msg.id))return;
      const record=mounted.ganttOpenTargets?.get(msg.id);
      if(!record)return;
      void openMapItem({blockId:record.blockId,itemId:msg.id,
        valueId:record.valueId,avID:av.dataset.avId||"",
        databaseBlockID:av.dataset.nodeId||"",title:record.title}).catch(error=>{
        console.warn("[Dodo 甘特图] 打开条目失败",error);
        showMessage(error instanceof Error?error.message:"打开数据库条目失败",5000,"error");
      });
      return;
    }
    if(msg.type==="dodoGanttSetTimeStep"){
      if(!Number.isSafeInteger(msg.requestId) ||
        ![0,15,30].includes(msg.timeStep) ||
        !["hour","day","week","month"].includes(msg.zoom) ||
        (msg.zoom==="hour" && msg.timeStep===0))return;
      void ctx.saveTimeStep(av,mounted,msg.requestId,
        msg.timeStep as 0|15|30,msg.zoom as "hour"|"day"|"week"|"month");
      return;
    }
    if(msg.type==="dodoGanttEdit") {
      if(!Number.isSafeInteger(msg.requestId)||typeof msg.id!=="string")return;
      const key=(av.dataset.nodeId||"")+":"+mounted.viewId+":"+msg.id;
      if(ctx.saving.has(key)){
        // Never silently discard a second edit while the iframe awaits an
        // acknowledgement: that leaves its saving flag stuck indefinitely.
        mounted.frame.contentWindow?.postMessage({
          type:"dodoGanttSaveResult",requestId:msg.requestId,
          success:false,error:"该任务的上一项修改还在保存中",
        },location.origin);
        return;
      }
      ctx.saving.add(key);
      void ctx.saveEdit(av,mounted,msg as GanttChange & {requestId:number;revision:number})
        .finally(()=>ctx.saving.delete(key));
    }
  };
}
