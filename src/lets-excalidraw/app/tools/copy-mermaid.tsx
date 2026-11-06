import { Copy } from "lucide-react";
import React from "react";
import { buildGraph } from "./graph-model";
import { exportMermaid } from "./mermaid-export";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";

function getMermaidGraph(context: SelectionContext) {
  const graph = buildGraph(context.elements);
  return graph?.nodes?.length >= 1 && graph.edges.length >= 1 ? graph : null;
}
async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard permission denied");
  } finally { input.remove(); }
}
export async function copyMermaid(context: SelectionContext) {
  const graph = getMermaidGraph(context);
  if (!graph) return false;
  const text = exportMermaid(graph, context.api.getSceneElementsIncludingDeleted?.() || context.api.getSceneElements());
  if (!text) throw new Error("无法生成 Mermaid 图表");
  try {
    await writeClipboard(text);
    context.api.setToast?.({ message: "已复制为 Mermaid" });
    return true;
  } catch {
    throw new Error("复制失败，请重试");
  }
}
const tool: ToolbarTool = {
  id: "copy-mermaid", label: "复制为 Mermaid",
  icon: <Copy size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => Boolean(getMermaidGraph(context)), run: async context => { await copyMermaid(context); },
};
export default tool;
