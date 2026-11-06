import "./minimap.css";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { InteractionFeature } from "../toolbar/types";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Map as MapIcon } from "lucide-react";

/** SVG navigator, with its entry as the first native zoom control. */
const WIDTH=228,HEIGHT=146,PAD=10;
const svgNS="http://www.w3.org/2000/svg";
const STORAGE_KEY="dodo-excalidraw-minimap-open";
type World={minX:number;minY:number;scale:number;x:number;y:number};
type Box={x:number;y:number;width:number;height:number};
type Drag={pointerId:number;offsetX:number;offsetY:number};
const range=(start:number,end:number)=>[Math.min(start,end),Math.max(start,end)] as const;
const viewportOf=(editor:HTMLElement,state:any):Box=>{
  const zoom=state.zoom?.value||1;
  return {x:-(state.scrollX||0),y:-(state.scrollY||0),
    width:editor.clientWidth/zoom,height:editor.clientHeight/zoom};
};
const number=(x:any,defaultValue=0):number=>Number.isFinite(x)?x:defaultValue;
const elementBox=(el:any):Box=>{
  const [x1,x2]=range(number(el.x),number(el.x)+number(el.width));
  const [y1,y2]=range(number(el.y),number(el.y)+number(el.height));
  return {x:x1,y:y1,width:Math.max(1,x2-x1),height:Math.max(1,y2-y1)};
};
function calculateWorld(elements:readonly any[],view:Box):World{
  let minX=view.x,minY=view.y,maxX=view.x+view.width,maxY=view.y+view.height;
  for(const el of elements){
    const box=elementBox(el);
    minX=Math.min(minX,box.x);minY=Math.min(minY,box.y);
    maxX=Math.max(maxX,box.x+box.width);maxY=Math.max(maxY,box.y+box.height);
  }
  const scale=Math.min((WIDTH-PAD*2)/Math.max(1,maxX-minX),(HEIGHT-PAD*2)/Math.max(1,maxY-minY));
  return {minX,minY,scale,x:(WIDTH-(maxX-minX)*scale)/2,y:(HEIGHT-(maxY-minY)*scale)/2};
}
const elementSignature=(els:readonly any[])=>els.map((el:any)=>[
  el.id,el.type,el.version,el.x,el.y,el.width,el.height
].join(":")).join("|");
const svgElement=(type:string,attrs:Record<string,string|number>,className?:string)=>{
  const el=document.createElementNS(svgNS,type);
  if(className)el.setAttribute("class",className);
  for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
  return el;
};
const setRect=(el:SVGRectElement,box:Box,klass?:string)=>{
  el.setAttribute("x",String(box.x));el.setAttribute("y",String(box.y));
  el.setAttribute("width",String(Math.max(1,box.width)));
  el.setAttribute("height",String(Math.max(1,box.height)));
  if(klass)el.setAttribute("class",klass);
};
function paintShapes(layer:SVGGElement,elements:readonly any[],world:World){
  const toX=(x:number)=>world.x+(x-world.minX)*world.scale;
  const toY=(y:number)=>world.y+(y-world.minY)*world.scale;
  const children:SVGElement[]=[];
  for(const el of elements){
    const box=elementBox(el);
    const b={x:toX(box.x),y:toY(box.y),width:box.width*world.scale,height:box.height*world.scale};
    if(el.type==="arrow"||el.type==="line"||el.type==="freedraw"){
      const points:Array<[number,number]>=Array.isArray(el.points)?el.points:[];
      if(points.length>=2){
        const coords=points.map(([x,y])=>[toX(number(el.x)+x),toY(number(el.y)+y)]);
        children.push(svgElement("polyline",{points:coords.map(([x,y])=>x+","+y).join(" ")},"dodo-minimap-line"));
        continue;
      }
    }
    if(el.type==="text"){
      const lines=Math.max(1,Math.min(3,String(el.text||"").split("\n").length));
      for(let line=0;line<lines;line++){
        const width=Math.max(3,b.width*(line===lines-1?.7:.92));
        children.push(svgElement("rect",{x:b.x,y:b.y+line*b.height/lines+1,
          width,height:Math.max(1.4,Math.min(3.3,b.height/lines*.40)),rx:1},"dodo-minimap-text"));
      }
    }else if(el.type==="ellipse"){
      children.push(svgElement("ellipse",{cx:b.x+b.width/2,cy:b.y+b.height/2,
        rx:Math.max(1,b.width/2),ry:Math.max(1,b.height/2)},"dodo-minimap-shape"));
    }else if(el.type==="diamond"){
      children.push(svgElement("polygon",{points:[
        [b.x+b.width/2,b.y],[b.x+b.width,b.y+b.height/2],
        [b.x+b.width/2,b.y+b.height],[b.x,b.y+b.height/2]
      ].map(pair=>pair.join(",")).join(" ")},"dodo-minimap-shape"));
    }else if(el.type==="image"){
      children.push(svgElement("rect",{...b,rx:2},"dodo-minimap-image"));
      children.push(svgElement("path",{d:`M ${b.x+2} ${b.y+b.height-2} L ${b.x+b.width/2} ${b.y+b.height*.42} L ${b.x+b.width-2} ${b.y+b.height-2}`},"dodo-minimap-line"));
    }else{
      children.push(svgElement("rect",{...b,rx:2},el.type==="frame"?
        "dodo-minimap-frame":"dodo-minimap-shape"));
    }
  }
  // Only rebuild when the actual scene or its world transform changes.
  layer.replaceChildren(...children);
}
const feature:InteractionFeature={
  id:"minimap",label:"导航小地图",
  description:"在 Excalidraw 底部控制区打开画布概览；点击定位，拖动视口框移动画布。",
  defaultEnabled:false,
  mount(api){
    const editor=document.querySelector<HTMLElement>(".excalidraw");
    if(!editor)return()=>{};
    let alive=true,opened=false,frame:number|null=null,world:World|null=null,
      drag:Drag|null=null,shapeKey="",attached=false,zoomGroup:HTMLElement|null=null;
    try{opened=localStorage.getItem(STORAGE_KEY)==="1";}catch{}
    const trigger=document.createElement("button");
    trigger.type="button";
    trigger.className="ToolIcon_type_button ToolIcon_size_medium zoom-button ToolIcon_type_button--show ToolIcon dodo-minimap-trigger";
    trigger.setAttribute("aria-label","导航小地图");
    trigger.setAttribute("title","导航小地图");
    trigger.innerHTML='<span class="ToolIcon__icon"></span>';
    const iconRoot=createRoot(trigger.querySelector<HTMLElement>(".ToolIcon__icon")!);
    iconRoot.render(createElement(MapIcon,{size:16,strokeWidth:1.8,"aria-hidden":true}));
    trigger.setAttribute("aria-expanded",String(opened));
    const panel=document.createElement("aside");
    panel.className="dodo-minimap-panel";panel.hidden=!opened;
    panel.setAttribute("aria-label","导航小地图");
    const svg=svgElement("svg",{viewBox:`0 0 ${WIDTH} ${HEIGHT}`,role:"img",
      "aria-label":"画布缩略图，可拖动画布视口"});
    const shapeLayer=svgElement("g",{},"dodo-minimap-scene") as SVGGElement;
    const view=svgElement("rect",{x:0,y:0,width:1,height:1},"dodo-minimap-viewport") as SVGRectElement;
    svg.append(shapeLayer,view);panel.append(svg);document.body.append(panel);
    const attach=()=>{
      if(!alive)return;
      // ZoomActions wraps its actual buttons in a horizontal Stack. Attach
      // beside the native zoom-out control, not as a sibling of the Stack:
      // otherwise both controls start at x=16 and visually overlap.
      const minus=editor.querySelector<HTMLElement>(".zoom-actions .zoom-out-button");
      const row=minus?.parentElement;
      const group=minus?.closest<HTMLElement>(".zoom-actions")||null;
      if(!minus||!row||!group){
        attached=false;zoomGroup?.classList.remove("dodo-zoom-with-minimap");
        zoomGroup=null;return;
      }
      if(zoomGroup&&zoomGroup!==group)zoomGroup.classList.remove("dodo-zoom-with-minimap");
      zoomGroup=group;
      if(trigger.parentElement!==row||trigger.nextElementSibling!==minus)
        row.insertBefore(trigger,minus);
      attached=trigger.parentElement===row;
      if(attached)group.classList.add("dodo-zoom-with-minimap");
    };
    // React may replace the zoom group on a responsive layout change. Keep
    // exactly one entry attached to the active group, without another footer.
    const observer=new MutationObserver(()=>attach());
    observer.observe(editor,{childList:true,subtree:true});
    attach();
    const place=()=>{
      const anchor=trigger.getBoundingClientRect(),bounds=editor.getBoundingClientRect();
      const w=panel.offsetWidth||WIDTH,h=panel.offsetHeight||HEIGHT;
      const left=Math.max(bounds.left+8,Math.min(anchor.left+(anchor.width-w)/2,bounds.right-w-8));
      const top=Math.max(bounds.top+8,Math.min(anchor.top-h-8,bounds.bottom-h-8));
      panel.style.left=Math.round(left)+"px";
      panel.style.top=Math.round(top)+"px";
    };
    const render=()=>{
      frame=null;
      if(!alive||!opened)return;
      attach();
      if(!attached)return;
      place();
      const elements=(api.getSceneElements?.()||[]).filter((el:any)=>!el.isDeleted);
      const state=api.getAppState();
      panel.dataset.theme=state.theme||"light";
      const viewport=viewportOf(editor,state);
      if(!drag)world=calculateWorld(elements,viewport);
      if(!world)return;
      const nextKey=elementSignature(elements)+":"+
        [world.minX,world.minY,world.scale,world.x,world.y].join(",");
      if(nextKey!==shapeKey){paintShapes(shapeLayer,elements,world);shapeKey=nextKey;}
      setRect(view,{x:world.x+(viewport.x-world.minX)*world.scale,
        y:world.y+(viewport.y-world.minY)*world.scale,
        width:viewport.width*world.scale,height:viewport.height*world.scale});
    };
    const schedule=()=>{
      if(!alive)return;
      attach();
      if(!opened||frame!==null)return;
      frame=requestAnimationFrame(render);
    };
    const show=(value:boolean)=>{
      opened=value;panel.hidden=!value;
      trigger.setAttribute("aria-expanded",String(value));
      try{localStorage.setItem(STORAGE_KEY,value?"1":"0");}catch{}
      if(value)schedule();
    };
    const point=(event:PointerEvent)=>{
      const bounds=svg.getBoundingClientRect();
      return {x:(event.clientX-bounds.left)*WIDTH/Math.max(1,bounds.width),
        y:(event.clientY-bounds.top)*HEIGHT/Math.max(1,bounds.height)};
    };
    const navigate=(event:PointerEvent)=>{
      if(!world)return;
      const p=point(event),state=api.getAppState(),zoom=state.zoom?.value||1;
      const centerX=world.minX+(p.x-(drag?.offsetX||0)-world.x)/world.scale;
      const centerY=world.minY+(p.y-(drag?.offsetY||0)-world.y)/world.scale;
      api.updateScene({appState:{scrollX:-centerX+editor.clientWidth/(2*zoom),
        scrollY:-centerY+editor.clientHeight/(2*zoom)},
        captureUpdate:CaptureUpdateAction.NEVER});
      schedule();
    };
    const onDown=(event:PointerEvent)=>{
      if(event.button!==0||!world)return;
      const p=point(event);
      const x=Number(view.getAttribute("x")),y=Number(view.getAttribute("y"));
      const w=Number(view.getAttribute("width")),h=Number(view.getAttribute("height"));
      const inside=p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h;
      drag={pointerId:event.pointerId,offsetX:inside?p.x-x-w/2:0,
        offsetY:inside?p.y-y-h/2:0};
      svg.setPointerCapture(event.pointerId);
      panel.dataset.dragging="true";
      event.preventDefault();event.stopPropagation();navigate(event);
    };
    const onMove=(event:PointerEvent)=>{
      if(!drag||drag.pointerId!==event.pointerId)return;
      navigate(event);event.preventDefault();event.stopPropagation();
    };
    const onUp=(event:PointerEvent)=>{
      if(!drag||drag.pointerId!==event.pointerId)return;
      drag=null;panel.removeAttribute("data-dragging");
      if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
      schedule();
    };
    const onToggle=()=>show(!opened);
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&opened&&!(event.target instanceof HTMLInputElement))show(false);};
    trigger.addEventListener("click",onToggle);
    svg.addEventListener("pointerdown",onDown);
    svg.addEventListener("pointermove",onMove);
    svg.addEventListener("pointerup",onUp);
    svg.addEventListener("pointercancel",onUp);
    document.addEventListener("keydown",onKey);
    const unsubscribe=api.onChange(schedule);
    const resize=new ResizeObserver(schedule);
    resize.observe(editor);
    window.addEventListener("resize",schedule);
    editor.addEventListener("wheel",schedule,{passive:true});
    // Pure viewport pans can be emitted without a scene update.
    editor.addEventListener("pointermove",schedule,{passive:true});
    if(opened)schedule();
    return()=>{
      alive=false;observer.disconnect();unsubscribe?.();resize.disconnect();
      if(frame!==null)cancelAnimationFrame(frame);
      document.removeEventListener("keydown",onKey);
      window.removeEventListener("resize",schedule);
      editor.removeEventListener("wheel",schedule);
      editor.removeEventListener("pointermove",schedule);
      zoomGroup?.classList.remove("dodo-zoom-with-minimap");
      iconRoot.unmount();
      trigger.remove();panel.remove();
    };
  }
};
export default feature;


