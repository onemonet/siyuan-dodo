import { ExcalidrawArrowIcon } from "./excalidraw-core-icons";
import React, { useState } from "react";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";
import { applyStylePatch, Field, Segmented } from "./style-controls";

const targetsFor = (context: SelectionContext) => context.elements.filter(element => element.type === "arrow" && !element.isDeleted);
export const arrowType = (element: any) => element?.elbowed ? "elbow" : element?.roundness?.type === 2 ? "curved" : "sharp";
export const arrowTypePatch = (type: string) => type === "curved" ? { roundness: { type: 2 }, elbowed: false }
  : type === "elbow" ? { roundness: { type: 2 }, elbowed: true } : { roundness: null, elbowed: false };
const typeItems = [
  {value:"sharp",label:"直箭头",icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18 18 6m-4 0h4v4"/></svg>},
  {value:"curved",label:"曲线箭头",icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 20c0-7 5-11 12-11m-4-4 4 4-4 4"/></svg>},
  {value:"elbow",label:"折线箭头",icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19h8V7h8m-4-4 4 4-4 4"/></svg>},
];
const heads: { value: string | null; label: string; drawing: React.ReactNode; fill?: boolean; crow?: boolean }[] = [
  {value:null,label:"无",drawing:<><path d="M7 11h12"/><path d="m25 6 8 10m0-10-8 10" opacity=".3"/></>},
  {value:"arrow",label:"箭头",drawing:<path d="M7 11h26m-10-6 10 6-10 6"/>},
  {value:"triangle",label:"三角箭头",drawing:<><path d="M7 11h16"/><path d="m23 5 12 6-12 6z"/></>,fill:true},
  {value:"triangle_outline",label:"三角箭头（空心）",drawing:<><path d="M7 11h16"/><path d="m23 5 12 6-12 6z"/></>},
  {value:"dot",label:"圆点",drawing:<><path d="M7 11h18"/><circle cx="29" cy="11" r="4"/></>,fill:true},
  {value:"circle_outline",label:"圆点（空心）",drawing:<><path d="M7 11h18"/><circle cx="29" cy="11" r="4"/></>},
  {value:"circle",label:"空心圆",drawing:<><path d="M7 11h18"/><circle cx="29" cy="11" r="4"/></>},
  {value:"diamond",label:"菱形",drawing:<><path d="M7 11h14"/><path d="m21 11 7-6 7 6-7 6z"/></>,fill:true},
  {value:"diamond_outline",label:"菱形（空心）",drawing:<><path d="M7 11h14"/><path d="m21 11 7-6 7 6-7 6z"/></>},
  {value:"bar",label:"条状",drawing:<path d="M11 11h20M31 5v12"/>},
  {value:"crowfoot_one",label:"Crow's foot (one)",drawing:<path d="M35 11H7M15 5v12"/>,crow:true},
  {value:"crowfoot_many",label:"Crow's foot (many)",drawing:<path d="M35 11H7M15 11 7 5m8 6-8 6"/>,crow:true},
  {value:"crowfoot_one_or_many",label:"Crow's foot (one or many)",drawing:<path d="M35 11H7M23 5v12M15 11 7 5m8 6-8 6"/>,crow:true},
];
function HeadIcon({ item, start }: {item: typeof heads[number];start:boolean}) {
  const flipped=item.crow ? !start : start;
  return <svg viewBox="0 0 40 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g transform={flipped ? "translate(40,0) scale(-1,1)" : undefined} fill={item.fill ? "currentColor" : "none"}>{item.drawing}</g>
  </svg>;
}
function ArrowPanel({ context }: {context:SelectionContext;close:()=>void}) {
  const first=targetsFor(context)[0]||{};
  const [type,setType]=useState(arrowType(first));
  const [endpoint,setEndpoint]=useState<"start"|"end">("end");
  const [startHead,setStartHead]=useState<string|null>(Object.prototype.hasOwnProperty.call(first,"startArrowhead") ? first.startArrowhead : context.appState.currentItemStartArrowhead ?? null);
  const [endHead,setEndHead]=useState<string|null>(Object.prototype.hasOwnProperty.call(first,"endArrowhead") ? first.endArrowhead : context.appState.currentItemEndArrowhead ?? "arrow");
  const patch=(value:Record<string,any>, defaults:Record<string,any>)=>applyStylePatch(context,targetsFor(context),element=>{
    if (!Object.prototype.hasOwnProperty.call(value,"roundness") || element.roundness?.type !== value.roundness?.type) return value;
    return {...value,roundness:element.roundness};
  },defaults);
  const head=endpoint==="start" ? startHead : endHead;
  return <div className="dt-style-panel">
    <Field name="箭头类型"><Segmented items={typeItems} active={type} onChange={value=>{
      const next=arrowTypePatch(value);patch(next,{currentItemRoundness:next.roundness});setType(value);
    }}/></Field>
    <Field name="端点"><Segmented items={[{value:"start",label:"起点"},{value:"end",label:"终点"}]} active={endpoint} onChange={value => setEndpoint(value as "start" | "end")}/></Field>
    <Field name="端点样式"><div className="dt-arrow-heads">{heads.map((item,index)=><button key={index} type="button" title={item.label} aria-label={item.label} aria-pressed={item.value===head} onClick={()=>{
      const key=endpoint==="start" ? "startArrowhead":"endArrowhead";
      patch({[key]:item.value},{[endpoint==="start" ? "currentItemStartArrowhead":"currentItemEndArrowhead"]:item.value});
      if(endpoint==="start")setStartHead(item.value);else setEndHead(item.value);
    }}><HeadIcon item={item} start={endpoint==="start"}/></button>)}</div></Field>
  </div>;
}
const arrowStyle: ToolbarTool={
  id:"arrow-style",label:"箭头",Panel:ArrowPanel,
  icon: <ExcalidrawArrowIcon/>,
  when:context=>targetsFor(context).length>0,
};
export default arrowStyle;
