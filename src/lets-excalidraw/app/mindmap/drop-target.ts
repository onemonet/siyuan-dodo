import { descendantsOf, isMindNode, mindData, type Side } from "./model";
import type { DropOperation } from "./reorder";
import { center, normalizedOverlap, overlap, rectGap, snapScene, type Point, type Rect } from "./drop-geometry";

export type DropHint = {operation:DropOperation;target:any;axis:"x"|"y";kind:"direct"|"sibling"|"branch"};

const midpoint=(el:Rect,axis:"x"|"y")=>center(el)[axis];
const sideOf=(target:any,location:Point):Side=>{
  const data=mindData(target);
  if(!data?.parentId){
    if(data?.direction==="down")return "down";
    if(data?.direction==="both")return location.x<midpoint(target,"x")?"left":"right";
    return data?.direction==="left"?"left":"right";
  }
  return data.side;
};
const siblingAxis=(target:any):"x"|"y"=>mindData(target)?.side==="down"?"x":"y";
const allowed=(source:any,target:any,excluded:Set<string>)=>
  target.id!==source.id&&!target.locked&&!excluded.has(target.id)&&
  mindData(source)?.mapId===mindData(target)?.mapId;

/**
 * Resolve a structural drop from the DRAGGED NODE RECTANGLE, not the cursor.
 * Grabbing the left/right side of a node therefore gives the same target at
 * the same physical position. Strong overlap inserts as a child; partial
 * overlap near an ordering edge inserts before/after. The existing whitespace
 * sibling lane and outward branch lane remain available, now measured from
 * rectangle edges, and their tolerances are in screen pixels.
 */
export function resolveMindDrop(elements:readonly any[],sourceId:string,moving:Rect,zoom=1):DropHint|null{
  const source=elements.find(el=>el.id===sourceId&&isMindNode(el));
  if(!source||source.locked||!mindData(source)?.parentId)return null;
  const excluded=new Set([sourceId,...descendantsOf(elements,sourceId).map(el=>el.id)]);
  const candidates=elements.filter(el=>isMindNode(el)&&allowed(source,el,excluded));
  const location=center(moving);
  let best:{hint:DropHint;rank:number}|null=null;
  const choose=(target:any,mode:DropOperation["mode"],kind:DropHint["kind"],rank:number)=>{
    if(mode==="child"&&mindData(target)?.collapsedElements?.length)return;
    const side=mode==="child"?sideOf(target,location):mindData(target)!.side;
    const hint:DropHint={target,axis:siblingAxis(target),kind,
      operation:{targetId:target.id,mode,side}};
    if(!best||rank<best.rank)best={hint,rank};
  };
  for(const target of candidates){
    const data=mindData(target)!;
    const axis=siblingAxis(target);
    const perpendicular=axis==="x"?"y":"x";
    const intersections=overlap(moving,target);
    const gap=rectGap(moving,target);
    const ratio=(location[axis]-target[axis])/Math.max(1,target[axis==="x"?"width":"height"]);
    const areaFraction=normalizedOverlap(moving,target);
    if(data.collapsedElements?.length && ratio>=.30&&ratio<=.70&&areaFraction>=.25)continue;
    // In two-sided trees, releasing a branch along the LEFT/RIGHT edge of
    // the central topic means moving it to that root lane. The moving box may
    // simultaneously overlap a neighbouring branch; root-edge insertion wins
    // when the dragged centre is outside the root and its body touches it.
    if(!data.parentId&&data.direction==="both"&&intersections.y>0&&
      intersections.x>=snapScene(8,zoom)&&
      (location.x<target.x||location.x>target.x+target.width)){
      choose(target,"child","branch",-160-areaFraction*20);
      continue;
    }
    if(gap<=snapScene(24,zoom)){
      // The cursor may be outside both rectangles; use the actual moved
      // rectangle's centre/overlap to choose the attachment and sibling slot.
      if(ratio>=.30&&ratio<=.70){
        choose(target,"child","direct",-100-areaFraction*30+gap*.1);
      }else if(data.parentId){
        const mode=ratio<.30?"before":"after";
        choose(target,mode,ratio>=0&&ratio<=1&&intersections.x>0&&intersections.y>0?"direct":"sibling",
          -65-areaFraction*10+gap*.1);
      }
    }
    if(data.parentId){
      // Retain the whitespace between siblings. Both axes measure the
      // distance between bounding rectangles, NOT from an arbitrary grip.
      const along=Math.max(0,target[axis]- (moving[axis]+moving[axis==="x"?"width":"height"]),
        moving[axis]-(target[axis]+target[axis==="x"?"width":"height"]));
      const across=Math.max(0,target[perpendicular]-(moving[perpendicular]+moving[perpendicular==="x"?"width":"height"]),
        moving[perpendicular]-(target[perpendicular]+target[perpendicular==="x"?"width":"height"]));
      if(along<=snapScene(76,zoom)&&across<=snapScene(32,zoom)){
        const mode=location[axis]<midpoint(target,axis)?"before":"after";
        choose(target,mode,"sibling",10+along*zoom+across*zoom*1.5);
      }
    }
    // Branch insertion outside a parent remains possible; use the leading
    // rectangle edge on the depth axis and its centre for alignment.
    const side=sideOf(target,location);
    const offset=side==="left"?target.x-(moving.x+moving.width):
      side==="down"?moving.y-(target.y+target.height):moving.x-(target.x+target.width);
    const transverse=side==="down"?"x":"y";
    const across=Math.abs(location[transverse]-midpoint(target,transverse));
    if(offset>=-snapScene(12,zoom)&&offset<=snapScene(135,zoom)&&
      across<=Math.max(snapScene(46,zoom),
        (transverse==="x"?target.width:target.height)/2+snapScene(46,zoom))){
      choose(target,"child","branch",28+Math.abs(offset*zoom-56)*.3+across*zoom*.4);
    }
  }
  return best?.hint||null;
}



