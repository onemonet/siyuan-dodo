import { ExcalidrawDuplicateIcon } from "./excalidraw-core-icons";
import React, { useState } from "react";
import type { SelectionContext, ToolbarTool } from "../toolbar/types";
import { commitElements } from "./scene-commands";
import { canRepeat, clampRepeatCount, createRepeatElements } from "./repeat-utils";

export function repeatElements(context: SelectionContext, count: number) {
  if (!canRepeat(context.elements)) return false;
  const created = createRepeatElements(context.elements, count);
  if (!created.length) return false;
  const elements = [...context.api.getSceneElements(), ...created];
  commitElements(context, elements, created);
  return true;
}
function RepeatPanel({ context, close }: { context: SelectionContext; close: () => void }) {
  const [count, setCount] = useState("1");
  const apply = () => {
    if (repeatElements({ ...context, appState: context.api.getAppState(), elements: context.api.getSceneElements().filter((e: any) => !e.isDeleted && context.api.getAppState().selectedElementIds?.[e.id]) }, clampRepeatCount(count))) close();
  };
  return <div className="dt-parameter-panel">
    <label htmlFor="dt-repeat-count">数量</label>
    <input id="dt-repeat-count" type="number" min="1" max="99" step="1" value={count} onChange={event => setCount(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); apply(); } }}/>
    <button className="dt-panel-apply" type="button" onClick={apply}>生成</button>
  </div>;
}
const repeat: ToolbarTool = {
  id: "repeat", label: "重复元素", Panel: RepeatPanel,
  icon: <ExcalidrawDuplicateIcon/>,
  when: context => canRepeat(context.elements),
};
export default repeat;
