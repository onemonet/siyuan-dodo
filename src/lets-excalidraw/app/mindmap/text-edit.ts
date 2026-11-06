import { CaptureUpdateAction, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import { mindData, rootFor } from "./model";
import { layoutElements, revised } from "./elements";

/** Open the actual Excalidraw WYSIWYG for a newly added node. The public API
 * does not expose startTextEditing(): changing appState.editingTextElement
 * without the canvas gesture leaves the editor unmounted. Forward the exact
 * native pointer/mouse sequence to its canvas instead of creating a second
 * text input (which would diverge from Excalidraw's own text engine). */
export function editMindNodeText(api:any,id:string):void {
  let attempts=0;
  const tryOpen=()=>{
    const elements=api.getSceneElements?.()||[];
    const container=elements.find((el:any)=>el.id===id&&!el.isDeleted&&mindData(el));
    if(!container)return;
    const state=api.getAppState?.();
    if(!state||state.editingTextElement)return;
    const pos=sceneCoordsToViewportCoords({sceneX:container.x+container.width/2,
      sceneY:container.y+container.height/2},state);
    const root=document.querySelector('.excalidraw')?.getBoundingClientRect();
    if(!root)return;
    const target=document.elementFromPoint(pos.x,pos.y);
    if(!(target instanceof HTMLElement)||!target.closest('.excalidraw__canvas')){
      // Newly created branches may be outside the current viewport. Center
      // the new element and retry once its native canvas has rerendered.
      if(attempts++<4){
        if(pos.x<root.left+40||pos.x>root.right-40||pos.y<root.top+45||pos.y>root.bottom-45){
          api.scrollToContent?.(container,{fitToContent:false,animate:false});
        }
        window.setTimeout(tryOpen,85);
      }
      return;
    }
    const options={bubbles:true,cancelable:true,clientX:pos.x,clientY:pos.y,
      button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true};
    for(let click=1;click<=2;click++){
      target.dispatchEvent(new PointerEvent('pointerdown',{...options,detail:click}));
      target.dispatchEvent(new MouseEvent('mousedown',{...options,detail:click}));
      target.dispatchEvent(new PointerEvent('pointerup',{...options,buttons:0,detail:click}));
      target.dispatchEvent(new MouseEvent('mouseup',{...options,buttons:0,detail:click}));
      target.dispatchEvent(new MouseEvent('click',{...options,buttons:0,detail:click}));
    }
    target.dispatchEvent(new MouseEvent('dblclick',{...options,buttons:0,detail:2}));
  };
  window.setTimeout(tryOpen,45);
}

const MIN_WIDTH=154, MIN_HEIGHT=52, ROOT_WIDTH=184, ROOT_HEIGHT=64;
const buffer=40;
const fontName=(fontFamily:number)=>fontFamily===1?'Virgil, sans-serif':
  fontFamily===3?'Cascadia, monospace':fontFamily===5?'Excalifont, sans-serif':'Arial, sans-serif';
function desiredSize(text:any,node:any):{width:number;height:number;display:string;textWidth:number;textHeight:number}{
  const root=!mindData(node)?.parentId;
  const content=String(text.originalText??text.text??'');
  const fontSize=Math.max(10,Number(text.fontSize)||18);
  const ctx=document.createElement('canvas').getContext('2d');
  if(ctx)ctx.font=`${fontSize}px ${fontName(text.fontFamily)}`;
  const widthOf=(value:string)=>ctx?.measureText(value).width||value.length*fontSize*.70;
  const measureLines=content.split(/\r?\n/);
  const minWidth=root?ROOT_WIDTH:MIN_WIDTH;
  const maxWidth=680;
  const width=Math.round(Math.max(minWidth,
    Math.min(maxWidth,Math.max(...measureLines.map(widthOf),0)*1.12+buffer)));
  // Re-wrap against the NEW container width: Excalidraw WYSIWYG left text.text
  // wrapped at the OLD 154px container, even when originalText was one line.
  const contentLimit=Math.max(50,width-buffer);
  const lines:string[]=[];
  for(const rawLine of measureLines){
    let line='';
    for(const char of rawLine){
      if(line && widthOf(line+char)>contentLimit){lines.push(line);line=char;}
      else line+=char;
    }
    lines.push(line);
  }
  const textWidth=Math.max(1,Math.ceil(Math.max(...lines.map(widthOf),0)+2));
  const textHeight=Math.ceil(lines.length*fontSize*(Number(text.lineHeight)||1.25));
  const height=Math.round(Math.max(root?ROOT_HEIGHT:MIN_HEIGHT,textHeight+22));
  return {width,height,display:lines.join('\n'),textWidth,textHeight};
}

/** Update exactly one map after text editing commits. Never resize on every
 * keystroke or while Excalidraw's own WYSIWYG is open. */
export function resizeMindText(api:any,textId:string):boolean{
  const source=api.getSceneElementsIncludingDeleted?.()||api.getSceneElements?.()||[];
  const text=source.find((el:any)=>el.id===textId&&!el.isDeleted&&el.type==='text');
  if(!text?.containerId)return false;
  const node=source.find((el:any)=>el.id===text.containerId&&!el.isDeleted&&mindData(el));
  if(!node)return false;
  const root=rootFor(source,node.id);if(!root)return false;
  const size=desiredSize(text,node);
  const nextTextX=node.x+(size.width-size.textWidth)/2,
    nextTextY=node.y+(size.height-size.textHeight)/2;
  const needsShape=Math.abs(node.width-size.width)>=1||Math.abs(node.height-size.height)>=1;
  const needsText=text.text!==size.display||Math.abs(text.width-size.textWidth)>=1||
    Math.abs(text.height-size.textHeight)>=1||Math.abs(text.x-nextTextX)>=1||
    Math.abs(text.y-nextTextY)>=1;
  if(!needsShape&&!needsText)return false;
  const next=source.map((el:any)=>{
    if(el.id===node.id)return revised(el,{width:size.width,height:size.height});
    if(el.id===text.id)return revised(el,{text:size.display,width:size.textWidth,height:size.textHeight,
      x:nextTextX,y:nextTextY});
    return el;
  });
  api.updateScene({elements:layoutElements(next,root.id),
    captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  return true;
}

/** Watch Excalidraw's own text edits and schedule a single D3 reflow at the
 * end. Using text fingerprints also covers native undo/redo and editing a
 * node via normal double-click rather than through the mindmap toolbar. */
export function mountMindTextAutoSize(api:any):()=>void{
  let closed=false,activeId:string|null=null;
  let token=0;
  const fingerprints=new Map<string,string>();
  const snapshot=(elements:readonly any[])=>{
    for(const text of elements){
      if(text.isDeleted||text.type!=='text'||!text.containerId)continue;
      const container=elements.find(el=>el.id===text.containerId);
      if(container&&mindData(container))fingerprints.set(text.id,String(text.originalText??text.text??''));
    }
  };
  snapshot(api.getSceneElements?.()||[]);
  const un=api.onChange((elements:readonly any[],state:any)=>{
    if(closed)return;
    const editing=state.editingTextElement?.id||null;
    if(editing){activeId=editing;return;}
    const changed=new Set<string>();
    if(activeId){changed.add(activeId);activeId=null;}
    const valid=new Set<string>();
    for(const text of elements){
      if(text.isDeleted||text.type!=='text'||!text.containerId)continue;
      const container=elements.find(el=>el.id===text.containerId);
      if(!container||!mindData(container))continue;
      valid.add(text.id);
      const value=String(text.originalText??text.text??'');
      if(fingerprints.has(text.id)&&fingerprints.get(text.id)!==value)changed.add(text.id);
      fingerprints.set(text.id,value);
    }
    for(const id of fingerprints.keys())if(!valid.has(id))fingerprints.delete(id);
    if(!changed.size)return;
    const current=++token;
    window.setTimeout(()=>{
      if(closed||current!==token||api.getAppState()?.editingTextElement)return;
      for(const id of changed)resizeMindText(api,id);
    },45);
  });
  return()=>{closed=true;token++;un?.();};
}
