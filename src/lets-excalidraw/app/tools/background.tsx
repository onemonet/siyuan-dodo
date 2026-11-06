import React, { useState } from "react";
import { Blend } from "lucide-react";
import { CompactSelect, CompactNumber } from "./compact-property-controls";
import { isFillableClosedPath } from "./closed-path";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";
import { ExcalidrawFillIcon } from "./excalidraw-fill-icons";
import { applyStylePatch, clampNumber, ColorField, TRANSPARENT, visibleColor, toolbarColor, ColorCircleIcon } from "./style-controls";

const unsupported = new Set(["image", "arrow", "text"]);
const targetsFor = (context: SelectionContext) => context.elements.filter(e =>
  !e.isDeleted && !unsupported.has(e.type) &&
  (e.type !== "line" && e.type !== "freedraw" || isFillableClosedPath(e)));
const fillStyles = [
  { value: "hachure", label: "线条", icon: <ExcalidrawFillIcon variant="hachure"/> },
  { value: "cross-hatch", label: "交叉线", icon: <ExcalidrawFillIcon variant="cross-hatch"/> },
  { value: "solid", label: "实心", icon: <ExcalidrawFillIcon variant="solid"/> },
];
function BackgroundPanel({ context }: { context: SelectionContext; close: () => void }) {
  const selected = targetsFor(context), first = selected[0] || {};
  const [color, setColor] = useState(visibleColor(selected,"backgroundColor", TRANSPARENT));
  const [fillStyle, setFillStyle] = useState(first.fillStyle || "hachure");
  const [opacity, setOpacity] = useState(clampNumber(first.opacity,0,100,100));
  const patch = (value: Record<string, any>, app: Record<string, any>) => applyStylePatch(context, targetsFor(context), value, app);
  return <div className="dt-style-panel dt-style-compact-panel">
    <div className="dt-compact-properties" aria-label="背景属性">
      <CompactSelect name="填充样式" value={fillStyle} options={fillStyles} onChange={value => { patch({ fillStyle:value },{ currentItemFillStyle:value }); setFillStyle(value); }}/>
      <CompactNumber name="不透明度" icon={<Blend size={17} strokeWidth={1.6}/>} value={opacity} min={0} max={100} step={1} unit="%" onChange={value => { patch({ opacity:value },{ currentItemOpacity:value }); setOpacity(value); }}/>
    </div>
    <ColorField name="颜色" color={color} index={1} allowTransparent onChange={value => { patch({ backgroundColor:value },{ currentItemBackgroundColor:value }); setColor(value); }}/>
  </div>;
}
const background: ToolbarTool = {
  id: "background", label: "背景", Panel: BackgroundPanel,
  icon: context => <ColorCircleIcon filled color={toolbarColor(targetsFor(context), "backgroundColor")}/>,
  when: context => targetsFor(context).length > 0,
};
export default background;
