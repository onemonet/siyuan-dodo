import { CaptureUpdateAction, convertToExcalidrawElements, getCommonBounds, newElementWith } from "@excalidraw/excalidraw";
import { nanoid } from "nanoid";
import { applyScenePositions } from "./scene-positions";
type E={id:string;type:string;x:number;y:number;width:number;height:number;[key:string]:any};
const api=()=>window.excalidrawAPI;
const alive=():E[]=>(api().getSceneElements() as E[]).filter(e=>!e.isDeleted);
const all=():E[]=>(api().getSceneElementsIncludingDeleted() as E[]);
const finite=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<1e6;
const changed=(e:E,patch:Record<string,any>)=>newElementWith(e as any,patch) as E;
const main=(e:E)=>!(e.type==="text"&&e.containerId);
function selection(ids:unknown,min:number,max=100):E[]{
  if(!Array.isArray(ids)||ids.length<min||ids.length>max||ids.some(id=>typeof id!=="string")||new Set(ids).size!==ids.length)
    throw new Error(`ids 需包含 ${min}–${max} 个不重复的元素 ID`);
  const byId=new Map(alive().map(e=>[e.id,e]));
  const selected=ids.map(id=>byId.get(id));
  if(selected.some(e=>!e))throw new Error("元素不存在，请重新读取画布");
  if(selected.some(e=>e!.locked))throw new Error("无法修改锁定元素");
  const state=api().getAppState();
  if(selected.some(e=>state.editingTextElement?.id===e!.id||state.resizingElement?.id===e!.id||
    state.editingLinearElement?.elementId===e!.id))throw new Error("元素正在编辑，请稍后再操作");
  if(state.selectedElementsAreBeingDragged || state.isResizing || state.isRotating)throw new Error("画布正在交互操作中");
  return selected as E[];
}
const bounds=(e:E)=>getCommonBounds([e] as any) as [number,number,number,number];
const unit=(value:E[])=>value.filter(main).filter(e=>e.type!=="arrow");
function commitScene(scene:E[]){api().updateScene({elements:scene,captureUpdate:CaptureUpdateAction.IMMEDIATELY});}
export function alignAgentElements(args:{ids:string[];alignment:string}){
  const selected=unit(selection(args.ids,2));
  if(selected.length<2)throw new Error("对齐需要至少两个非箭头、非绑定文字的元素");
  const allowed=["left","center-x","right","top","center-y","bottom"];
  if(!allowed.includes(args.alignment))throw new Error("alignment 无效");
  const bs=selected.map(bounds),left=Math.min(...bs.map(b=>b[0])),top=Math.min(...bs.map(b=>b[1]));
  const right=Math.max(...bs.map(b=>b[2])),bottom=Math.max(...bs.map(b=>b[3]));
  const axisX=["left","center-x","right"].includes(args.alignment);
  const target=args.alignment==="left"?left:args.alignment==="right"?right:args.alignment==="center-x"?(left+right)/2:
    args.alignment==="top"?top:args.alignment==="bottom"?bottom:(top+bottom)/2;
  const pos=new Map<string,{x:number;y:number}>();
  selected.forEach((el,i)=>{
    const b=bs[i],current=axisX?(args.alignment==="left"?b[0]:args.alignment==="right"?b[2]:(b[0]+b[2])/2):
      (args.alignment==="top"?b[1]:args.alignment==="bottom"?b[3]:(b[1]+b[3])/2);
    const delta=target-current;pos.set(el.id,{x:el.x+(axisX?delta:0),y:el.y+(axisX?0:delta)});
  });
  const applied=applyScenePositions(api(),pos);
  return {aligned:selected.map(e=>e.id),changed:applied,saved:false};
}
export function distributeAgentElements(args:{ids:string[];axis:"horizontal"|"vertical";gap?:number}){
  const selected=unit(selection(args.ids,3));
  if(selected.length<3)throw new Error("等距分布需要至少三个非箭头、非绑定文字的元素");
  if(args.axis!=="horizontal"&&args.axis!=="vertical")throw new Error("axis 必须为 horizontal 或 vertical");
  const axis:0|1=args.axis==="horizontal"?0:1;
  const gap=args.gap;
  if(gap!==undefined&&(!finite(gap)||gap<0||gap>3000))throw new Error("gap 应为 0–3000");
  const sorted=selected.map(e=>({e,b:bounds(e)})).sort((a,b)=>a.b[axis]-b.b[axis]);
  const min=sorted[0].b[axis],max=Math.max(...sorted.map(v=>v.b[axis+2]));
  const sizes=sorted.map(v=>v.b[axis+2]-v.b[axis]);
  const occupied=sizes.reduce((a,b)=>a+b,0);
  const spacing=gap??((max-min-occupied)/(sorted.length-1));
  let cursor=min;
  const pos=new Map<string,{x:number;y:number}>();
  for(let i=0;i<sorted.length;i++){
    const {e,b}=sorted[i],d=cursor-b[axis];
    pos.set(e.id,{x:e.x+(axis===0?d:0),y:e.y+(axis===1?d:0)});
    cursor+=sizes[i]+spacing;
  }
  const changedPositions=applyScenePositions(api(),pos);
  return {distributed:sorted.map(v=>v.e.id),gap:spacing,changed:changedPositions,saved:false};
}
export function groupAgentElements(args:{ids:string[]}){
  const selected=selection(args.ids,2),ids=new Set(selected.map(e=>e.id));
  const groupId=nanoid(),now=Date.now();
  const scene=all().map(e=>ids.has(e.id)||(e.type==="text"&&ids.has(e.containerId))
    ?changed(e,{groupIds:[groupId,...(e.groupIds||[])],updated:now}):e);
  commitScene(scene);
  return {groupId,grouped:selected.map(e=>e.id),saved:false};
}
export function ungroupAgentElements(args:{ids:string[]}){
  const selected=selection(args.ids,1);
  const ids=new Set(selected.map(e=>e.id));
  const common=(selected[0].groupIds||[]).find((g:string)=>selected.every(e=>(e.groupIds||[]).includes(g)));
  if(!common)throw new Error("所选元素没有共同的分组");
  const affected=new Set<string>();
  const scene=all().map(e=>{
    if((ids.has(e.id)||(e.type==="text"&&ids.has(e.containerId)))&&(e.groupIds||[]).includes(common)){
      affected.add(e.id);
      return changed(e,{groupIds:e.groupIds.filter((id:string)=>id!==common)});
    }
    return e;
  });
  commitScene(scene);
  return {groupId:common,ungrouped:[...affected],saved:false};
}
export function duplicateAgentElements(args:{ids:string[];dx?:number;dy?:number}){
  const selected=selection(args.ids,1);
  const dx=args.dx??40,dy=args.dy??40;
  if(!finite(dx)||!finite(dy))throw new Error("dx/dy 无效");
  const roots=new Set(selected.map(e=>e.id));
  // Include bound labels, plus complete frames, without double-copying peers.
  for(const e of alive())if(e.frameId&&roots.has(e.frameId))roots.add(e.id);
  for(const e of alive())if(e.type==="text"&&e.containerId&&roots.has(e.containerId))roots.add(e.id);
  const copied=alive().filter(e=>roots.has(e.id));
  if(copied.length>300)throw new Error("一次最多复制 300 个关联元素");
  const ids=new Map(copied.map(e=>[e.id,nanoid()])),groups=new Map<string,string>();
  const mapGroup=(g:string)=>{if(!groups.has(g))groups.set(g,nanoid());return groups.get(g)!};
  const result=copied.map(e=>{
    const mapped=(id:string|null|undefined)=>id&&ids.get(id)||id;
    const bindings=(key:string)=>e[key]?{...e[key],elementId:mapped(e[key].elementId)}:null;
    return {...e,id:ids.get(e.id)!,x:e.x+dx,y:e.y+dy,version:1,versionNonce:Math.floor(Math.random()*2147483647),
      updated:Date.now(),groupIds:(e.groupIds||[]).map(mapGroup),
      containerId:mapped(e.containerId)||null,frameId:mapped(e.frameId)||null,
      boundElements:e.boundElements?.map((v:any)=>({...v,id:mapped(v.id)}))||null,
      startBinding:bindings("startBinding"),endBinding:bindings("endBinding"),
      // Only preserve reference IDs that were copied; existing external bindings are removed.
      ...(e.type==="arrow"?{
        startBinding:e.startBinding&&ids.has(e.startBinding.elementId)?bindings("startBinding"):null,
        endBinding:e.endBinding&&ids.has(e.endBinding.elementId)?bindings("endBinding"):null
      }:{}),
      ...(e.type==="text"&&e.containerId&&!ids.has(e.containerId)?{containerId:null}:{}),
    };
  });
  commitScene([...all(),...result]);
  return {created:result.map(e=>e.id),idMap:Object.fromEntries(ids),saved:false};
}
export async function mermaidAgentElements(args:{definition:string;x?:number;y?:number}){
  const definition=args.definition;
  if(typeof definition!=="string"||!definition.trim()||definition.length>18000)throw new Error("Mermaid 定义为空或超过 18000 字符");
  if(args.x!==undefined&&!finite(args.x)||args.y!==undefined&&!finite(args.y))throw new Error("坐标无效");
  const {parseMermaidToExcalidraw}=await import("@excalidraw/mermaid-to-excalidraw");
  const parsed=await parseMermaidToExcalidraw(definition,{startOnLoad:false,maxEdges:300,maxTextSize:18000});
  if(!parsed.elements?.length||parsed.elements.length>300)throw new Error("Mermaid 转换结果为空或超过 300 个元素");
  if(parsed.files&&Object.keys(parsed.files).length)throw new Error("暂不支持包含外部图片的 Mermaid 图表");
  const shifted=parsed.elements.map((el:any)=>({...el,id:el.id||nanoid(),roughness:0}));
  const converted=convertToExcalidrawElements(shifted as any,{regenerateIds:false}) as E[];
  if(!converted.length)throw new Error("Mermaid 未生成任何可编辑元素");
  const b=getCommonBounds(converted as any),x=args.x??(b[0]),y=args.y??b[1];
  const dx=x-b[0],dy=y-b[1];
  const currentIds=new Set(all().map(e=>e.id));
  if(converted.some(e=>currentIds.has(e.id)))throw new Error("Mermaid 元素 ID 冲突");
  const result=converted.map(e=>changed(e,{x:e.x+dx,y:e.y+dy}));
  commitScene([...all(),...result]);
  return {created:result.map(e=>e.id),bounds:getCommonBounds(result as any),saved:false};
}
export async function addAgentImage(args:{dataURL:string;x:number;y:number;width?:number;height?:number}){
  const dataURL=args.dataURL;
  if(typeof dataURL!=="string"||dataURL.length>8_000_000||
    !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataURL))
    throw new Error("仅支持 6MB 以内的 PNG、JPEG、WebP 或 GIF Base64 图片");
  if(!finite(args.x)||!finite(args.y))throw new Error("图片 x/y 无效");
  const mimeType=dataURL.slice(5,dataURL.indexOf(";")) as string;
  const dims=await new Promise<{width:number;height:number}>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});
    image.onerror=()=>reject(new Error("无法读取图片数据"));
    image.src=dataURL;
  });
  const width=args.width??dims.width,height=args.height??dims.height;
  if(!finite(width)||!finite(height)||width<=0||height<=0||width>8000||height>8000)
    throw new Error("图片尺寸必须在 1–8000 之间");
  const fileId=nanoid(),id=nanoid();
  const shape=(convertToExcalidrawElements([{
    id,type:"rectangle",x:args.x,y:args.y,width,height,roughness:0
  }] as any,{regenerateIds:false}) as E[])[0];
  const image:E={...shape,id,type:"image",status:"saved",fileId,scale:[1,1],crop:null,angle:0,
    boundElements:null,locked:false};
  // Only mutate after decoding and validating, preserving native undo semantics.
  api().addFiles([{id:fileId,mimeType,dataURL,created:Date.now(),lastRetrieved:Date.now()}]);
  commitScene([...all(),image]);
  return {created:[id],fileId,width,height,saved:false};
}
