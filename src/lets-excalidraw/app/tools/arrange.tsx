import React from "react";
import { MoveHorizontal, MoveVertical, LayoutGrid, Grid2X2 } from "lucide-react";
import { applyScenePositions } from "../scene-positions";
import type { SelectionContext, ToolAction, ToolbarTool } from "../toolbar/types";

type Direction = "horizontal" | "vertical" | "category" | "auto";
const GAP = 30, CATEGORY_GAP = 48;
const directions: Array<[Direction, string, React.ReactNode]> = [
  ["horizontal", "横向排列", <MoveHorizontal size={17} strokeWidth={1.6} aria-hidden="true"/>],
  ["vertical", "竖向排列", <MoveVertical size={17} strokeWidth={1.6} aria-hidden="true"/>],
  ["category", "分类排列", <LayoutGrid size={17} strokeWidth={1.6} aria-hidden="true"/>],
  ["auto", "自动排列", <Grid2X2 size={17} strokeWidth={1.6} aria-hidden="true"/>],
];
const xFirst = (a: any, b: any) => a.x - b.x || a.y - b.y;
const yFirst = (a: any, b: any) => a.y - b.y || a.x - b.x;

function positionsFor(context: SelectionContext, mode: Direction) {
  const elements = [...context.elements];
  if (elements.length < 2) return new Map();
  const sorted = [...elements].sort(mode === "vertical" || mode === "auto" ? yFirst : xFirst);
  const columns = mode === "vertical" ? 1 : mode === "auto" ? Math.ceil(Math.sqrt(elements.length)) : elements.length;
  const rows: any[][] = [];
  for (let index = 0; index < sorted.length; index += columns) rows.push(sorted.slice(index, index + columns));
  if (mode === "category") {
    const byType = new Map<string, any[]>();
    sorted.forEach(element => { const row = byType.get(element.type) || []; row.push(element); byType.set(element.type, row); });
    rows.splice(0, rows.length, ...byType.values());
  }
  const colWidths = Array.from({ length: Math.max(...rows.map(row => row.length)) }, (_, column) => Math.max(...rows.map(row => Math.abs(row[column]?.width || 0))));
  const rowHeights = rows.map(row => Math.max(...row.map(element => Math.abs(element.height || 0))));
  let y = Math.min(...elements.map(element => element.y));
  const result = new Map();
  rows.forEach((row, rowIndex) => {
    let x = Math.min(...elements.map(element => element.x));
    row.forEach((element, column) => { result.set(element.id, { x, y }); x += colWidths[column] + GAP; });
    y += rowHeights[rowIndex] + (mode === "category" ? CATEGORY_GAP : GAP);
  });
  return result;
}

function arrange(context: SelectionContext, mode: Direction) {
  const positions = positionsFor(context, mode);
  if (positions.size) applyScenePositions(context.api, positions);
}

const items: ToolAction[] = directions.map(([mode, label, icon]) => ({
  id: `arrange-${mode}`, label,
  icon,
  when: context => context.elements.length >= 2,
  run: context => arrange(context, mode),
}));

const arrangeTool: ToolbarTool = {
  id: "arrange", label: "排列", layout: "list",
  icon: <LayoutGrid size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => context.elements.length >= 2, items,
};
export default arrangeTool;
