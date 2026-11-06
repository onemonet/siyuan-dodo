import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { selectElements } from "../tools/scene-commands";
import { branchStyleOf, childrenOf, descendantsOf, mindData, nodeFor, rootFor, type Side } from "./model";
import { connectorGeometry, layoutElements, revised, withMind } from "./elements";
export type DropMode = "child"|"before"|"after";
export type DropOperation={targetId:string;mode:DropMode;side?:Side};

/** A pure patch of one branch's parent and sibling order. Cycles and
 * cross-map drops are rejected before writing anything to the scene. */
export function patchMindDrop(elements:readonly any[],id:string,op:DropOperation):any[]|null {
  const node=nodeFor(elements,id),target=nodeFor(elements,op.targetId);
  const sourceData=mindData(node),targetData=mindData(target);
  if(!node||!target||!sourceData||!targetData||!sourceData.parentId ||
    sourceData.mapId!==targetData.mapId||node.id===target.id)return null;
  if(descendantsOf(elements,id).some(child=>child.id===target.id))return null;
  const newParentId=op.mode==="child"?target.id:targetData.parentId;
  if(!newParentId||newParentId===node.id)return null;
  const newParent=nodeFor(elements,newParentId);
  if(!newParent || descendantsOf(elements,id).some(child=>child.id===newParentId))return null;
  if(op.mode==="child"&&targetData.collapsedElements?.length)return null;
  const oldParentId=sourceData.parentId;
  const root=rootFor(elements,id);
  const direction=mindData(root)?.direction||"right";
  const atRoot=newParentId===root?.id;
  const side:Side=atRoot?(direction==="both"
    ?(op.mode==="child"?(op.side==="left"?"left":op.side==="right"?"right":sourceData.side):
      (targetData.side==="left"?"left":"right"))
    :direction as Side):targetData.side;
  const fromRoot=oldParentId===root?.id&&direction==="both";
  const toRoot=atRoot&&direction==="both";
  // On two-sided mind maps, left and right are independent ordered lanes.
  // Reorder only the source/destination lane rather than mixing both sides.
  const oldGroup=childrenOf(elements,oldParentId).filter(el=>
    !fromRoot||mindData(el)?.side===sourceData.side);
  const newGroup=childrenOf(elements,newParentId).filter(el=>
    !toRoot||mindData(el)?.side===side);
  const oldSiblings=oldGroup.filter(el=>el.id!==id);
  const newSiblings=newGroup.filter(el=>el.id!==id);
  const insertAt=op.mode==="child"?newSiblings.length:
    newSiblings.findIndex(el=>el.id===target.id)+(op.mode==="after"?1:0);
  if(insertAt<0)return null;
  const ordered=[...newSiblings];ordered.splice(insertAt,0,node);
  if(oldParentId===newParentId&&side===sourceData.side &&
    oldGroup.every((item,index)=>item.id===ordered[index]?.id))return null;
  const nextOrders=new Map<string,number>();
  oldSiblings.forEach((item,index)=>nextOrders.set(item.id,index));
  ordered.forEach((item,index)=>nextOrders.set(item.id,index));
  const movedIds=new Set([id,...descendantsOf(elements,id).map(el=>el.id)]);
  // A native drag may temporarily rebind a selected connector to the object
  // under the cursor. Identify the incoming edge from its persistent childId,
  // never solely from transient startBinding/endBinding values.
  const arrow=elements.find(el=>!el.isDeleted&&el.type==="arrow"&&
    (el.customData?.dodoMindEdge?.childId===id&&
      el.customData?.dodoMindEdge?.mapId===sourceData.mapId)) ||
    elements.find(el=>!el.isDeleted&&el.type==="arrow"&&
      el.endBinding?.elementId===id&&el.startBinding?.elementId===oldParentId);
  const arrowId=arrow?.id;
  let next=elements.map(el=>{
    if(el.id===id)return withMind(el,{parentId:newParentId,order:insertAt,side});
    if(movedIds.has(el.id)&&mindData(el)?.side!==side)return withMind(el,{side});
    if(nextOrders.has(el.id)&&mindData(el)?.order!==nextOrders.get(el.id))return withMind(el,{order:nextOrders.get(el.id)!});
    if(arrowId && newParentId!==oldParentId){
      if(el.id===oldParentId){const rest=(el.boundElements||[]).filter((b:any)=>b.id!==arrowId);return revised(el,{boundElements:rest.length?rest:null});}
      if(el.id===newParentId)return revised(el,{boundElements:[...(el.boundElements||[]).filter((b:any)=>b.id!==arrowId),{id:arrowId,type:"arrow"}]});
      if(el.id===arrowId)return revised(el,{startBinding:{...el.startBinding,elementId:newParentId}});
    }
    return el;
  });
  if(arrowId&&newParentId!==oldParentId){
    const current=next.find(el=>el.id===id),parent=next.find(el=>el.id===newParentId);
    next=next.map(el=>el.id===arrowId?revised(el,connectorGeometry(el,parent,current,branchStyleOf(rootFor(next,id)))):el);
  }
  const resultRoot=rootFor(next,id);
  return resultRoot?layoutElements(next,resultRoot.id):null;
}
export function commitMindDrop(api:any,id:string,op:DropOperation):boolean {
  const source=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
  const result=patchMindDrop(source,id,op);if(!result)return false;
  api.updateScene({elements:result,appState:{...selectElements(result,[id])},
    captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  return true;
}
