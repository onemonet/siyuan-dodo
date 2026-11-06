import { Combine } from "lucide-react";
import React from "react";
import { newId, randomNonce, commitElements } from "./scene-commands";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";

const supports = (e: any) => Boolean(e && !e.isDeleted && e.type === "text" && !e.containerId);
const rawText = (e: any) => String(e.rawText ?? e.originalText ?? e.text ?? "");
export function textTransformMode(elements: readonly any[]) {
  if (!elements.length || elements.some(element => !supports(element))) return null;
  if (elements.length > 1) return "merge";
  return /\r?\n/.test(rawText(elements[0])) ? "split" : null;
}
function freshText(base: any, text: string, y: number, height: number) {
  return {
    ...base, id: newId(), seed: randomNonce(), version: 1, versionNonce: randomNonce(), updated: Date.now(),
    isDeleted: false, boundElements: null, containerId: null,
    groupIds: Array.isArray(base.groupIds) ? [...base.groupIds] : [],
    x: base.x, y, text, rawText: text, originalText: text, autoResize: true,
    width: Math.max(1, Math.round(base.width || base.fontSize || 20)), height: Math.max(1, height),
  };
}
export function transformText(context: SelectionContext) {
  const mode = textTransformMode(context.elements);
  if (!mode) return false;
  const all = context.api.getSceneElements();
  let elements: any[], result: any[];
  if (mode === "split") {
    const base = context.elements[0], lines = rawText(base).split(/\r?\n/);
    const height = (base.height || 0) / Math.max(lines.length, 1) || (base.fontSize || 20) * (base.lineHeight || 1.25);
    result = lines.map((line, index) => freshText(base, line, base.y + index * height, height));
    elements = all.flatMap((item: any) => item.id === base.id ? result : [item]);
  } else {
    const ordered = [...context.elements].sort((a,b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));
    const base = ordered[0], sourceIds = new Set(ordered.map(item => item.id));
    const text = ordered.map(rawText).join("\n");
    const height = ordered.reduce((sum,item) => sum + (item.height || (item.fontSize || 20) * (item.lineHeight || 1.25)), 0);
    const merged = { ...freshText(base, text, Math.min(...ordered.map(item => item.y)), height),
      x: Math.min(...ordered.map(item => item.x)), width: Math.max(...ordered.map(item => item.width || item.fontSize || 20)) };
    result = [merged];
    elements = [...all.filter((item: any) => !sourceIds.has(item.id)), merged];
  }
  commitElements(context, elements, result);
  return true;
}
const textTransform: ToolbarTool = {
  id: "text-transform", label: "拆分/合并文字",
  icon: <Combine size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => Boolean(textTransformMode(context.elements)), run: context => { transformText(context); },
};
export default textTransform;
