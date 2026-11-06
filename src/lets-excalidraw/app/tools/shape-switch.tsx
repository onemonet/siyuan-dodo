import React from "react";
import { Shapes } from "lucide-react";
import { ExcalidrawRectangleIcon, ExcalidrawDiamondIcon, ExcalidrawEllipseIcon } from "./excalidraw-core-icons";
import { newElementWith } from "@excalidraw/excalidraw";
import type { SelectionContext, ToolAction, ToolbarTool } from "../toolbar/types";

const shapes = [
  ["rectangle", "矩形", <ExcalidrawRectangleIcon/>],
  ["diamond", "菱形", <ExcalidrawDiamondIcon/>],
  ["ellipse", "椭圆", <ExcalidrawEllipseIcon/>],
] as const;
const isShape = (element: any) => shapes.some(([type]) => type === element?.type);

function switchShape(context: SelectionContext, target: string) {
  const ids = new Set(context.elements.map(element => element.id));
  const elements = context.api.getSceneElementsIncludingDeleted().map((element: any) => ids.has(element.id) && element.type !== target
    ? newElementWith(element, { type: target } as any) : element);
  context.api.updateScene({ elements, appState: context.appState, captureUpdate: "IMMEDIATELY" });
}

const items: ToolAction[] = shapes.map(([type, label, path]) => ({
  id: `shape-switch-${type}`, label,
  icon: path,
  when: context => context.elements.some(element => element.type !== type),
  run: context => switchShape(context, type),
}));

const shapeSwitch: ToolbarTool = {
  id: "shape-switch", label: "切换形状", layout: "list",
  icon: <Shapes size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => context.elements.length > 0 && context.elements.every(isShape),
  items,
};
export default shapeSwitch;
