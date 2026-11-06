import { Workflow } from "lucide-react";
import React from "react";
import { buildGraph } from "./graph-model";
import { layout } from "./graph-layout";
import { applyScenePositions } from "../scene-positions";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";

function getTidyGraph(context: SelectionContext) {
  const ids = new Set(context.elements.map(element => element.id));
  const all = context.api.getSceneElementsIncludingDeleted?.() || context.api.getSceneElements();
  const labels = all.filter((element: any) => element.type === "text" && !element.isDeleted && element.containerId && ids.has(element.containerId));
  const elements = [...context.elements, ...labels].filter(element => !element.customData?.dodoMind?.mapId && !element.customData?.mindmap?.mapId);
  if (elements.length < 2) return null;
  const graph = buildGraph(elements);
  return graph?.nodes?.length >= 2 && graph.edges.length >= 1 ? graph : null;
}
export function tidyGraph(context: SelectionContext) {
  const graph = getTidyGraph(context);
  if (!graph) return false;
  const positions = layout(graph);
  return Boolean(positions?.size && applyScenePositions(context.api, positions, { straightenArrows: true }));
}
const tool: ToolbarTool = {
  id: "graph-tidy", label: "整理图表",
  icon: <Workflow size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => Boolean(getTidyGraph(context)),
  run: context => { tidyGraph(context); },
};
export default tool;
