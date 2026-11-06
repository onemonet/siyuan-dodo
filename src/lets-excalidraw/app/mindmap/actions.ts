import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { newId, selectElements } from "../tools/scene-commands";
import { branchStyleOf, childrenOf, descendantsOf, isEligibleNode, isMindNode, mindData, nodeFor, rootFor, type Direction, type Side, type BranchStyle, type MindData } from "./model";
import { createMindNode, layoutElements, makeMindArrow, revised, withMind } from "./elements";
import { editMindNodeText } from "./text-edit";
import { expandMindBranch, isMindCollapsed, restoreAllMindArchives } from "./collapse";

const all=(api:any):any[]=>(api.getSceneElementsIncludingDeleted?.()||api.getSceneElements?.()||[]) as any[];
const chosen=(api:any)=>{
  const ids=Object.keys(api.getAppState()?.selectedElementIds||{}).filter(id=>api.getAppState().selectedElementIds[id]);
  return ids.length===1?all(api).find(el=>el.id===ids[0]&&!el.isDeleted):null;
};
const commit=(api:any,els:any[],ids:string[]=[]):boolean=>{
  api.updateScene({elements:els,appState:{...selectElements(els,ids)},captureUpdate:CaptureUpdateAction.IMMEDIATELY});return true;
};
const bind=(el:any,arrowId:string)=>revised(el,{boundElements:[...(el.boundElements||[]).filter((item:any)=>item.id!==arrowId),{id:arrowId,type:"arrow"}]});
/** Trial UX switch. Preserve native WYSIWYG auto-edit implementation so it
 * can be restored by changing this one flag back to true. Manual double-click
 * editing and post-edit auto-layout remain fully enabled. */
