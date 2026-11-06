import { CaptureUpdateAction, sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { descendantsOf, isMindNode, mindData, rootFor } from "./model";
import { syncMindConnectors, layoutElements, revised } from "./elements";
import { commitMindDrop, type DropOperation } from "./reorder";
import { resolveMindDrop } from "./drop-target";
import type { Rect } from "./drop-geometry";
import { beginMindConnectorDrag, endMindConnectorDrag } from "./connector-protection";
import { commitMindMerge, commitMindSplit, distanceToOriginalTree, isDetachmentCandidate, resolveMindMerge } from "./split-merge";

type Gesture={pointerId:number;nodeId:string;x:number;y:number;originRect:Rect;moved:boolean;drop:DropOperation|null;mergeTargetId:string|null;detach:boolean;initialGap:number;subtreeIds:string[];internalEdgeIds:string[];parentEdge:{id:string;opacity:number}|null};
const hit=(api:any,x:number,y:number,exclude=new Set<string>()):any=>{
  const state=api.getAppState();
  const p=viewportCoordsToSceneCoords({clientX:x,clientY:y},state);
  return [...(api.getSceneElements?.()||[])].reverse().find((el:any)=>isMindNode(el)&&!el.locked&&!exclude.has(el.id)&&
    p.x>=el.x&&p.x<=el.x+el.width&&p.y>=el.y&&p.y<=el.y+el.height);
};
export function mountMindDragSort(api:any):()=>void {
  const overlay=document.createElement("div");overlay.className="dodo-mind-drop-preview";
  overlay.hidden=true;overlay.innerHTML='<span class="dodo-mind-drop-preview-label"></span><span class="dodo-mind-insertion-line"></span>';
  document.body.append(overlay);
  let drag:Gesture|null=null;
  // Predict the native node's rectangle from the original pointer offset.
  // The document capture listener runs before Excalidraw's own pointermove,
  // so reading its current scene element here would be one frame behind.
  const projectedRect=(gesture:Gesture,x:number,y:number,state:any):Rect=>{
    const start=viewportCoordsToSceneCoords({clientX:gesture.x,clientY:gesture.y},state);
    const current=viewportCoordsToSceneCoords({clientX:x,clientY:y},state);
    return {...gesture.originRect,
      x:gesture.originRect.x+current.x-start.x,
      y:gesture.originRect.y+current.y-start.y};
  };
  /** Hide only the edge between a moving subtree and its stationary parent.
   * The internal arrows must remain visible and follow the subtree normally.
   * Opacity is a transient scene change, never a saved style or undo entry. */
  const setParentEdgeOpacity=(gesture:Gesture,opacity:number)=>{
    if(!gesture.parentEdge)return;
    const elements=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
    const edge=elements.find((el:any)=>el.id===gesture.parentEdge!.id&&!el.isDeleted);
    if(!edge||edge.opacity===opacity)return;
    api.updateScene({elements:elements.map((el:any)=>el.id===edge.id?revised(el,{opacity}):el),
      captureUpdate:CaptureUpdateAction.NEVER});
  };
  const clear=()=>{
    drag=null;overlay.hidden=true;
  };
  // The incoming edge of a dragged branch is invisible until drop, and
  // its internal arrows now travel in Excalidraw's native gesture. There is
  // deliberately NO animation-frame scene rewrite during the drag: repeated
  // connector geometry fixes used to cause visible one-frame lag and jitter.
  const restoreSelection=(gesture:Gesture)=>{
    if(!gesture.subtreeIds.length)return;
    const live=(api.getSceneElements?.()||[]).find((el:any)=>el.id===gesture.nodeId&&!el.isDeleted);
    if(live)api.updateScene({appState:{selectedElementIds:{[gesture.nodeId]:true}},
      captureUpdate:CaptureUpdateAction.NEVER});
  };
  const down=(event:PointerEvent)=>{
    if(event.button!==0||!(event.target instanceof Element)||!event.target.closest('.excalidraw__canvas')||
      api.getAppState()?.activeTool?.type!=="selection" ||api.getAppState()?.editingElement)return;
    const node=hit(api,event.clientX,event.clientY);
    if(!node || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)return;
    // Respect explicit multi-selection and Excalidraw's native group drag.
    const previous=Object.entries(api.getAppState().selectedElementIds||{})
      .filter(([,selected])=>selected).map(([id])=>id);
    if(previous.length>1)return;
    // Respect Excalidraw resizing handles: do not start structural gestures at edges.
    const pos=viewportCoordsToSceneCoords({clientX:event.clientX,clientY:event.clientY},api.getAppState());
    const edge=Math.min(pos.x-node.x,node.x+node.width-pos.x,pos.y-node.y,node.y+node.height-pos.y);
    if(edge<12/(api.getAppState().zoom?.value||1))return;
    // Selecting the whole descendant branch BEFORE Excalidraw handles this
    // pointerdown lets its native drag implementation move everything in one
    // history transaction (including bound text), without synthetic dragging
    // or repeatedly updating scene positions during pointermove.
    const scene=api.getSceneElements();
    const subtree=descendantsOf(scene,node.id);
    const moving=new Set<string>([node.id,...subtree.map(item=>item.id)]);
    const ids=[...moving];
    const byId=new Map<string,any>(scene.map((item:any):[string,any]=>[item.id,item]));
    const parentEdge=scene.find((arrow:any)=>!arrow.isDeleted&&arrow.type==="arrow"&&
      arrow.customData?.dodoMindEdge?.mapId===mindData(node)?.mapId&&
      arrow.customData?.dodoMindEdge?.childId===node.id);
    const internalEdgeIds:string[]=[];
    for(const arrow of scene){
      if(arrow.type!=="arrow"||arrow.customData?.dodoMindEdge?.mapId!==mindData(node)?.mapId)continue;
      const child=byId.get(arrow.customData.dodoMindEdge.childId);
      const parentId=mindData(child)?.parentId;
      const startMoving=Boolean(parentId&&moving.has(parentId));
      const endMoving=Boolean(child&&moving.has(child.id));
      if(startMoving&&endMoving){internalEdgeIds.push(arrow.id);ids.push(arrow.id);}
    }
    // Unlock internal edges for precisely this native pointer transaction.
    // Otherwise the protection guard would keep them out of the selection,
    // requiring a jittery React-side rewrite of each arrow on every frame.
    if(internalEdgeIds.length)beginMindConnectorDrag(api,internalEdgeIds);
    if(subtree.length){
      const internals=new Set(internalEdgeIds);
      const all=api.getSceneElementsIncludingDeleted?.()||scene;
      api.updateScene({elements:all.map((el:any)=>
        internals.has(el.id)&&el.locked?revised(el,{locked:false}):el),
        appState:{selectedElementIds:Object.fromEntries(ids.map(id=>[id,true]))},
        captureUpdate:CaptureUpdateAction.NEVER});
    }
    drag={pointerId:event.pointerId,nodeId:node.id,x:event.clientX,y:event.clientY,
      originRect:{x:node.x,y:node.y,width:node.width,height:node.height},
      moved:false,drop:null,mergeTargetId:null,detach:false,initialGap:distanceToOriginalTree(scene,node.id),
      subtreeIds:subtree.map(item=>item.id),internalEdgeIds,
      parentEdge:parentEdge?{id:parentEdge.id,opacity:parentEdge.opacity}:null};
  };
  const move=(event:PointerEvent)=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<12)return;
    if(!drag.moved){
      drag.moved=true;
      setParentEdgeOpacity(drag,0);
    }
    const elements=api.getSceneElements();
    const state=api.getAppState();
    const rect=projectedRect(drag,event.clientX,event.clientY,state);
    // Both local reparenting and cross-tree merge resolve from the moved
    // node's entire rectangle, never from where the user grabbed the shape.
    const zoom=state.zoom?.value||1;
    const mergeTarget=resolveMindMerge(elements,drag.nodeId,rect,zoom);
    const hint=mergeTarget?null:resolveMindDrop(elements,drag.nodeId,rect,zoom);
    drag.mergeTargetId=mergeTarget?.id||null;
    drag.drop=hint?.operation||null;
    const travel=Math.hypot(event.clientX-drag.x,event.clientY-drag.y);
    drag.detach=!hint&&!mergeTarget&&isDetachmentCandidate(
      drag.initialGap*zoom,distanceToOriginalTree(elements,drag.nodeId)*zoom,travel,drag.detach);
    if(!hint&&!mergeTarget){
      if(!drag.detach){overlay.hidden=true;return;}
      const a=sceneCoordsToViewportCoords({sceneX:rect.x,sceneY:rect.y},state);
      const b=sceneCoordsToViewportCoords({sceneX:rect.x+rect.width,sceneY:rect.y+rect.height},state);
      overlay.hidden=false;
      overlay.style.left=a.x+"px";overlay.style.top=a.y+"px";
      overlay.style.width=Math.abs(b.x-a.x)+"px";overlay.style.height=Math.abs(b.y-a.y)+"px";
      overlay.dataset.mode="detach";overlay.dataset.kind="detach";overlay.dataset.axis="y";
      (overlay.firstElementChild as HTMLElement).textContent="松开以拆分为新思维导图";
      return;
    }
    const target=mergeTarget||hint!.target;
    const axis=mergeTarget?"y":hint!.axis;
    const kind=mergeTarget?"cross":hint!.kind;
    const mode=mergeTarget?"child":hint!.operation.mode;
    const a=sceneCoordsToViewportCoords({sceneX:target.x,sceneY:target.y},api.getAppState());
    const b=sceneCoordsToViewportCoords({sceneX:target.x+target.width,sceneY:target.y+target.height},api.getAppState());
    overlay.hidden=false;
    overlay.style.left=`${a.x}px`;overlay.style.top=`${a.y}px`;
    overlay.style.width=`${Math.abs(b.x-a.x)}px`;overlay.style.height=`${Math.abs(b.y-a.y)}px`;
    overlay.dataset.mode=mode;
    overlay.dataset.axis=axis;
    overlay.dataset.kind=kind;
    overlay.dataset.targetId=target.id;
    const label=overlay.firstElementChild as HTMLElement;
    label.textContent=mergeTarget?"合并到此思维导图":mode==="child"?"成为子节点":mode==="before"?"插入此节点前":"插入此节点后";
  };
  const up=(event:PointerEvent)=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const previous=drag,releaseX=event.clientX,releaseY=event.clientY;clear();
    // Do not hide the subtree forever inside a multiple-element selection.
    // Finish the native pointer transaction before restoring the dragged node.
    window.setTimeout(()=>{
      endMindConnectorDrag(api);
      // Native drag is finished. All internal edges become protected again,
      // BEFORE structural commits can create/move additional connectors.
      if(previous.internalEdgeIds.length){
        const internals=new Set(previous.internalEdgeIds);
        const all=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
        const relocked=all.map((el:any)=>
          internals.has(el.id)&&!el.isDeleted&&!el.locked?revised(el,{locked:true}):el);
        api.updateScene({elements:relocked,
          appState:{selectedElementIds:{[previous.nodeId]:true}},
          captureUpdate:CaptureUpdateAction.NEVER});
      }
      // Restore the original stroke opacity BEFORE D3 reparents the edge.
      // In particular, a mind map using a custom semi-transparent style must
      // not become permanently invisible after a structural drop.
      setParentEdgeOpacity(previous,previous.parentEdge?.opacity??100);
      // Re-evaluate against the final native positions after pointerup. The
      // document capture listener can see a move before Excalidraw applies it;
      // relying on the last preview would make quick releases miss a target.
      const state=api.getAppState(),elements=api.getSceneElements();
      const zoom=state.zoom?.value||1;
      const actual=elements.find((el:any)=>el.id===previous.nodeId&&!el.isDeleted);
      const rect:Rect=actual?{x:actual.x,y:actual.y,width:actual.width,height:actual.height}:
        projectedRect(previous,releaseX,releaseY,state);
      const merge=resolveMindMerge(elements,previous.nodeId,rect,zoom);
      const hint=merge?null:resolveMindDrop(elements,previous.nodeId,rect,zoom);
      const detach=!merge&&!hint&&isDetachmentCandidate(previous.initialGap*zoom,
        distanceToOriginalTree(elements,previous.nodeId)*zoom,
        Math.hypot(releaseX-previous.x,releaseY-previous.y),previous.detach);
      if(previous.moved&&merge&&commitMindMerge(api,previous.nodeId,merge.id))return;
      if(previous.moved&&hint){
        if(commitMindDrop(api,previous.nodeId,hint.operation))return;
        // A valid insert marker can refer to the CURRENT sibling slot. Snap
        // this no-op drag back into the tidy tree rather than leaving its
        // shape freely displaced while its persisted order is unchanged.
        const before=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
        const root=rootFor(before,previous.nodeId);
        if(root){
          api.updateScene({elements:layoutElements(before,root.id),
            captureUpdate:CaptureUpdateAction.IMMEDIATELY});
          restoreSelection(previous);
          return;
        }
      }
      if(previous.moved&&detach&&commitMindSplit(api,previous.nodeId))return;
      // Refresh the boundary edge once on release. Internal connectors
      // already translated together with their bound nodes natively.
      if(previous.moved){
        const elements=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
        const moving=elements.find((el:any)=>el.id===previous.nodeId);
        const mapId=mindData(moving)?.mapId;
        if(mapId)api.updateScene({elements:syncMindConnectors(elements,mapId),
          captureUpdate:CaptureUpdateAction.NEVER});
      }
      restoreSelection(previous);
    },0);
  };
  // Escape, pointercancel, window blur and feature teardown must not commit
  // a pending reparent. Restore a plain one-node selection after cancellation.
  const cancel=()=>{
    const previous=drag;clear();
    if(previous){
      window.setTimeout(()=>{
        endMindConnectorDrag(api);
        if(previous.internalEdgeIds.length){
          const set=new Set(previous.internalEdgeIds);
          const all=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements();
          api.updateScene({elements:all.map((el:any)=>set.has(el.id)&&!el.locked?
            revised(el,{locked:true}):el),captureUpdate:CaptureUpdateAction.NEVER});
        }
        setParentEdgeOpacity(previous,previous.parentEdge?.opacity??100);
        restoreSelection(previous);
      },0);
    }
  };
  const key=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};
  document.addEventListener("pointerdown",down,true);
  document.addEventListener("pointermove",move,true);
  document.addEventListener("pointerup",up,true);
  document.addEventListener("pointercancel",cancel,true);
  document.addEventListener("keydown",key,true);
  window.addEventListener("blur",cancel);
  return()=>{
    cancel();overlay.remove();
    document.removeEventListener("pointerdown",down,true);
    document.removeEventListener("pointermove",move,true);
    document.removeEventListener("pointerup",up,true);
    document.removeEventListener("pointercancel",cancel,true);
    document.removeEventListener("keydown",key,true);
    window.removeEventListener("blur",cancel);
  };
}
