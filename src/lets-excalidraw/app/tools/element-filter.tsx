import React from "react";
import { Network, Shapes, EllipsisVertical, LayoutGrid } from "lucide-react";
import { ExcalidrawArrowIcon, ExcalidrawLineIcon, ExcalidrawFreedrawIcon, ExcalidrawImageIcon, ExcalidrawTextIcon, ExcalidrawFrameIcon } from "./excalidraw-core-icons";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { selectElements } from "./scene-commands";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";

type Group = { key: string; label: string; types?: string[]; match?: (element: any) => boolean; icon: React.ReactNode };
const groups: Group[] = [
  { key: "mindmap", label: "思维导图", match: e => Boolean(e?.customData?.dodoMind || e?.customData?.mindmap), icon: <Network size={17} strokeWidth={1.6} aria-hidden="true"/> },
  { key: "shapes", label: "基本图形", types: ["rectangle", "ellipse", "diamond"], icon: <Shapes size={17} strokeWidth={1.6} aria-hidden="true"/> },
  { key: "arrows", label: "箭头", types: ["arrow"], icon: <ExcalidrawArrowIcon/> },
  { key: "lines", label: "线条", types: ["line"], icon: <ExcalidrawLineIcon/> },
  { key: "freedraw", label: "画笔", types: ["freedraw"], icon: <ExcalidrawFreedrawIcon/> },
  { key: "images", label: "图片", types: ["image"], icon: <ExcalidrawImageIcon/> },
  { key: "text", label: "文本", types: ["text"], icon: <ExcalidrawTextIcon/> },
  { key: "frames", label: "画框", types: ["frame"], icon: <ExcalidrawFrameIcon/> },
  { key: "other", label: "其他", match: () => true, icon: <EllipsisVertical size={17} strokeWidth={1.6} aria-hidden="true"/> },
];
export function analyzeSelection(elements: readonly any[]) {
  const result = new Map(groups.map(group => [group.key, { ...group, elements: [] as any[] }]));
  for (const element of elements) {
    if (!element || element.isDeleted) continue;
    const group = groups.find(item => item.match?.(element) || item.types?.includes(element.type))!;
    result.get(group.key)!.elements.push(element);
  }
  return [...result.values()].filter(item => item.elements.length > 0);
}
export function filterSelection(context: SelectionContext, key: string) {
  const group = analyzeSelection(context.elements).find(item => item.key === key);
  if (!group?.elements.length) return false;
  const elements = context.api.getSceneElements();
  context.api.updateScene({ appState: { ...context.appState, ...selectElements(elements, group.elements) }, captureUpdate: CaptureUpdateAction.NEVER });
  return true;
}
function FilterPanel({ context, close }: { context: SelectionContext; close: () => void }) {
  const items = analyzeSelection(context.elements);
  return <div className="dt-filter-list">{items.map(item => <button key={item.key} type="button" aria-label={`${item.label} (${item.elements.length})`} onClick={() => { if (filterSelection({ ...context, appState: context.api.getAppState(), elements: context.api.getSceneElements().filter((e: any) => !e.isDeleted && context.api.getAppState().selectedElementIds?.[e.id]) }, item.key)) close(); }}>
    {item.icon}<span>{item.label}</span><span className="dt-filter-count">{item.elements.length}</span>
  </button>)}</div>;
}
const filterTool: ToolbarTool = {
  id: "element-filter", label: "元素筛选", Panel: FilterPanel,
  icon: <LayoutGrid size={17} strokeWidth={1.6} aria-hidden="true"/>,
  when: context => context.elements.length > 1 && analyzeSelection(context.elements).length > 1,
};
export default filterTool;
