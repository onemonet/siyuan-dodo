import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { InteractionFeature } from "../toolbar/types";
import { removeDeletedElementArrows } from "./auto-delete-bound-arrows";
import { sweepIntersectsElement } from "./right-drag-geometry";
import {
  canonicalConnectElement, connectionPairsForSelection, isConnectableForRightDrag,
  type ConnectionPair,
} from "./right-drag-pairs";
export { sweepIntersectsRect, sweepIntersectsElement } from "./right-drag-geometry";

/** Right-button swipe: source->target creates a bound arrow; empty->objects deletes. */

const DELETE_PREVIEW_OPACITY = 30;
const newId=()=>Array.from({length:21},()=>"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random()*62)]).join("");
const meta=(el:any)=>({version:(el.version||0)+1,versionNonce:Math.floor(Math.random()*0x7fffffff),updated:Date.now()});
const center=(el:any)=>({x:el.x+(el.width||0)/2,y:el.y+(el.height||0)/2});
const editorRect=()=>document.querySelector<HTMLElement>(".excalidraw")?.getBoundingClientRect();
function toScene(x:number,y:number,api:any){
  const rect=editorRect(),state=api.getAppState(),zoom=state.zoom?.value||1;
  return { x:(x-(rect?.left||0))/zoom-(state.scrollX||0), y:(y-(rect?.top||0))/zoom-(state.scrollY||0) };
}
const canConnect=isConnectableForRightDrag;
function hit(api:any,x:number,y:number) {
  const p=toScene(x,y,api);
  return [...(api.getSceneElements?.()||[])].reverse().find((el:any)=>canConnect(el)&&p.x>=el.x&&p.x<=el.x+(el.width||0)&&p.y>=el.y&&p.y<=el.y+(el.height||0));
}
function edge(el:any,other:any){
  const a=center(el),b=center(other),dx=b.x-a.x,dy=b.y-a.y;
  // Intersect the center-to-center ray with the element boundary. Using
  // Math.max(epsilon, 2 * dx) incorrectly clamps every negative direction to
  // epsilon; those endpoints land inside the opposite shape until a nudge
  // makes Excalidraw recalculate its bound arrow.
  const halfWidth=Math.max(0.5,(el.width||1)/2);
  const halfHeight=Math.max(0.5,(el.height||1)/2);
  const rx=Math.abs(dx)<1e-6?Infinity:halfWidth/Math.abs(dx);
  const ry=Math.abs(dy)<1e-6?Infinity:halfHeight/Math.abs(dy);
  const t=Math.min(rx,ry,1);
  return {x:a.x+dx*t,y:a.y+dy*t};
}
export function buildBoundArrow(start:any,end:any,state:any){
  const a=edge(start,end),b=edge(end,start),w=b.x-a.x,h=b.y-a.y;
  return { id:newId(),type:"arrow",x:a.x,y:a.y,width:w,height:h,angle:0,
    strokeColor:state.currentItemStrokeColor||"#1e1e1e",backgroundColor:"transparent",
    fillStyle:state.currentItemFillStyle||"solid",strokeWidth:state.currentItemStrokeWidth||2,
    strokeStyle:state.currentItemStrokeStyle||"solid",roughness:state.currentItemRoughness??0,opacity:state.currentItemOpacity??100,
    groupIds:[],frameId:null,roundness:{type:2},seed:Math.floor(Math.random()*0x7fffffff),
    version:1,versionNonce:Math.floor(Math.random()*0x7fffffff),updated:Date.now(),isDeleted:false,
    boundElements:null,link:null,locked:false,points:[[0,0],[w,h]],lastCommittedPoint:null,
    startBinding:{elementId:start.id,focus:0,gap:1},endBinding:{elementId:end.id,focus:0,gap:1},
    startArrowhead:state.currentItemStartArrowhead||null,endArrowhead:state.currentItemEndArrowhead||"arrow" };
}
/** Commit every arrow and all endpoint bindings in ONE undoable update. */
function commitConnections(api:any,pairs:ConnectionPair[],clone:any=null){
  const valid:ConnectionPair[]=[];
  const seen=new Set<string>();
  for(const pair of pairs){
    if(!canConnect(pair.start)||!canConnect(pair.end)||pair.start.id===pair.end.id)continue;
    const key=pair.start.id+":"+pair.end.id;
    if(seen.has(key))continue;
    seen.add(key);
    valid.push(pair);
  }
  if(!valid.length)return;
  const arrows=valid.map(pair=>buildBoundArrow(pair.start,pair.end,api.getAppState()));
  const changes=new Map<string,string[]>();
  for(let i=0;i<valid.length;i++){
    const {start,end}=valid[i],arrow=arrows[i];
    for(const el of [start,end])changes.set(el.id,[...(changes.get(el.id)||[]),arrow.id]);
  }
  const all=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
  const next=[...all,...(clone?[clone]:[]),...arrows].map((el:any)=>{
    const ids=changes.get(el.id);
    return !ids?el:{...el,boundElements:[...(el.boundElements||[]),...ids.map(id=>({id,type:"arrow"}))],...meta(el)};
  });
  api.updateScene({elements:next,captureUpdate:CaptureUpdateAction.IMMEDIATELY});
}
function sweptElementIds(api:any,from:{x:number;y:number},to:{x:number;y:number}):Set<string>{
  const a=toScene(from.x,from.y,api),b=toScene(to.x,to.y,api);
  const zoom=api.getAppState().zoom?.value||1;
  return new Set<string>((api.getSceneElements?.()||[]).filter((el:any)=>{
    // A frame is an editing viewport, never a right-drag erase target.
    if(el.isDeleted||el.locked||el.type==="frame"||el.type==="magicframe")return false;
    return sweepIntersectsElement(a,b,el,zoom);
  }).map((el:any)=>el.id));
}
function deleteSweep(api:any,from:{x:number;y:number},to:{x:number;y:number}){
  const targets=sweptElementIds(api,from,to);
  if(!targets.size)return;
  const elements=(api.getSceneElementsIncludingDeleted?.()||api.getSceneElements()).map((el:any)=>{
    const remove=targets.has(el.id)||(el.type==="arrow"&&(targets.has(el.startBinding?.elementId)||targets.has(el.endBinding?.elementId)))
      ||(el.type==="text"&&targets.has(el.containerId));
    return remove&&!el.isDeleted?{...el,isDeleted:true,...meta(el)}:el;
  });
  const cleaned=removeDeletedElementArrows(elements);
  api.updateScene({elements:cleaned||elements,captureUpdate:CaptureUpdateAction.IMMEDIATELY});
}
const feature: InteractionFeature = {
  id:"rightDragConnectDelete",label:"右键连线与删除",
  description:"多选图形后右键拖动支持一对多、多对一连接；拖到空白复制并连接；从空白扫线删除多个元素，画框除外。",
  defaultEnabled:false,
  mount(api){
    // The next editor starts right-button panning from pointerdown, before mousedown.
    // Capture this gesture before its own handler and use pointer events all the way through.
    let dragging:{start:{x:number;y:number};source:any;selectedIds:Set<string>;active:boolean;pointerId:number|null}|null=null;
    const preview=document.createElement("div");preview.className="dodo-right-drag-line";preview.hidden=true;document.body.append(preview);
    // Same as legacy right-drag-tools.js: deletion candidates fade to 30% while
    // the red swipe crosses them. Keep their original opacity for exact recovery.
    const previewOpacities=new Map<string,number>();
    let previewIds=new Set<string>();
    const updateDeletePreview=(next:Set<string>)=>{
      if(next.size===previewIds.size && [...next].every(id=>previewIds.has(id)))return;
      const elements=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
      let changed=false;
      const updated=elements.map((el:any)=>{
        if(el.isDeleted)return el;
        if(next.has(el.id)){
          if(!previewOpacities.has(el.id))previewOpacities.set(el.id,el.opacity??100);
          if(el.opacity===DELETE_PREVIEW_OPACITY)return el;
          changed=true;
          return {...el,opacity:DELETE_PREVIEW_OPACITY};
        }
        if(!previewIds.has(el.id))return el;
        const original=previewOpacities.get(el.id)??100;
        if(el.opacity===original)return el;
        changed=true;
        return {...el,opacity:original};
      });
      previewIds=next;
      if(changed)api.updateScene({elements:updated,captureUpdate:CaptureUpdateAction.NEVER});
    };
    const clearDeletePreview=()=>{
      if(previewIds.size){
        const elements=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
        let changed=false;
        const restored=elements.map((el:any)=>{
          if(el.isDeleted||!previewIds.has(el.id))return el;
          const opacity=previewOpacities.get(el.id)??100;
          if(el.opacity===opacity)return el;
          changed=true;
          return {...el,opacity};
        });
        if(changed)api.updateScene({elements:restored,captureUpdate:CaptureUpdateAction.NEVER});
      }
      previewIds.clear();previewOpacities.clear();
    };
    let suppress=false;
    const begin=(event:MouseEvent,pointerId:number|null)=>{
      if(event.button!==2 || !(event.target instanceof Element) || !event.target.closest(".excalidraw")
        || event.target.closest('input, textarea, select, button, [role="button"], [contenteditable="true"], .dt-layer'))return false;
      clearDeletePreview();
      suppress=false;
      const selectedIds=new Set<string>(Object.entries(api.getAppState().selectedElementIds||{})
        .filter(([,selected])=>selected).map(([id])=>id));
      dragging={start:{x:event.clientX,y:event.clientY},source:hit(api,event.clientX,event.clientY),selectedIds,active:false,pointerId};
      return true;
    };
    const pointerDown=(event:PointerEvent)=>{
      if(!begin(event,event.pointerId))return;
      // This prevents Excalidraw's right-button pan; browsers also suppress
      // the legacy compatibility mousedown after preventDefault(pointerdown).
      event.preventDefault();
      event.stopPropagation();
    };
    // Preserve synthetic MouseEvent support for old integrations/tests.
    const down=(event:MouseEvent)=>{if(!dragging)begin(event,null);};
    const move=(event:MouseEvent)=>{
      if(!dragging)return;
      const dx=event.clientX-dragging.start.x,dy=event.clientY-dragging.start.y;
      if(Math.hypot(dx,dy)<30){preview.hidden=true;clearDeletePreview();return;}
      dragging.active=true;preview.hidden=false;
      preview.style.cssText=`position:fixed;z-index:10001;pointer-events:none;left:${dragging.start.x}px;top:${dragging.start.y}px;width:${Math.hypot(dx,dy)}px;height:1px;background:${dragging.source?"#0066ff":"#ff3333"};box-shadow:0 0 4px ${dragging.source?"#0066ff":"#ff3333"};transform-origin:left center;transform:rotate(${Math.atan2(dy,dx)}rad)`;
      if(!dragging.source)updateDeletePreview(sweptElementIds(api,dragging.start,{x:event.clientX,y:event.clientY}));
    };
    const pointerMove=(event:PointerEvent)=>{
      if(!dragging || dragging.pointerId!==event.pointerId)return;
      move(event);
      if(dragging?.active){event.preventDefault();event.stopPropagation();}
    };
    const up=(event:MouseEvent)=>{
      if(!dragging)return;
      const current=dragging;dragging=null;preview.hidden=true;
      // Restore original opacities before the final (undoable) deletion update.
      clearDeletePreview();
      if(!current.active)return;
      event.preventDefault();event.stopPropagation();suppress=true;
      if(!current.source){deleteSweep(api,current.start,{x:event.clientX,y:event.clientY});return;}
      const elements=api.getSceneElements?.()||[];
      const start=canonicalConnectElement(current.source,elements);
      if(!canConnect(start))return;
      const hitTarget=hit(api,event.clientX,event.clientY);
      const target=canonicalConnectElement(hitTarget,elements);
      if(target&&target.id===start.id)return;
      if(!target){
        const scene=toScene(event.clientX,event.clientY,api);
        const clone={...start,id:newId(),x:scene.x-(start.width||0)/2,y:scene.y-(start.height||0)/2,
          groupIds:[],frameId:null,containerId:null,boundElements:null,isDeleted:false,seed:Math.floor(Math.random()*0x7fffffff),...meta({})};
        commitConnections(api,[{start,end:clone}],clone);
      } else {
        commitConnections(api,connectionPairsForSelection(start,target,current.selectedIds,elements));
      }
    };
    const mouseMove=(event:MouseEvent)=>{if(dragging?.pointerId===null)move(event);};
    const mouseUp=(event:MouseEvent)=>{if(dragging?.pointerId===null)up(event);};
    const pointerUp=(event:PointerEvent)=>{
      if(!dragging || dragging.pointerId!==event.pointerId)return;
      up(event);
      event.preventDefault();
      event.stopPropagation();
    };
    const cancelGesture=()=>{dragging=null;preview.hidden=true;clearDeletePreview();suppress=false;};
    const pointerCancel=(event:PointerEvent)=>{if(dragging?.pointerId===event.pointerId)cancelGesture();};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&dragging)cancelGesture();};
    const visibility=()=>{if(document.hidden)cancelGesture();};
    const contextMenu=(event:MouseEvent)=>{
      // Depending on the browser, contextmenu can fire before or after pointerup.
      if(!dragging&&!suppress)return;
      if(!dragging)suppress=false;
      event.preventDefault();event.stopPropagation();
    };
    window.addEventListener("blur",cancelGesture);
    document.addEventListener("visibilitychange",visibility);
    document.addEventListener("keydown",escape,true);
    document.addEventListener("pointerdown",pointerDown,true);
    document.addEventListener("pointermove",pointerMove,true);
    document.addEventListener("pointerup",pointerUp,true);
    document.addEventListener("pointercancel",pointerCancel,true);
    document.addEventListener("mousedown",down,true);
    document.addEventListener("mousemove",mouseMove,true);
    document.addEventListener("mouseup",mouseUp,true);
    document.addEventListener("contextmenu",contextMenu,true);
    return ()=>{cancelGesture();preview.remove();window.removeEventListener("blur",cancelGesture);
      document.removeEventListener("visibilitychange",visibility);document.removeEventListener("keydown",escape,true);
      document.removeEventListener("pointerdown",pointerDown,true);document.removeEventListener("pointermove",pointerMove,true);
      document.removeEventListener("pointerup",pointerUp,true);document.removeEventListener("pointercancel",pointerCancel,true);
      document.removeEventListener("mousedown",down,true);document.removeEventListener("mousemove",mouseMove,true);
      document.removeEventListener("mouseup",mouseUp,true);document.removeEventListener("contextmenu",contextMenu,true);};
  },
};
export default feature;