export const AUTO_EDIT_NEW_MIND_NODE = false;
const ROOT_DIRECTION:Direction="right";
const styleOf=(root:any):BranchStyle=>branchStyleOf(root);
export function createMindMap(api:any,existing?:any):string|null {
  const source=all(api);const state=api.getAppState();
  const selected=existing || chosen(api);
  if(selected&&isMindNode(selected))return null;
  const eligible=selected&&isEligibleNode(selected)?selected:null;
  const rect=document.querySelector('.excalidraw')?.getBoundingClientRect();
  const at=viewportCoordsToSceneCoords({clientX:(rect?.left||0)+(rect?.width||800)/2,
    clientY:(rect?.top||0)+(rect?.height||600)/2},state);
  const fresh=eligible?[]:createMindNode(at.x-92,at.y-32,"中心主题",true);
  const target=eligible||fresh.find(el=>el.type==="rectangle");if(!target)return null;
  const mapId=newId();
  const data:MindData={mapId,parentId:null,order:0,side:"right",direction:ROOT_DIRECTION,branchStyle:"curve"};
  const elements=eligible?source.map(el=>el.id===target.id?withMind(el,data):el):[...source,...fresh.map(el=>el.id===target.id?withMind(el,data):el)];
  commit(api,elements,[target.id]);
  if(!eligible && AUTO_EDIT_NEW_MIND_NODE)editMindNodeText(api,target.id);
  return target.id;
}
export function createChild(api:any,parentId?:string):string|null {
  const id=parentId||chosen(api)?.id||"";
  let source=all(api),parent=nodeFor(source,id);
  if(!parent)return null;
  // Tab on a folded node reopens its branch before inserting a new child.
  // Keep the archived IDs rather than mixing hidden and visible children.
  if(isMindCollapsed(parent)){
    if(!expandMindBranch(api,id))return null;
    source=all(api);parent=nodeFor(source,id);
    if(!parent)return null;
  }
  const root=rootFor(source,parent.id);if(!root)return null;
  const rootData=mindData(root)!,parentData=mindData(parent)!;
  const direction=rootData.direction||"right";
  const siblings=childrenOf(source,parent.id);
  const side:Side=parent.id===root.id?(direction==="both"
    ?(siblings.filter(el=>mindData(el)?.side==="left").length>siblings.filter(el=>mindData(el)?.side==="right").length?"right":"left")
    :direction):parentData.side;
  const added=createMindNode(parent.x+parent.width+85,parent.y,"新节点");
  const node=added.find(el=>el.type==="rectangle");if(!node)return null;
  const meta:MindData={mapId:rootData.mapId,parentId:parent.id,order:siblings.length,side};
  const prepared=added.map(el=>el.id===node.id?withMind(el,meta):el);
  const child=prepared.find(el=>el.id===node.id);
  const arrow=makeMindArrow(parent,child,styleOf(root),api.getAppState());
  const elements=[...source.map(el=>el.id===parent.id?bind(el,arrow.id):el),
    ...prepared.map(el=>el.id===node.id?bind(el,arrow.id):el),arrow];
  commit(api,layoutElements(elements,root.id),[node.id]);
  if(AUTO_EDIT_NEW_MIND_NODE)editMindNodeText(api,node.id);
  return node.id;
}
export function createSibling(api:any,id?:string):string|null {
  const source=all(api),node=nodeFor(source,id||chosen(api)?.id||"");
  const data=mindData(node),parent=data?.parentId&&nodeFor(source,data.parentId);
  if(!node||!data||!parent)return null;
  const root=rootFor(source,node.id);if(!root)return null;
  const siblings=childrenOf(source,parent.id);
  const after=siblings.findIndex(el=>el.id===node.id)+1;
  const added=createMindNode(node.x+16,node.y+node.height+24,"新节点");
  const next=added.find(el=>el.type==="rectangle");if(!next)return null;
  const prepared=added.map(el=>el.id===next.id?withMind(el,{mapId:data.mapId,parentId:parent.id,order:after,side:data.side}):el);
  const child=prepared.find(el=>el.id===next.id);
  const arrow=makeMindArrow(parent,child,styleOf(root),api.getAppState());
  const currentOrders=new Map(siblings.map((el,index)=>[el.id,index>=after?index+1:index]));
  const elements=[...source.map(el=>{
    if(el.id===parent.id)return bind(el,arrow.id);
    const order=currentOrders.get(el.id);
    return order!==undefined && mindData(el)?.order!==order?withMind(el,{order}):el;
  }),...prepared.map(el=>el.id===next.id?bind(el,arrow.id):el),arrow];
  commit(api,layoutElements(elements,root.id),[next.id]);
  if(AUTO_EDIT_NEW_MIND_NODE)editMindNodeText(api,next.id);
  return next.id;
}
export function arrangeMindMap(api:any,id?:string):boolean {
  const source=all(api),root=rootFor(source,id||chosen(api)?.id||"");
  return root?commit(api,layoutElements(source,root.id),[id||root.id]):false;
}
export function changeDirection(api:any,direction:Direction,id?:string):boolean {
  const source=all(api),root=rootFor(source,id||chosen(api)?.id||"");if(!root)return false;
  const branches=childrenOf(source,root.id);const sides=new Map<string,Side>();
  branches.forEach((child,index)=>{
    const side=direction==="both"?(index%2===0?"right":"left"):direction;
    sides.set(child.id,side);
    for(const descendant of descendantsOf(source,child.id))sides.set(descendant.id,side);
  });
  const next=source.map(el=>el.id===root.id?withMind(el,{direction}):sides.has(el.id)?withMind(el,{side:sides.get(el.id)!}):el);
  return commit(api,layoutElements(next,root.id),[id||root.id]);
}
export function changeBranchStyle(api:any,style:BranchStyle,id?:string):boolean {
  const source=all(api),root=rootFor(source,id||chosen(api)?.id||"");if(!root)return false;
  const next=source.map(el=>el.id===root.id?withMind(el,{branchStyle:style}):el);
  return commit(api,layoutElements(next,root.id),[id||root.id]);
}
/** A single tombstone update for a branch, its bound labels and connected edges. */
export function removeMindBranch(api:any,ids:string[]):boolean {
  const source=all(api),selected=ids.map(id=>nodeFor(source,id)).filter(Boolean);
  if(!selected.length)return false;
  const targets=new Set<string>();
  for(const el of selected)for(const node of [el,...descendantsOf(source,el.id)])targets.add(node.id);
  for(const el of source){
    if(el.containerId&&targets.has(el.containerId))targets.add(el.id);
    if(el.type==="arrow" && (targets.has(el.startBinding?.elementId)||targets.has(el.endBinding?.elementId)))targets.add(el.id);
  }
  const next=source.map(el=>{
    if(targets.has(el.id)&&!el.isDeleted)return revised(el,{isDeleted:true});
    if(!el.isDeleted && Array.isArray(el.boundElements)){
      const remaining=el.boundElements.filter((b:any)=>!targets.has(b.id));
      if(remaining.length!==el.boundElements.length)return revised(el,{boundElements:remaining.length?remaining:null});
    }
    return el;
  });
  return commit(api,next,[]);
}
/** Preserve content/visuals but unlink the entire map, leaving ordinary shapes. */
export function unlinkMindMap(api:any,id:string):boolean {
  const source=all(api),root=rootFor(source,id);if(!root)return false;
  const mapId=mindData(root)!.mapId;
  const restored=restoreAllMindArchives(source,mapId);
  return commit(api,restored.map(el=>{
    if(el.customData?.dodoMind?.mapId!==mapId&&el.customData?.dodoMindEdge?.mapId!==mapId)return el;
    const customData={...el.customData};
    if(customData.dodoMind?.mapId===mapId)delete customData.dodoMind;
    if(customData.dodoMindEdge?.mapId===mapId)delete customData.dodoMindEdge;
    return revised(el,{customData:Object.keys(customData).length?customData:null});
  }),[id]);
}
export const selectedMindNode=(api:any):any|null=>{const node=chosen(api);return isMindNode(node)?node:null;};
export const selectedEligibleNode=(api:any):any|null=>{const node=chosen(api);return isEligibleNode(node)?node:null;};
