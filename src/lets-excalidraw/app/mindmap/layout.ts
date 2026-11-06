import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import { mindData, type Direction, type Side } from "./model";

export type Position = {x:number;y:number};

/**
 * d3-hierarchy computes a tidy tree for each side of the root.
 * Excalidraw continues to own every node, label, arrow and user interaction;
 * only the layout algorithm is replaced. All positions refer to the TOP-LEFT
 * of the corresponding Excalidraw shape (not its centre).
 */
const LEVEL_GAP=86, SIBLING_GAP=22, VERTICAL_GAP=76;
type LayoutNode={element:any;children:LayoutNode[]};
const span=(node:any,side:Side):number=>Math.max(1,Number(side==="down"?node.width:node.height)||50);
const depthSpan=(node:any,side:Side):number=>Math.max(1,Number(side==="down"?node.height:node.width)||50);

export function mapPositions(elements:readonly any[],root:any):Map<string,Position>{
  const positions=new Map<string,Position>();
  const direction:Direction=mindData(root)?.direction||"right";
  const sides:Side[]=direction==="both"?["right","left"]:[direction];
  const mapId=mindData(root)?.mapId;
  if(!mapId)return positions;

  // Index once. This also prevents unrelated maps with a reused parent id
  // from being laid out as part of this tree.
  const active=elements.filter(el=>!el.isDeleted&&mindData(el)?.mapId===mapId);
  const byParent=new Map<string,any[]>();
  for(const node of active){
    const parentId=mindData(node)?.parentId;
    if(!parentId)continue;
    const siblings=byParent.get(parentId)||[];
    siblings.push(node);byParent.set(parentId,siblings);
  }
  for(const siblings of byParent.values())siblings.sort((a,b)=>
    (mindData(a)!.order-mindData(b)!.order)||a.id.localeCompare(b.id));

  const branches=byParent.get(root.id)||[];
  const membership=new Map<string,Side>();
  branches.forEach((node,i)=>membership.set(node.id,direction==="both"
    ?(mindData(node)?.side==="left"?"left":mindData(node)?.side==="right"?"right":i%2===0?"right":"left")
    :direction));

  for(const side of sides){
    const seen=new Set<string>([root.id]);
    const build=(element:any):LayoutNode=>{
      // The source can contain malformed tree metadata. Avoid infinite loops
      // on cyclic records without changing those persisted records.
      const children:LayoutNode[]=[];
      for(const child of byParent.get(element.id)||[]){
        if(seen.has(child.id)||(element.id===root.id&&membership.get(child.id)!==side))continue;
        seen.add(child.id);children.push(build(child));
      }
      return {element,children};
    };
    const data=build(root);
    if(!data.children.length)continue;

    // Tidy tree handles sibling / cousin subtree relationships; separation
    // uses actual perpendicular node dimensions rather than a fixed row.
    const pointRoot=tree<LayoutNode>()
      .nodeSize([1,1])
      .separation((a,b)=>(span(a.data.element,side)+span(b.data.element,side))/2+
        SIBLING_GAP+(a.parent===b.parent?0:8))
      (hierarchy(data,node=>node.children));

    // The horizontal axis is column-aligned; the down axis is row-aligned.
    // Each level reserves the largest size at that depth, preventing a wide
    // or tall element from overlapping the following level.
    const maxAtDepth=new Map<number,number>();
    pointRoot.each(node=>maxAtDepth.set(node.depth,
      Math.max(maxAtDepth.get(node.depth)||0,depthSpan(node.data.element,side))));
    const starts=[0];
    for(let depth=1;depth<=Math.max(...maxAtDepth.keys());depth++){
      starts[depth]=starts[depth-1]+(maxAtDepth.get(depth-1)||0)+
        (side==="down"?VERTICAL_GAP:LEVEL_GAP);
    }
    const rootCross=side==="down"?root.x+(root.width||0)/2:root.y+(root.height||0)/2;
    pointRoot.each((point:HierarchyPointNode<LayoutNode>)=>{
      if(point.depth===0)return; // never shift the central topic
      const node=point.data.element;
      const cross=rootCross+(point.x-pointRoot.x)-span(node,side)/2;
      if(side==="down"){
        positions.set(node.id,{x:cross,y:root.y+starts[point.depth]});
      }else if(side==="right"){
        positions.set(node.id,{x:root.x+starts[point.depth],y:cross});
      }else{
        // All elements in one left-facing column share a right edge.
        positions.set(node.id,{x:root.x-(starts[point.depth]-(root.width||0))-(node.width||0),y:cross});
      }
    });
  }
  return positions;
}
