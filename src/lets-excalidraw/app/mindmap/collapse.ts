import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { childrenOf, descendantsOf, mindData, nodeFor, rootFor, type Side } from "./model";
import { layoutElements, revised, withMind } from "./elements";

const scene=(api:any):any[]=>(api.getSceneElementsIncludingDeleted?.()||api.getSceneElements?.()||[]) as any[];
const stored=(element:any):any[]=>mindData(element)?.collapsedElements||[];
export const isMindCollapsed=(element:any)=>stored(element).length>0;
export const hiddenMindNodeCount=(element:any):number=>{
  const all=stored(element);
  // Descendant branches may themselves be collapsed; count nested archives.
  return all.filter(el=>mindData(el)).reduce((n,node)=>n+1+hiddenMindNodeCount(node),0);
};
export const canCollapseMind=(elements:readonly any[],node:any)=>Boolean(node&&
  (isMindCollapsed(node)||childrenOf(elements,node.id).length>0));

/** Collect an entire visible subtree plus its bound text and mind-map edges.
 * All assets remain native Excalidraw elements; the parent customData holds
 * the archive so PNG/SVG embedded-scene exports do not lose folded branches. */
export function collapseMindBranch(api:any,nodeId:string):boolean{
  const source=scene(api),parent=nodeFor(source,nodeId);
  if(!parent||parent.locked||isMindCollapsed(parent))return false;
  const root=rootFor(source,nodeId);if(!root)return false;
  const children=descendantsOf(source,nodeId).filter(node=>mindData(node)?.mapId===mindData(parent)?.mapId);
  if(!children.length)return false;
  const ids=new Set(children.map(el=>el.id));
  const archivedIds=new Set<string>(ids);
  for(const el of source){
    if(el.isDeleted)continue;
    if(el.containerId && ids.has(el.containerId))archivedIds.add(el.id);
    // Include user-authored arrows attached to the hidden shapes too; the
    // native binding must never point to an invisible/deleted destination.
    if(el.type==='arrow' &&
      (ids.has(el.startBinding?.elementId)||ids.has(el.endBinding?.elementId)))archivedIds.add(el.id);
  }
  const archive=source.filter(el=>!el.isDeleted&&archivedIds.has(el.id))
    .map(el=>JSON.parse(JSON.stringify(el)));
  if(!archive.length)return false;
  const visible=source.filter(el=>!archivedIds.has(el.id)).map(el=>{
    if(el.id===parent.id){
      const next=withMind(el,{collapsedElements:archive});
      const bindings=(next.boundElements||[]).filter((binding:any)=>!archivedIds.has(binding.id));
      return revised(next,{boundElements:bindings.length?bindings:null});
    }
    return el;
  });
  api.updateScene({elements:layoutElements(visible,root.id),
    appState:{selectedElementIds:{[parent.id]:true}},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  return true;
}

/** Restore saved IDs and labels, then use the SAME native D3 layout and
 * connector repair as any ordinary branch. Nested collapsed nodes remain
 * collapsed until the user explicitly unfolds those nodes. */
export function expandMindBranch(api:any,nodeId:string):boolean{
  const source=scene(api),parent=nodeFor(source,nodeId);
  if(!parent||!isMindCollapsed(parent)||parent.locked)return false;
  const root=rootFor(source,nodeId);if(!root)return false;
  const archive=stored(parent);
  const existing=new Set(source.map(el=>el.id));
  if(archive.some(el=>existing.has(el.id)))return false; // corrupted duplicate IDs
  const removed=new Set(archive.map(el=>el.id));
  const restored=archive.map(el=>JSON.parse(JSON.stringify(el)));
  const branch=source.map(el=>{
    if(el.id!==parent.id)return el;
    const meta={...mindData(el)};delete meta.collapsedElements;
    const bound=[...(el.boundElements||[])];
    for(const item of archive.filter(x=>x.type==='arrow'&&
      (x.startBinding?.elementId===el.id||x.endBinding?.elementId===el.id))){
      if(!bound.some((b:any)=>b.id===item.id))bound.push({id:item.id,type:'arrow'});
    }
    return revised(el,{customData:{...el.customData,dodoMind:meta},boundElements:bound.length?bound:null});
  });
  const all=[...branch,...restored];
  // When a map's direction changed while a branch was folded, inherited sides
  // must match the restored top-level branch instead of stale archived metadata.
  const byId=new Map(all.map(el=>[el.id,el]));
  const dir=mindData(root)?.direction||'right';
  const normalized=all.map(el=>{
    const data=mindData(el);if(!data||!removed.has(el.id))return el;
    let cursor=el,side:Side=dir==='both'?data.side:dir;
    const visited=new Set<string>();
    while(mindData(cursor)?.parentId&&byId.has(mindData(cursor)!.parentId!)&&!visited.has(cursor.id)){
      visited.add(cursor.id);
      const next=byId.get(mindData(cursor)!.parentId!)!;
      if(dir==='both' && mindData(next)?.parentId===root.id){side=mindData(next)!.side;break;}
      cursor=next;
    }
    return data.side===side?el:withMind(el,{side});
  });
  api.updateScene({elements:layoutElements(normalized,root.id),
    appState:{selectedElementIds:{[parent.id]:true}},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  return true;
}
export function toggleMindBranch(api:any,nodeId:string):boolean{
  const node=nodeFor(scene(api),nodeId);
  return node ? (isMindCollapsed(node)?expandMindBranch(api,nodeId):collapseMindBranch(api,nodeId)) : false;
}

/** Before unlinking to ordinary Excalidraw elements, restore every archive;
 * never leave orphaned folded elements inside the detached customData. */
export function restoreAllMindArchives(source:readonly any[],mapId:string):any[]{
  const result=[...source];
  for(let pass=0;pass<100;pass++){
    const node=result.find(el=>!el.isDeleted&&mindData(el)?.mapId===mapId&&isMindCollapsed(el));
    if(!node)break;
    const items=stored(node);
    const seen=new Set(result.map(el=>el.id));
    for(const el of items)if(!seen.has(el.id))result.push(el);
    const meta={...mindData(node)};delete meta.collapsedElements;
    const index=result.findIndex(el=>el.id===node.id);
    const bindings=[...(node.boundElements||[])];
    for(const arrow of items.filter(el=>el.type==='arrow'&&
      (el.startBinding?.elementId===node.id||el.endBinding?.elementId===node.id))){
      if(!bindings.some((ref:any)=>ref.id===arrow.id))bindings.push({id:arrow.id,type:'arrow'});
    }
    result[index]=revised(node,{customData:{...node.customData,dodoMind:meta},
      boundElements:bindings.length?bindings:null});
  }
  return result;
}
