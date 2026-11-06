import React from "react";
import { getCommonBounds } from "@excalidraw/excalidraw";
import { applyScenePositions } from "../scene-positions";
import type { SelectionContext, ToolAction } from "../toolbar/types";

function distribute(context: SelectionContext, axis: 0 | 1) {
  const elements = context.elements;
  if (elements.length < 3) return;
  const edges = elements.map(element => getCommonBounds([element] as any));
  const ordered = elements.map((element, index) => ({ element, bounds: edges[index] })).sort((a, b) => a.bounds[axis] - b.bounds[axis]);
  const start = ordered[0].bounds[axis], end = ordered[ordered.length - 1].bounds[axis + 2];
  const size = ordered.reduce((sum, item) => sum + item.bounds[axis + 2] - item.bounds[axis], 0);
  const gap = (end - start - size) / (ordered.length - 1);
  let cursor = start;
  const positions = new Map();
  for (const item of ordered) {
    const delta = cursor - item.bounds[axis];
    positions.set(item.element.id, { x: item.element.x + (axis === 0 ? delta : 0), y: item.element.y + (axis === 1 ? delta : 0) });
    cursor += item.bounds[axis + 2] - item.bounds[axis] + gap;
  }
  applyScenePositions(context.api, positions);
}

export const spacingItems: ToolAction[] = [
  { id: "arrange-distribute-x", label: "水平等距分布",
    icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.667 3.333v13.334M3.333 3.333v13.334"/><path d="M14.375 10.208v-.416c0-.92-.746-1.667-1.667-1.667H7.292c-.92 0-1.667.746-1.667 1.667v.416c0 .92.746 1.667 1.667 1.667h5.416c.92 0 1.667-.746 1.667-1.667Z"/></svg>,
    when: context => context.elements.length >= 3, run: context => distribute(context, 0) },
  { id: "arrange-distribute-y", label: "垂直等距分布",
    icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.333 3.333h13.334M3.333 16.667h13.334"/><path d="M10.208 5.625h-.416c-.92 0-1.667.746-1.667 1.667v5.416c0 .92.746 1.667 1.667 1.667h.416c.92 0 1.667-.746 1.667-1.667V7.292c0-.92-.747-1.667-1.667-1.667Z"/></svg>,
    when: context => context.elements.length >= 3, run: context => distribute(context, 1) },
];

