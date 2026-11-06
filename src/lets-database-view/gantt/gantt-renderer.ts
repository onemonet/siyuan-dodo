import { showMessage } from "siyuan";
import { DatabaseViewConfigStore } from "../view-config-store";
import { databaseViewWrites } from "../core/view-write-coordinator";
import { saveGanttChange, type GanttChange } from "./gantt-write";
import type { Mounted } from "../visual/visual-view-service";
import { databaseViewHost } from "../core/view-host";
import { renderAttributeView } from "../../shared/av/kernel-api";
import type { AvRenderData } from "../../shared/av/av-data-adapter";
import { makeGanttResult } from "./gantt-model";
import type { VisualRenderBridge, VisualWriteBridge } from "../visual/visual-render-bridge";
const ID = /^\d{14}-[a-z0-9]{7}$/;

export async function renderGanttView(av: HTMLElement, bridge: VisualRenderBridge): Promise<void> {
    const mounted=bridge.mounted().get(av);
    if(!bridge.enabled('gantt') || !mounted || mounted.kind!=="gantt" || !mounted.frame.isConnected)return;
    // Native AV writes frequently trigger scroll/header mutations. Never
    // publish a fresh revision *during* an in-flight edit: the iframe still
    // holds its pre-save snapshot and would otherwise reject the next drag.
    const busyPrefix=(av.dataset.nodeId||"")+":"+mounted.viewId+":";
    if(Array.from(bridge.ganttSaving).some(key=>key.startsWith(busyPrefix)))return;
    const sequence=(mounted.ganttRenderSequence||0)+1;
    mounted.ganttRenderSequence=sequence;
    const target=mounted.frame.contentWindow;
    if(!target)return;
    const isCurrent = databaseViewHost.beginRead(mounted.frame);
    const send=(payload:Record<string,unknown>)=>{
      if(isCurrent() && bridge.mounted().get(av)===mounted && target===mounted.frame.contentWindow)
        target.postMessage({type:"dodoGanttData",...payload},location.origin);
    };
    try {
      const blockId=av.dataset.nodeId||"";
      const avID=av.dataset.avId||"";
      if(!ID.test(blockId)||!ID.test(avID)||!ID.test(mounted.viewId))throw new Error("数据库 ID 无效");
      const config=(await bridge.read(blockId))[mounted.viewId]?.gantt||{};
      const raw=await renderAttributeView({id:avID,blockID:blockId,viewID:mounted.viewId,pageSize:100000,query:bridge.search(av)}) as AvRenderData;
      const data=makeGanttResult(raw,config);
      if(!isCurrent() || bridge.mounted().get(av)!==mounted || mounted.ganttRenderSequence!==sequence ||
        Array.from(bridge.ganttSaving).some(key=>key.startsWith(busyPrefix)))return;
      mounted.ganttMapping=data.mapping;
      mounted.ganttOpenTargets=new Map(data.data.filter(task=>ID.test(task.id)&&
        task.type!=="project"&&(ID.test(task.blockId||"")||ID.test(task.valueId||"")))
        .map(task=>[task.id,{blockId:task.blockId||"",valueId:task.valueId||"",
          title:task.text}]));
      mounted.ganttRevision=(mounted.ganttRevision||0)+1;
      send({data:data.data,sourceName:raw.name||"思源数据库",warning:data.warning,
        typography:bridge.typography(av),
        fieldMapping:data.mapping,progressMax:config.progressMax===1?1:100,
        editableProgress:Boolean(data.mapping.progress), editableDates:Boolean(data.mapping.start),
        timeStep:config.timeStep===15?15:config.timeStep===30?30:0,
        zoom:config.zoom||((config.timeStep===15||config.timeStep===30)?"hour":"week"),
        revision:mounted.ganttRevision});
    }catch(error){
      if(mounted.ganttRenderSequence===sequence)
        send({data:[],warning:"甘特视图读取失败："+(error instanceof Error?error.message:String(error))});
    }
  
}

