import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { newId, randomNonce } from "../tools/scene-commands";
import { buildBoundArrow } from "../interactions/right-drag";
import { branchStyleOf, mindData, type MindData, type BranchStyle, type Side } from "./model";
import { mapPositions } from "./layout";

export const revised=(el:any,patch:Record<string,unknown>):any=>({ ...el,...patch,version:(el.version||0)+1,versionNonce:randomNonce(),updated:Date.now() });
export const withMind=(el:any,patch:MindData|Partial<MindData>):any=>revised(el,{
  customData:{...(el.customData||{}),dodoMind:{...(mindData(el)||{}),...patch}}
});
/** Return native Excalidraw shape and its bound text label. */
export function createMindNode(x:number,y:number,title="新节点",root=false):any[] {
  const id=newId(),width=root?184:154,height=root?64:52;
  const skeleton:any={type:"rectangle",id,x,y,width,height,
    strokeColor:root?"#5f54e9":"#7685a1",backgroundColor:root?"#eae7ff":"#f4f7fb",
    fillStyle:"solid",strokeWidth:root?2:1.5,roughness:0,roundness:{type:3},
    label:{text:title,fontSize:root?21:18,textAlign:"center",verticalAlign:"middle"}};
  const result=convertToExcalidrawElements([skeleton],{regenerateIds:false}) as any[];
  const shape=result.find(el=>el.id===id);
  if(!shape)throw new Error("无法创建导图节点");
  // Ensure a clean container/label binding after converting the skeleton.
  return result;
}
function sideOf(parent:any,child:any):Side {
  const declared=mindData(child)?.side;
  if(declared)return declared;
  const dx=(child.x+child.width/2)-(parent.x+parent.width/2),dy=(child.y+child.height/2)-(parent.y+parent.height/2);
  return Math.abs(dy)>Math.abs(dx)?"down":dx<0?"left":"right";
}
function anchor(el:any,side:Side,fromParent:boolean){
  const horizontal=side!=="down";
  const x=horizontal? el.x+(fromParent?(side==="right"?el.width:0):(side==="right"?0:el.width)) : el.x+el.width/2;
  const y=horizontal?el.y+el.height/2:el.y+(fromParent?el.height:0);
  const fixedPoint=horizontal?[fromParent?(side==="right"?1:0):(side==="right"?0:1),0.5001]:[0.5001,fromParent?1:0];
  return {x,y,fixedPoint};
}
export function connectorGeometry(arrow:any,parent:any,child:any,style:BranchStyle="curve"):any {
  const side=sideOf(parent,child),a=anchor(parent,side,true),b=anchor(child,side,false),w=b.x-a.x,h=b.y-a.y;
  const points=style==="elbow"?(side==="down"?[[0,0],[0,h/2],[w,h/2],[w,h]]:[[0,0],[w/2,0],[w/2,h],[w,h]])
    :style==="curve"?(side==="down"?[[0,0],[0,h*0.32],[w,h*0.68],[w,h]]:[[0,0],[w*0.32,0],[w*0.68,h],[w,h]])
    :[[0,0],[w,h]];
  return {x:a.x,y:a.y,width:w,height:h,points,roundness:style==="straight"?null:{type:2},
    startBinding:{elementId:parent.id,focus:0,gap:0.5,fixedPoint:a.fixedPoint},
    endBinding:{elementId:child.id,focus:0,gap:0.5,fixedPoint:b.fixedPoint},
    endArrowhead:null,startArrowhead:null,locked:true,
    customData:{...(arrow?.customData||{}),dodoMindEdge:{mapId:mindData(child)?.mapId,parentId:parent.id,childId:child.id}}
  };
}
export function makeMindArrow(parent:any,child:any,style:BranchStyle,state:any):any{
  const initial=buildBoundArrow(parent,child,state);
  return {...initial,...connectorGeometry(initial,parent,child,style),strokeColor:"#8185a9",strokeWidth:2,roughness:0,opacity:100};
}
/** Pure one-shot layout and connector repair; must be committed only once. */
export function layoutElements(source:readonly any[],rootId:string):any[]{
  const root=source.find(el=>el.id===rootId&&!el.isDeleted);if(!root)return [...source];
  const id= mindData(root)?.mapId;if(!id)return [...source];
  const nodes=source.filter(el=>!el.isDeleted&&mindData(el)?.mapId===id&&["rectangle","ellipse","diamond","text"].includes(el.type)&&!el.containerId);
  const tree=nodes.filter(n=>n.id===rootId||nodes.some(parent=>parent.id===mindData(n)?.parentId));
  const positions=mapPositions(tree,root);
  const deltas=new Map<string,{x:number;y:number}>();
  const next=source.map(el=>{
    const p=positions.get(el.id);if(!p||el.x===p.x&&el.y===p.y)return el;
    deltas.set(el.id,{x:p.x-el.x,y:p.y-el.y});return revised(el,{x:p.x,y:p.y});
  }).map(el=>{
    const delta=el.containerId&&deltas.get(el.containerId);
    return delta?revised(el,{x:el.x+delta.x,y:el.y+delta.y}):el;
  });
  return syncMindConnectors(next,id);
}

