import { ExcalidrawTextIcon } from "./excalidraw-core-icons";
import React, { useState } from "react";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";
import { applyStylePatch, ColorField, Field, Segmented, DEFAULT_COLOR, visibleColor } from "./style-controls";

type Family = { value: number; label: string; font: string; lineHeight: number };
const families: Family[] = [
  { value: 5, label: "标题", font: 'Virgil, "Segoe UI Emoji", "Noto Color Emoji", cursive', lineHeight: 1.25 },
  { value: 6, label: "正常", font: 'Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif', lineHeight: 1.35 },
  { value: 8, label: "代码", font: '"Cascadia Code", "Cascadia Mono", Consolas, "Liberation Mono", Menlo, monospace', lineHeight: 1.25 },
];
const sizes = [16,20,28,36].map(value => ({ value, label: String(value) }));
const alignments = [{ value: "left", label: "左对齐" },{ value: "center", label: "居中对齐" },{ value: "right", label: "右对齐" }];
export function textTargets(context: SelectionContext) {
  const selectedIds = new Set(context.elements.map(element => element.id));
  const byId = new Map<string, any>();
  for (const element of context.elements) if (element.type === "text" && !element.isDeleted) byId.set(element.id,element);
  for (const element of context.api.getSceneElements()) {
    if (element.type === "text" && !element.isDeleted && element.containerId && selectedIds.has(element.containerId)) byId.set(element.id,element);
  }
  return [...byId.values()];
}
function measureText(element: any, patch: Record<string,any>) {
  if (element.containerId || element.autoResize === false) return null;
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fontSize = Number(patch.fontSize ?? element.fontSize) || 20;
  const fontFamily = Number(patch.fontFamily ?? element.fontFamily) || 5;
  const meta = families.find(family => family.value === fontFamily) || families[0];
  const lineHeight = Number(patch.lineHeight ?? element.lineHeight ?? meta.lineHeight) || 1.25;
  const lines = String(element.originalText ?? element.text ?? "").split("\n");
  ctx.font = `${fontSize}px ${meta.font}`;
  return { width: Math.max(1,...lines.map(line => Math.ceil(ctx.measureText(line || " ").width))),height: Math.max(fontSize,lines.length*fontSize*lineHeight) };
}
function TextStylePanel({ context }: { context: SelectionContext; close: () => void }) {
  const selected=textTargets(context), first=selected[0]||{}, app=context.appState;
  const [color,setColor]=useState(visibleColor(selected,"strokeColor",app.currentItemStrokeColor || DEFAULT_COLOR));
  const [family,setFamily]=useState<number>(Number(first.fontFamily) || Number(app.currentItemFontFamily) || 5);
  const [size,setSize]=useState<number>(Number(first.fontSize) || Number(app.currentItemFontSize) || 20);
  const [align,setAlign]=useState<string>(first.textAlign || app.currentItemTextAlign || "left");
  const patch=(value:Record<string,any>,defaults:Record<string,any>)=>applyStylePatch(context,textTargets(context), element=>{
    if (value.fontSize===undefined && value.fontFamily===undefined) return value;
    const meta=families.find(item=>item.value===(value.fontFamily??element.fontFamily))||families[0];
    const next=value.fontFamily===undefined ? value : {...value,lineHeight:meta.lineHeight};
    return {...next,...measureText(element,next)};
  }, defaults);
  return <div className="dt-style-panel">
    <Field name="字体"><Segmented items={families} active={family} onChange={value=>{patch({fontFamily:value},{currentItemFontFamily:value});setFamily(value);}}/></Field>
    <Field name="字号"><Segmented items={sizes} active={size} onChange={value=>{patch({fontSize:value},{currentItemFontSize:value});setSize(value);}}/></Field>
    <Field name="对齐"><Segmented items={alignments} active={align} onChange={value=>{patch({textAlign:value},{currentItemTextAlign:value});setAlign(value);}}/></Field>
    <ColorField name="文字颜色" color={color} index={4} onChange={value=>{patch({strokeColor:value},{currentItemStrokeColor:value});setColor(value);}}/>
  </div>;
}
const textStyle: ToolbarTool = {
  id: "text-style", label: "文字", Panel: TextStylePanel,
  icon: <ExcalidrawTextIcon/>,
  when: context => textTargets(context).length > 0,
};
export default textStyle;