export async function saveGanttTimeStepView(
    av:HTMLElement,mounted:Mounted,requestId:number,timeStep:0|15|30,
    zoom:"hour"|"day"|"week"|"month",
  bridge: VisualWriteBridge): Promise<void> {
    const blockId=av.dataset.nodeId||"";
    const lock=blockId+":"+mounted.viewId;
    let failure="";
    try{
      if(!ID.test(blockId)||!ID.test(mounted.viewId))
        throw new Error("当前数据库或视图 ID 无效");
      if(bridge.ganttScaleSaving.has(lock))
        throw new Error("上一次时间精度切换还未完成");
      bridge.ganttScaleSaving.add(lock);
      const current=(await DatabaseViewConfigStore.load(blockId)).views[mounted.viewId];
      if(current?.mode!=="gantt")throw new Error("甘特视图已切换");
      if(!bridge.liveAv(mounted))
        throw new Error("甘特视图已关闭");
      const doc=await DatabaseViewConfigStore.updateView(blockId,mounted.viewId,entry=>{
        if(entry.mode!=="gantt")throw new Error("甘特视图已切换");
        return {...entry,configs:{...entry.configs,gantt:{
          ...entry.configs.gantt,timeStep,zoom,
        }}};
      });
      bridge.updated(blockId,doc);
    }catch(error){
      failure=error instanceof Error?error.message:String(error);
    }finally{
      bridge.ganttScaleSaving.delete(lock);
    }
    const activeAv=bridge.liveAv(mounted);
    if(!activeAv || !mounted.frame.contentWindow)return;
    mounted.frame.contentWindow.postMessage({
      type:"dodoGanttTimeStepSaved",requestId,success:!failure,error:failure,
    },location.origin);
    if(failure)showMessage("甘特时间精度保存失败："+failure,5000,"error");
    else await renderGanttView(activeAv,bridge);
  
}

export async function saveGanttEditView(av:HTMLElement,mounted:Mounted,
    change:GanttChange & {requestId:number;revision:number}, bridge: VisualWriteBridge): Promise<void> {
    let failure="";
    try{
      if(change.revision!==mounted.ganttRevision)throw new Error("数据已刷新，请重新拖动");
      if(!ID.test(change.id) || !["dates","progress"].includes(change.kind) ||
        !change.before || !change.after)throw new Error("无效的任务更改");
      const blockId=av.dataset.nodeId||"",avID=av.dataset.avId||"";
      const latest=(await DatabaseViewConfigStore.load(blockId)).views[mounted.viewId];
      if(latest?.mode!=="gantt")throw new Error("甘特视图已切换");
      const storedMapping=latest.configs.gantt?.fieldMapping;
      if(storedMapping && mounted.ganttMapping &&
        (["title","start","end","progress","group","color"] as const)
          .some(key=>(storedMapping[key]||"") !== (mounted.ganttMapping![key]||"")))
        throw new Error("甘特字段映射已修改，请等待视图刷新后再编辑");
      const currentAv=bridge.liveAv(mounted);
      if(!currentAv || currentAv.dataset.nodeId!==blockId ||
        currentAv.dataset.avId!==avID)throw new Error("甘特已关闭");
      const header=currentAv.querySelector<HTMLElement>(":scope > .av__container > .av__header");
      if(!header || bridge.currentView(header)!==mounted.viewId)throw new Error("数据库视图已切换");
      await databaseViewWrites.run({
        blockId, viewId: mounted.viewId, kind: "gantt",
        action: change.kind, itemId: change.id,
      }, () => saveGanttChange({avID,blockId,viewID:mounted.viewId},
        {...(latest.configs.gantt||{}),
          fieldMapping:storedMapping || mounted.ganttMapping},change));
    }catch(error){failure=error instanceof Error?error.message:String(error);}
    // AV DOM nodes may have been replaced during the native write. An
    // adopted mount is still the same live iframe and must receive its ACK.
    const stillMounted=Array.from(bridge.mounted().values()).includes(mounted);
    if(stillMounted && mounted.frame.contentWindow){
      mounted.frame.contentWindow.postMessage({type:"dodoGanttSaveResult",
        requestId:change.requestId,success:!failure,error:failure},location.origin);
      if(failure)showMessage(
        failure.startsWith("甘特自动保存失败") ? failure : "甘特自动保存失败："+failure,
        6500,"error");
    }
  
}
