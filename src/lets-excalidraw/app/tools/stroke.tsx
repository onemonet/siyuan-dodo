import React, { useState } from "react";
import { Blend, Eye, EyeOff, SlidersHorizontal, Waves } from "lucide-react";
import { CompactSelect, CompactNumber } from "./compact-property-controls";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";
import { applyStylePatch, clampNumber, ColorField, TRANSPARENT, DEFAULT_COLOR, visibleColor, toolbarColor, ColorCircleIcon } from "./style-controls";

const targetsFor = (context: SelectionContext) => context.elements.filter(e => !e.isDeleted && !["image", "text"].includes(e.type));
const styles = [
  { value: "solid", label: "实线", icon: <svg viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" d="M3 12h18"/></svg> },
  { value: "dashed", label: "虚线", icon: <svg viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" d="M3 12h18"/></svg> },
  { value: "dotted", label: "点线", icon: <svg viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 4" d="M3 12h18"/></svg> },
];
function StrokePanel({ context }: { context: SelectionContext; close: () => void }) {
  const selected = targetsFor(context), first = selected[0] || {};
  const [color, setColor] = useState(visibleColor(selected,"strokeColor",DEFAULT_COLOR));
  const [visible, setVisible] = useState(selected.every(e => (e.strokeColor || DEFAULT_COLOR) !== TRANSPARENT));
  const [style, setStyle] = useState(first.strokeStyle || "solid");
  const [width, setWidth] = useState(clampNumber(first.strokeWidth,0.5,8,1));
  const [roughness, setRoughness] = useState(clampNumber(first.roughness,0,10,0));
  const [opacity, setOpacity] = useState(clampNumber(first.opacity,0,100,100));
  const patch = (value: Record<string, any>, app: Record<string, any>) => applyStylePatch(context, targetsFor(context), value, app);
  return <div className="dt-style-panel dt-style-compact-panel">
    <div className="dt-compact-panel-head">
      <button className="dt-stroke-visibility" type="button" title="显示描边" aria-label="显示描边" aria-pressed={visible}
        onClick={() => { const value = !visible; patch({ strokeColor: value ? color : TRANSPARENT }, { currentItemStrokeColor: value ? color : TRANSPARENT }); setVisible(value); }}>
        {visible ? <Eye size={17} strokeWidth={1.6} aria-hidden="true"/> : <EyeOff size={17} strokeWidth={1.6} aria-hidden="true"/>}
      </button>
    </div>
    {visible && <>
      <div className="dt-compact-properties" aria-label="描边属性">
        <CompactSelect name="边框样式" value={style} options={styles} onChange={value => { patch({ strokeStyle:value },{ currentItemStrokeStyle:value });setStyle(value); }}/>
        <CompactNumber name="边框粗细" icon={<SlidersHorizontal size={17} strokeWidth={1.6}/>} value={width} min={0.5} max={8} step={0.5} unit="px" onChange={value => { patch({ strokeWidth:value },{ currentItemStrokeWidth:value });setWidth(value); }}/>
        <CompactNumber name="手绘感" icon={<Waves size={17} strokeWidth={1.6}/>} value={roughness} min={0} max={10} step={1} onChange={value => { patch({ roughness:value },{ currentItemRoughness:value });setRoughness(value); }}/>
        <CompactNumber name="不透明度" icon={<Blend size={17} strokeWidth={1.6}/>} value={opacity} min={0} max={100} step={1} unit="%" onChange={value => { patch({ opacity:value },{ currentItemOpacity:value });setOpacity(value); }}/>
      </div>
      <ColorField name="颜色" color={color} index={4} allowTransparent onChange={value => { patch({ strokeColor:value },{ currentItemStrokeColor:value });setColor(value);setVisible(value !== TRANSPARENT); }}/>
    </>}
  </div>;
}
const stroke: ToolbarTool = {
  id: "stroke", label: "描边", Panel: StrokePanel,
  icon: context => <ColorCircleIcon color={toolbarColor(targetsFor(context), "strokeColor")}/>,
  when: context => targetsFor(context).length > 0,
};
export default stroke;
