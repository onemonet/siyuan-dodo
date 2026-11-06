import React from "react";
import { Network, GitBranchPlus, ListPlus, LayoutDashboard, Unlink2, ChevronRight, ChevronDown } from "lucide-react";
import type { ToolbarTool, SelectionContext } from "../toolbar/types";
import { branchStyleOf, mindData, type Direction, type BranchStyle } from "../mindmap/model";
import { createMindMap,createChild,createSibling,arrangeMindMap,changeDirection,changeBranchStyle,unlinkMindMap } from "../mindmap/actions";
import { canCollapseMind,hiddenMindNodeCount,isMindCollapsed,toggleMindBranch } from "../mindmap/collapse";
import "../mindmap/mindmap.css";

const enabled=()=>document.documentElement.dataset.dodoMindmap === "on";
function MindPanel({context,close}:{context:SelectionContext;close:()=>void}){
  const el=context.elements.length===1?context.elements[0]:null;
  const data=mindData(el);
  const all=context.api.getSceneElements();
  const mapRoot=data && all.find((node:any)=>node.customData?.dodoMind?.mapId===data.mapId&&!node.customData.dodoMind.parentId);
  const rootMeta=mindData(mapRoot);
  const action=(fn:()=>unknown)=>{fn();close();};
  return <div className="dodo-mind-panel">
    <strong>思维导图</strong>
    {!data?<button type="button" onClick={()=>action(()=>createMindMap(context.api,el))}>设为中心主题</button>:<>
      {canCollapseMind(all,el)&&<button type="button" aria-label={isMindCollapsed(el)?"展开子节点":"折叠子节点"}
        onClick={()=>action(()=>toggleMindBranch(context.api,el.id))}>
        {isMindCollapsed(el)?<ChevronRight size={16}/>:<ChevronDown size={16}/>}
        {isMindCollapsed(el)?`展开子节点（${hiddenMindNodeCount(el)}）`:"折叠子节点"}</button>}
      {!isMindCollapsed(el)&&<button type="button" onClick={()=>action(()=>createChild(context.api,el.id))}><GitBranchPlus size={16}/>添加子节点 <kbd>Tab</kbd></button>}
      {data.parentId&&<button type="button" onClick={()=>action(()=>createSibling(context.api,el.id))}><ListPlus size={16}/>添加同级节点 <kbd>Enter</kbd></button>}
      <button type="button" onClick={()=>action(()=>arrangeMindMap(context.api,el.id))}><LayoutDashboard size={16}/>整理导图</button>
      <span className="dodo-mind-panel-title">展开方向</span>
      <div className="dodo-mind-choices">{([['right','向右'],['left','向左'],['both','双向'],['down','向下']] as [Direction,string][]).map(([dir,label])=><button type="button"
        key={dir} aria-label={label} aria-pressed={(rootMeta?.direction||"right")===dir}
        onClick={()=>action(()=>changeDirection(context.api,dir,el.id))}>{label}</button>)}</div>
      <span className="dodo-mind-panel-title">连接线样式</span>
      <div className="dodo-mind-choices">{([['curve','曲线'],['elbow','折线'],['straight','直线']] as [BranchStyle,string][]).map(([style,label])=><button type="button"
        key={style} aria-label={label} aria-pressed={branchStyleOf(mapRoot)===style}
        onClick={()=>action(()=>changeBranchStyle(context.api,style,el.id))}>{label}</button>)}</div>
      <button type="button" onClick={()=>action(()=>unlinkMindMap(context.api,el.id))}><Unlink2 size={16}/>取消导图关系</button>
    </>}
  </div>;
}
const tool:ToolbarTool={
  id:"mind-map",label:"思维导图",icon:<Network size={17} strokeWidth={1.8} aria-hidden="true"/>,
  when:context=>enabled()&&context.elements.length===1&&
    Boolean(context.elements[0]?.customData?.dodoMind || !context.elements[0]?.locked &&
      !context.elements[0]?.containerId && ["rectangle","ellipse","diamond","text"].includes(context.elements[0]?.type)),
  Panel:MindPanel,
};
export default tool;
