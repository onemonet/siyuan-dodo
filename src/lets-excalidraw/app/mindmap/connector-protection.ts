import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { revised } from "./elements";

/** A generated mind-map edge is derived from the tree, not an editable line.
 * User-authored arrows (including arrows attached to mind-map nodes) are
 * deliberately NOT protected. */
export const isMindConnector = (element:any):boolean =>
  element?.type==="arrow" && !element.isDeleted && Boolean(element.customData?.dodoMindEdge);

/** Use native Excalidraw locking, including for older persisted diagrams.
 * Keep all existing arrow IDs, styles, points and bindings unchanged. */
export function protectMindConnectors(elements:readonly any[],temporarilyEditable:ReadonlySet<string>=new Set()):any[]{
  let changed=false;
  const result=elements.map(el=>{
    if(!isMindConnector(el)||el.locked||temporarilyEditable.has(el.id))return el;
    changed=true;return revised(el,{locked:true});
  });
  return changed?result:elements as any[];
}

// Selection is normally prohibited, but native Excalidraw needs to translate
// every internal connector in the SAME pointer gesture as a moving subtree.
// This temporary exemption lasts only while that pointer is down. The arrows
// are unselectable again immediately after its native pointerup transaction.
const nativeDragging=new WeakMap<object,ReadonlySet<string>>();
export function beginMindConnectorDrag(api:object,edgeIds:readonly string[]):void{
  nativeDragging.set(api,new Set(edgeIds));
}
export function endMindConnectorDrag(api:object):void{
  nativeDragging.delete(api);
}

/** An imported image can contain a diagram saved before edge locking.
 * Normalize after load/restore, and immediately remove generated edges from
 * any selection that bypassed native locked hit-testing. Normal arrows and
 * mind nodes still behave like ordinary Excalidraw elements. */
export function mountMindConnectorProtection(api:any):()=>void{
  let frame:number|null=null,disposed=false;
  const apply=()=>{
    frame=null;if(disposed)return;
    const elements=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements?.()||[];
    const exempt=nativeDragging.get(api)||new Set<string>();
    const updated=protectMindConnectors(elements,exempt);
    const previous=api.getAppState()?.selectedElementIds||{};
    const edgeIds=new Set(elements.filter((e:any)=>isMindConnector(e)&&!exempt.has(e.id)).map((e:any)=>e.id));
    const selected=Object.fromEntries(Object.entries(previous).filter(([id,value])=>
      value&&!edgeIds.has(id)));
    const selectionChanged=Object.keys(previous).some(id=>Boolean(previous[id])&&edgeIds.has(id));
    if(updated!==elements||selectionChanged)api.updateScene({
      ...(updated!==elements?{elements:updated}:{}),
      ...(selectionChanged?{appState:{selectedElementIds:selected}}:{}),
      captureUpdate:CaptureUpdateAction.NEVER
    });
  };
  const schedule=()=>{
    if(disposed||frame!==null)return;
    frame=requestAnimationFrame(apply);
  };
  const un=api.onChange(schedule);
  schedule();
  return()=>{disposed=true;un?.();if(frame!==null)cancelAnimationFrame(frame);};
}
