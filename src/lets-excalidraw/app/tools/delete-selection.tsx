import { ExcalidrawTrashIcon } from "./excalidraw-core-icons";
import React from "react";
import { commitElements } from "./scene-commands";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";

// Mind-map deletion requires its own parent/child and arrow cleanup; keep that
// operation out of this basic command until the dedicated mind-map module moves.
export function canDeleteSelection(context: SelectionContext) {
  if (!context.elements.length) return false;
  return context.elements.every(e => !e.customData?.dodoMind && !e.customData?.mindmap);
}
export function deleteSelection(context: SelectionContext) {
  if (!canDeleteSelection(context)) return false;
  const ids = new Set(context.elements.map(item => item.id));
  const all = context.api.getSceneElementsIncludingDeleted?.() || context.api.getSceneElements();
  for (const element of all) {
    if (element.type === "text" && element.containerId && ids.has(element.containerId)) ids.add(element.id);
  }
  const now = Date.now();
  const elements = all.map((element: any) => ids.has(element.id)
    ? { ...element, isDeleted: true, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now }
    : element);
  commitElements(context, elements, []);
  return true;
}
const deleteTool: ToolbarTool = {
  id: "delete-selection", label: "删除",
  icon: <ExcalidrawTrashIcon/>,
  when: canDeleteSelection, run: context => { deleteSelection(context); },
};
export default deleteTool;
