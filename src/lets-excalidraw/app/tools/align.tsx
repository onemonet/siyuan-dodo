import React from "react";
import { getCommonBounds } from "@excalidraw/excalidraw";
import { applyScenePositions } from "../scene-positions";
import { spacingItems } from "./distribute";
import type { SelectionContext, ToolAction, ToolbarTool } from "../toolbar/types";

type Direction = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
const directions: Array<[Direction, string, string]> = [
  ["left", "左对齐", 'M3.333 3.333v13.334|M15.208 4.792H8.125c-.92 0-1.667.746-1.667 1.666v.417c0 .92.747 1.667 1.667 1.667h7.083c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666ZM12.516 11.458H8.125c-.92 0-1.667.746-1.667 1.667v.417c0 .92.747 1.666 1.667 1.666h4.391c.92 0 1.667-.746 1.667-1.666v-.417c0-.92-.746-1.667-1.667-1.667Z'],
  ["center-x", "水平居中", 'M10 18.333v-2.916|M10 11.667V8.333|M10 4.583V1.667|M4.792 13.125v.417c0 .92.746 1.666 1.666 1.666h7.084c.92 0 1.666-.746 1.666-1.666v-.417c0-.92-.746-1.667-1.666-1.667H6.458c-.92 0-1.666.746-1.666 1.667ZM6.458 6.458v.417c0 .92.747 1.667 1.667 1.667h3.75c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666h-3.75c-.92 0-1.667.746-1.667 1.666Z'], 
  ["right", "右对齐", 'M16.667 3.333v13.334|M11.875 4.792H4.792c-.92 0-1.667.746-1.667 1.666v.417c0 .92.746 1.667 1.667 1.667h7.083c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666ZM11.683 11.458H7.292c-.92 0-1.667.746-1.667 1.667v.417c0 .92.746 1.666 1.667 1.666h4.39c.921 0 1.667-.746 1.667-1.666v-.417c0-.92-.746-1.667-1.666-1.667Z'],
  ["top", "顶对齐", 'M3.333 3.333h13.334|M13.542 6.458h-.417c-.92 0-1.667.747-1.667 1.667v7.083c0 .92.746 1.667 1.667 1.667h.417c.92 0 1.666-.746 1.666-1.667V8.125c0-.92-.746-1.667-1.666-1.667ZM6.875 6.458h-.417c-.92 0-1.666.747-1.666 1.667v3.75c0 .92.746 1.667 1.666 1.667h.417c.92 0 1.667-.746 1.667-1.667v-3.75c0-.92-.747-1.667-1.667-1.667Z'],
  ["center-y", "垂直居中", 'M1.667 10h2.916|M8.333 10h3.334|M15.417 10h2.916|M6.875 4.792h-.417c-.92 0-1.666.746-1.666 1.666v7.084c0 .92.746 1.666 1.666 1.666h.417c.92 0 1.667-.746 1.667-1.666V6.458c0-.92-.747-1.666-1.667-1.666ZM13.542 6.458h-.417c-.92 0-1.667.747-1.667 1.667v3.75c0 .92.746 1.667 1.667 1.667h.417c.92 0 1.666-.746 1.666-1.667v-3.75c0-.92-.746-1.667-1.666-1.667Z'], 
  ["bottom", "底对齐", 'M3.333 16.667h13.334|M6.875 3.125h-.417c-.92 0-1.666.746-1.666 1.667v7.083c0 .92.746 1.667 1.666 1.667h.417c.92 0 1.667-.746 1.667-1.667V4.792c0-.92-.747-1.667-1.667-1.667ZM13.542 5.817h-.417c-.92 0-1.667.747-1.667 1.667v4.391c0 .92.746 1.667 1.667 1.667h.417c.92 0 1.666-.747 1.666-1.667V7.484c0-.92-.746-1.667-1.666-1.667Z'],
];

function align(context: SelectionContext, direction: Direction) {
  const selected = context.elements;
  if (selected.length < 2) return;
  const edges = selected.map(element => getCommonBounds([element] as any));
  const left = Math.min(...edges.map(bounds => bounds[0]));
  const top = Math.min(...edges.map(bounds => bounds[1]));
  const right = Math.max(...edges.map(bounds => bounds[2]));
  const bottom = Math.max(...edges.map(bounds => bounds[3]));
  const target = { x: left, y: top, centerX: (left + right) / 2, centerY: (top + bottom) / 2, right, bottom };
  const positions = new Map(selected.map((element, index) => {
    const bounds = edges[index];
    const x = direction === "left" ? element.x + target.x - bounds[0]
      : direction === "right" ? element.x + target.right - bounds[2]
      : direction === "center-x" ? element.x + target.centerX - (bounds[0] + bounds[2]) / 2
      : element.x;
    const y = direction === "top" ? element.y + target.y - bounds[1]
      : direction === "bottom" ? element.y + target.bottom - bounds[3]
      : direction === "center-y" ? element.y + target.centerY - (bounds[1] + bounds[3]) / 2
      : element.y;
    return [element.id, { x, y }];
  }));
  applyScenePositions(context.api, positions);
}

const nativeIcon = (paths: string) => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.split("|").map(path => <path key={path} d={path}/>)}</svg>;
const alignItems: ToolAction[] = directions.map(([direction, label, paths]) => ({
  id: `align-${direction}`,
  label,
  icon: nativeIcon(paths),
  when: context => context.elements.length >= 2,
  run: context => align(context, direction),
}));

const items: ToolAction[] = [
  ...alignItems.slice(0, 3), spacingItems[0],
  ...alignItems.slice(3), spacingItems[1],
];

const alignTool: ToolbarTool = {
  id: "align",
  label: "对齐",
  layout: "grid",
  columns: context => context.elements.length >= 3 ? 4 : 3,
  icon: nativeIcon(directions[0][2]),
  when: context => context.elements.length >= 2,
  items,
};
export default alignTool;
