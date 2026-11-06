import React from "react";
import { SquareStack, SquaresIntersect, SquaresSubtract, SquaresUnite } from "lucide-react";
import { removeDeletedElementArrows } from "../interactions/auto-delete-bound-arrows";
import type { SelectionContext, ToolAction, ToolbarTool } from "../toolbar/types";
import { commitElements, randomNonce } from "./scene-commands";
import { getSelectedSupportedElements, perform } from "./boolean-ops.js";

type Operation = "union" | "difference" | "intersection" | "xor" | "split";

function applyBoolean(context: SelectionContext, operation: Operation): boolean {
  const selected = getSelectedSupportedElements(context);
  if (selected.length < 2) return false;
  const result = perform(operation, selected);
  if (!result.data || result.error) {
    throw new Error(result.error?.includes("empty-result")
      ? "布尔运算结果为空，请检查图形是否重叠。" : `布尔运算失败：${result.error || operation}`);
  }
  const { newElements, oldElements } = result.data;
  if (!newElements.length) return false;
  const ids = new Set(oldElements.map((element: any) => element.id));
  const elements = context.api.getSceneElementsIncludingDeleted()
    .map((element: any) => ids.has(element.id) && !element.isDeleted
      ? { ...element, isDeleted: true, version: (element.version || 0) + 1,
          versionNonce: randomNonce(), updated: Date.now() } : element);
  // Bound arrows referencing replaced shapes must not survive as dangling
  // connections. Keep this within the same undoable update, not a second step.
  const cleaned = removeDeletedElementArrows(elements) || elements;
  const next = [...cleaned, ...newElements];
  commitElements(context, next, newElements);
  return true;
}

/**
 * XOR icon derived from Lucide's squares-intersect geometry:
 * the two overlapping square outlines are solid (never dashed),
 * and the center overlap is redrawn with curved Bézier boundaries.
 */
export function SquaresXorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={17} height={17}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className="lucide lucide-squares-xor" aria-hidden="true">
      <path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/>
      <path d="M16 8h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-4"/>
      <path d="M8 10c1-1.3 2.5-2 4-2s3 .7 4 2v4c-1 1.3-2.5 2-4 2s-3-.7-4-2z"/>
    </svg>
  );
}

const commands: Array<[Operation, string, React.ReactNode]> = [
  ["union", "并集", <SquaresUnite size={17} strokeWidth={1.6} aria-hidden="true" />],
  ["difference", "差集", <SquaresSubtract size={17} strokeWidth={1.6} aria-hidden="true" />],
  ["intersection", "交集", <SquaresIntersect size={17} strokeWidth={1.6} aria-hidden="true" />],
  ["xor", "异或", <SquaresXorIcon />],
  ["split", "拆分", <SquareStack size={17} strokeWidth={1.6} aria-hidden="true" />],
];
const items: ToolAction[] = commands.map(([operation,label,icon]) => ({
  id: `boolean-${operation}`, label, icon,
  run: context => { applyBoolean(context, operation); },
}));
const booleanTool: ToolbarTool = {
  id: "boolean", label: "布尔运算", layout: "list",
  icon: <SquaresUnite size={17} strokeWidth={1.6} aria-hidden="true" />,
  when: context => getSelectedSupportedElements(context).length >= 2,
  items,
};
export { applyBoolean };
export default booleanTool;
