import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Network, Plus, ListPlus, ChevronDown } from "lucide-react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type { InteractionFeature } from "../toolbar/types";
import { isMindNode, mindData, type Side } from "../mindmap/model";
import { selectedMindNode, selectedEligibleNode,createMindMap,createChild,createSibling,removeMindBranch } from "../mindmap/actions";
import "../mindmap/mindmap.css";
import { mountMindDragSort } from "../mindmap/drag-sort";
import { mountMindConnectorProtection } from "../mindmap/connector-protection";
import { mountMindTextAutoSize } from "../mindmap/text-edit";
import { canCollapseMind, hiddenMindNodeCount, isMindCollapsed, toggleMindBranch } from "../mindmap/collapse";

type Handle = {id:string;parentId:string|null;left:number;right:number;top:number;bottom:number;
  collapsible:boolean;collapsed:boolean;hiddenCount:number} | null;
type FoldBadge = {id:string;left:number;right:number;top:number;bottom:number;side:Side;count:number};
function MindHandles({api}:{api:any}){
  const [view,setView]=useState<{handle:Handle;badges:FoldBadge[]}>({handle:null,badges:[]});
  const signature=useRef("");
  useEffect(()=>{
    const update=()=>{
      const state=api.getAppState();
      const elements=api.getSceneElements();
      // Folded branches must keep their counts visible when nothing is
      // selected. Read their nested archives, never just direct children.
      const badges:FoldBadge[]=elements.filter((el:any)=>isMindNode(el)&&isMindCollapsed(el))
        .map((el:any)=>{
          const meta=mindData(el)!;
          const start=sceneCoordsToViewportCoords({sceneX:el.x,sceneY:el.y},state);
          const end=sceneCoordsToViewportCoords({sceneX:el.x+el.width,sceneY:el.y+el.height},state);
          const side:Side=meta.parentId?meta.side:
            meta.direction==="down"?"down":meta.direction==="left"?"left":"right";
          return {id:el.id,left:start.x,right:end.x,top:start.y,bottom:end.y,
            side,count:hiddenMindNodeCount(el)};
        });
      const node=selectedMindNode(api),meta=mindData(node);
      const busy=state.editingElement||state.editingTextElement||state.isResizing||state.isRotating||
        state.selectedElementsAreBeingDragged || (state.activeTool?.type!=="selection");
      let handle:Handle=null;
      if(node&&meta&&!busy&&!node.locked){
        const start=sceneCoordsToViewportCoords({sceneX:node.x,sceneY:node.y},state);
        const end=sceneCoordsToViewportCoords({sceneX:node.x+node.width,sceneY:node.y+node.height},state);
        handle={id:node.id,parentId:meta.parentId,left:start.x,right:end.x,top:start.y,bottom:end.y,
          collapsible:canCollapseMind(elements,node),collapsed:isMindCollapsed(node),
          hiddenCount:hiddenMindNodeCount(node)};
      }
      const next=JSON.stringify({handle,badges});
      if(next!==signature.current){signature.current=next;setView({handle,badges});}
    };
    const un=api.onChange(update);
    const timer=window.setInterval(update,170);
    const clear=()=>update();
    window.addEventListener("resize",clear);
    document.addEventListener("pointerup",clear,true);
    update();
    return()=>{un?.();window.clearInterval(timer);window.removeEventListener("resize",clear);
      document.removeEventListener("pointerup",clear,true);};
  },[api]);
  const {handle,badges}=view;
  if(!handle&&!badges.length)return null;
  const doAction=(fn:()=>unknown)=>(event:React.MouseEvent<HTMLButtonElement>)=>{
    event.preventDefault();event.stopPropagation();fn();
  };
  const gap=22,centerY=handle?(handle.top+handle.bottom)/2:0,
    centerX=handle?(handle.left+handle.right)/2:0;
  return <div className="dodo-mind-handles" aria-label="思维导图节点手柄">
    {badges.map(badge=><button key={badge.id} type="button"
      className="dodo-mind-fold-count"
      data-node-id={badge.id} data-count={badge.count} data-side={badge.side}
      title={`展开 ${badge.count} 个子孙节点`} aria-label="展开子节点"
      style={{left:badge.side==="left"?badge.left-27:badge.side==="down"?(badge.left+badge.right)/2:badge.right+27,
        top:badge.side==="down"?badge.bottom+27:(badge.top+badge.bottom)/2}}
      onPointerDown={event=>event.preventDefault()}
      onClick={doAction(()=>toggleMindBranch(api,badge.id))}>{badge.count}</button>)}
    {handle&&<>
      {handle.collapsible&&!handle.collapsed&&<button type="button"
        title="折叠子节点" aria-label="折叠子节点"
        data-fold="true" style={{left:handle.right+gap,top:centerY}}
        onPointerDown={event=>event.preventDefault()}
        onClick={doAction(()=>toggleMindBranch(api,handle.id))}>
        <ChevronDown size={16}/></button>}
      {!handle.collapsed&&<button type="button" title="添加子节点 (Tab)" aria-label="添加子节点"
        style={{left:handle.right+(handle.collapsible?gap+32:gap),top:centerY}}
        onPointerDown={event=>event.preventDefault()}
        onClick={doAction(()=>createChild(api,handle.id))}><Plus size={17}/></button>}
      {handle.parentId && <button type="button" title="添加同级节点 (Enter)" aria-label="添加同级节点"
        style={{left:centerX,top:handle.bottom+gap}} onPointerDown={event=>event.preventDefault()}
        onClick={doAction(()=>createSibling(api,handle.id))}><ListPlus size={16}/></button>}
    </>}
  </div>;
}
const feature:InteractionFeature={
  id:"mindMap",label:"思维导图",
  description:"原生 Excalidraw 节点与箭头，支持 Tab/Enter、四向布局、折叠展开与分支操作。",
  defaultEnabled:true,
  mount(api){
    document.documentElement.dataset.dodoMindmap="on";
    const host=document.createElement("div");host.className="dodo-mind-root";document.body.append(host);
    const root=createRoot(host);root.render(<MindHandles api={api}/>);
    const unmountConnectorProtection=mountMindConnectorProtection(api);
    const unmountDragSort=mountMindDragSort(api);
    const unmountAutoSize=mountMindTextAutoSize(api);
    const launcher=document.createElement("button");launcher.type="button";
    launcher.className="dodo-mind-launcher";launcher.title="创建思维导图";
    launcher.setAttribute("aria-label","创建思维导图");
    const iconRoot=createRoot(launcher);
    iconRoot.render(<Network size={19} strokeWidth={1.7} aria-hidden="true"/>);
    const create=()=>{
      try{const node=selectedEligibleNode(api);const id=createMindMap(api,node);
        if(id)api.setToast?.({message:node?"已将选中图形设为中心主题":"已创建思维导图",duration:1600});
      }catch(reason){api.setToast?.({message:String(reason),duration:2500});}
    };
    launcher.addEventListener("click",create);
    const attach=()=>{
      const anchor=document.querySelector('.dodo-icon-launcher') ||
        document.querySelector('[data-testid="toolbar-image"]')?.closest('label') ||
        document.querySelector('.excalidraw .App-toolbar .ToolIcon')?.parentElement;
      if(anchor?.parentElement && launcher.previousElementSibling!==anchor)anchor.insertAdjacentElement("afterend",launcher);
    };
    const observer=new MutationObserver(attach);
    observer.observe(document.querySelector('.excalidraw')||document.body,{childList:true,subtree:true});attach();
    const keydown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.ctrlKey||event.metaKey||event.altKey||event.isComposing||
        event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"],.dodo-mind-panel'))return;
      const state=api.getAppState();
      if(state.editingElement||state.editingTextElement||state.activeTool?.type!=="selection")return;
      const ids=Object.entries(state.selectedElementIds||{}).filter(([,v])=>v).map(([id])=>id);
      const elements=api.getSceneElements();const maps=ids.filter(id=>elements.some((el:any)=>el.id===id&&mindData(el)));
      if(!maps.length)return;
      if(event.key==="Tab" && maps.length===1){event.preventDefault();event.stopImmediatePropagation();createChild(api,maps[0]);}
      else if(event.key==="Enter" && maps.length===1){
        if(!mindData(elements.find((el:any)=>el.id===maps[0]))?.parentId)return;
        event.preventDefault();event.stopImmediatePropagation();createSibling(api,maps[0]);
      } else if(event.key==="Delete" || event.key==="Backspace"){
        event.preventDefault();event.stopImmediatePropagation();removeMindBranch(api,maps);
      }
    };
    document.addEventListener("keydown",keydown,true);
    return()=>{
      document.removeEventListener("keydown",keydown,true);observer.disconnect();launcher.removeEventListener("click",create);
      unmountDragSort();unmountConnectorProtection();unmountAutoSize();root.unmount();iconRoot.unmount();launcher.remove();host.remove();delete document.documentElement.dataset.dodoMindmap;
    };
  },
};
export default feature;