/** Rebuild visible mind-map connectors from the TREE, never from their current
 * binding coordinates. Excalidraw can retarget/mangle a selected arrow while
 * dragging across other shapes. This fixes the native geometry and boundElements
 * without changing any node position (so free dragging remains free). */
export function syncMindConnectors(source:readonly any[],mapId:string):any[]{
  const byId=new Map(source.filter(el=>!el.isDeleted).map(el=>[el.id,el]));
  const root=source.find(el=>!el.isDeleted&&mindData(el)?.mapId===mapId&&!mindData(el)?.parentId);
  if(!root)return [...source];
  const style=branchStyleOf(root);
  const expected=new Map<string,Set<string>>();
  const edgeIds=new Set<string>();
  const patches=new Map<string,any>();
  for(const arrow of source){
    if(arrow.isDeleted||arrow.type!=="arrow"||arrow.customData?.dodoMindEdge?.mapId!==mapId)continue;
    edgeIds.add(arrow.id);
    const child=byId.get(arrow.customData.dodoMindEdge.childId) ||
      byId.get(arrow.endBinding?.elementId);
    const data=mindData(child);
    const parent=data?.parentId?byId.get(data.parentId):null;
    if(!parent||data?.mapId!==mapId||mindData(parent)?.mapId!==mapId)continue;
    const patch=connectorGeometry(arrow,parent,child,style);
    // Preserve the identity of the arrow and capture its start/end as derived
    // tree data; a native drag can otherwise rebind to the object under cursor.
    const current={x:arrow.x,y:arrow.y,width:arrow.width,height:arrow.height,
      points:arrow.points,startBinding:arrow.startBinding,endBinding:arrow.endBinding,
      customData:arrow.customData,roundness:arrow.roundness,endArrowhead:arrow.endArrowhead,
      startArrowhead:arrow.startArrowhead,locked:arrow.locked};
    const compare={...current,...patch};
    if(JSON.stringify(current)!==JSON.stringify(compare))patches.set(arrow.id,patch);
    for(const node of [parent,child]){
      const expectedIds=expected.get(node.id)||new Set<string>();
      expectedIds.add(arrow.id);expected.set(node.id,expectedIds);
    }
  }
  return source.map(el=>{
    if(patches.has(el.id))return revised(el,patches.get(el.id));
    if(el.isDeleted||!el.boundElements||!Array.isArray(el.boundElements)){
      if(!expected.has(el.id)||el.isDeleted)return el;
    }
    // Remove all stale references to our map arrows, then re-add the correct
    // ones. Preserve bound text and independently authored Excalidraw arrows.
    const prev=el.boundElements||[];
    if(!edgeIds.size)return el;
    const refs=prev.filter((item:any)=>!edgeIds.has(item.id));
    for(const id of expected.get(el.id)||[]){refs.push({id,type:"arrow"});}
    if(JSON.stringify(prev)===JSON.stringify(refs))return el;
    return revised(el,{boundElements:refs.length?refs:null});
  });
}
