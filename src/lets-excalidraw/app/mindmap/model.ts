/** Scheme B: the scene elements themselves are the only persisted tree data. */
export type Direction = "right" | "left" | "both" | "down";
export type Side = "right" | "left" | "down";
export type BranchStyle = "straight" | "elbow" | "curve";
export interface MindData {
  mapId: string;
  parentId: string | null;
  order: number;
  side: Side;
  direction?: Direction;
  branchStyle?: BranchStyle;
  /** Archived native descendants, labels and links when a branch is folded. */
  collapsedElements?: any[];
}
export const mindData = (element: any): MindData | null => element?.customData?.dodoMind ?? null;
/** Old V2 numeric branch presets are read-only compatibility, not a dependency. */
export const branchStyleOf = (element:any):BranchStyle=>{
  const style=mindData(element)?.branchStyle as string|number|undefined;
  return style===2||style==="2"?"elbow":style===3||style==="3"?"straight":
    style==="straight"||style==="elbow"?style:"curve";
};
export const isMindNode = (el: any): boolean => !el?.isDeleted && ["rectangle","ellipse","diamond","text"].includes(el?.type) && !el?.containerId && Boolean(mindData(el)?.mapId);
export const isEligibleNode = (el:any):boolean => Boolean(el && !el.isDeleted && !el.locked && !el.containerId && ["rectangle","ellipse","diamond","text"].includes(el.type));
export const roots = (elements: readonly any[]): any[] => elements.filter(el => isMindNode(el) && !mindData(el)?.parentId);
export function nodeFor(elements: readonly any[], id: string): any | null {return elements.find(el => el.id === id && isMindNode(el)) || null;}
export function rootFor(elements: readonly any[], id: string): any | null {
  const lookup = new Map(elements.filter(isMindNode).map(el => [el.id, el]));
  let node=lookup.get(id) as any;
  const visited=new Set<string>();
  while(node && mindData(node)?.parentId){
    if(visited.has(node.id))return null;
    visited.add(node.id);node=lookup.get(mindData(node)!.parentId!);
  }
  return node || null;
}
export function childrenOf(elements: readonly any[], parentId: string): any[] {
  return elements.filter(el => isMindNode(el) && mindData(el)?.parentId === parentId)
    .sort((a,b)=>(mindData(a)!.order-mindData(b)!.order)||a.id.localeCompare(b.id));
}
export function descendantsOf(elements: readonly any[], parentId: string): any[] {
  const result:any[]=[];const visited=new Set<string>([parentId]);
  const visit=(id:string)=>{for(const child of childrenOf(elements,id)){
    if(visited.has(child.id))continue;
    visited.add(child.id);result.push(child);visit(child.id);
  }};
  visit(parentId);return result;
}
export function validMapNodes(elements: readonly any[], rootId: string): any[] {
  const root=nodeFor(elements,rootId);if(!root)return [];
  return [root,...descendantsOf(elements,rootId)].filter(el=>mindData(el)?.mapId===mindData(root)?.mapId);
}
