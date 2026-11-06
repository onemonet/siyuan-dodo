import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Network, X, Check, GitBranchPlus, ListPlus, Redo2, Trash2, ChevronDown, ChevronRight, LayoutTemplate, Palette, Shapes, ChevronsDownUp, ChevronsUpDown, Undo2 } from "lucide-react";
import type { InteractionFeature } from "../toolbar/types";
import { getProofMeta, saveProofImage, selectedProofImage } from "./simple-mind-map-proof-scene";
import "./simple-mind-map-proof.css";
import {mindLayouts,mindThemes,nodeShapes,applyMindTheme,applyMindDensity,type ThemeName,type Density} from "./simple-mind-map-editor-config";

type EngineModule = typeof import("./simple-mind-map-proof-engine");
type Session = {element: any|null; token:number};
type Inspector = "layout" | "theme" | "node";
type ActiveNode = {text:string;shape:string;expand:boolean;hasChildren:boolean;isRoot:boolean} | null;
function Editor({api,session,onClose}:{api:any;session:Session;onClose:()=>void}){
  const canvas=useRef<HTMLDivElement>(null);
  const engine=useRef<any>(null);
  const modules=useRef<EngineModule|null>(null);
  const full=getProofMeta(session.element)?.data;
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const [layout,setLayout]=useState(full?.layout||"logicalStructure");
  const [preset,setPreset]=useState<ThemeName>(full?.dodoEditor?.preset||"business");
  const [density,setDensity]=useState<Density>(full?.dodoEditor?.density||"comfortable");
  const [inspector,setInspector]=useState<Inspector>("layout");
  const [active,setActive]=useState<ActiveNode>(null);
  const [textDraft,setTextDraft]=useState("");
  const [lineStyle,setLineStyle]=useState(full?.theme?.config?.lineStyle||"curve");
  const closing=useRef(false);
  const current=()=>engine.current?.renderer?.activeNodeList?.[0]||null;
  const activeChanged=(node:any)=>{
    if(!node){setActive(null);setTextDraft("");return;}
    const details={text:String(node.getData?.("text")||""),shape:String(node.getData?.("shape")||"rectangle"),
      expand:node.getData?.("expand")!==false,hasChildren:Boolean(node.nodeData?.children?.length),isRoot:Boolean(node.isRoot)};
    setActive(details);setTextDraft(details.text);
  };
  useEffect(()=>{
    let live=true;
    (async()=>{
      try {
        const mod=await import("./simple-mind-map-proof-engine");
        if(!live||!canvas.current)return;
        modules.current=mod;
        const map=mod.startProofMap(canvas.current,getProofMeta(session.element)?.data||null);
        engine.current=map;
        // On a new diagram establish its first theme via library themeConfig.
        if(!full?.theme?.config || Object.keys(full.theme.config).length===0)applyMindTheme(map,preset,density);
        const changed=()=>{if(live)setReady(true);};
        const selected=(_node:any,list:any[])=>{if(live)activeChanged(list?.[0]||null);};
        map.on("node_tree_render_end",changed);map.on("node_active",selected);
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(live)setReady(true);}));
      }catch(reason){if(live)setError(String(reason));}
    })();
    return()=>{live=false;const map=engine.current;engine.current=null;try{map?.destroy();}catch {/* cleanup */}};
  },[session.token]);
  const exec=(command:string,activateRoot=false)=>{
    if(!engine.current)return;
    try {
      const renderer=engine.current.renderer;
      if(activateRoot&&!renderer.activeNodeList?.length&&renderer.root){renderer.addNodeToActiveList(renderer.root);}
      engine.current.execCommand(command);
    }catch(reason){setError(String(reason));}
  };
  const commandOnNode=(command:string,...args:any[])=>{
    const node=current();if(!node)return;
    try{engine.current.execCommand(command,node,...args);activeChanged(current()||node);}catch(reason){setError(String(reason));}
  };
  const applyLayout=(value:string)=>{
    setLayout(value);try{engine.current?.setLayout(value);}catch(reason){setError(String(reason));}
  };
  const setVisualTheme=(id:ThemeName)=>{
    setPreset(id);try{applyMindTheme(engine.current,id,density);setLineStyle("curve");}catch(reason){setError(String(reason));}
  };
  const setCompact=(value:Density)=>{
    setDensity(value);try{applyMindDensity(engine.current,value);}catch(reason){setError(String(reason));}
  };
  const setLine=(style:string)=>{
    setLineStyle(style);
    try{const map=engine.current,old=map.getCustomThemeConfig?.()||{};
      map.setThemeConfig({...old,lineStyle:style});}catch(reason){setError(String(reason));}
  };
  const commitNodeText=()=>{
    const node=current();if(!node||textDraft===node.getData?.("text"))return;
    commandOnNode("SET_NODE_TEXT",textDraft);
  };
  const save=async()=>{
    if(!engine.current||!modules.current||busy||closing.current)return;
    setBusy(true);setError("");
    try{
      commitNodeText();
      const result=await modules.current.snapshotProofMap(engine.current);
      result.data.dodoEditor={preset,density};
      const id=saveProofImage(api,result.svg,result.data,session.element);
      api.setToast?.({message:session.element?"思维导图已更新":"已插入 SVG 思维导图",duration:1600});
      if(id&&!closing.current){closing.current=true;onClose();}
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{if(!closing.current)setBusy(false);}
  };
  const close=()=>{closing.current=true;onClose();};
  return <div className="dodo-smm-scrim" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)e.stopPropagation();}}>
    <div className="dodo-smm-dialog" role="dialog" aria-modal="true" aria-label="SimpleMindMap SVG 编辑器"
      onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
      <header className="dodo-smm-header"><div><Network size={18}/><strong>思维导图</strong><span>SVG 独立编辑 · SimpleMindMap</span></div>
        <button type="button" aria-label="关闭思维导图编辑器" onClick={close}><X size={18}/></button></header>
      <div className="dodo-smm-tools" aria-label="思维导图编辑操作">
        <button type="button" onClick={()=>exec("INSERT_CHILD_NODE",true)} disabled={!ready}><GitBranchPlus size={16}/>子节点</button>
        <button type="button" onClick={()=>exec("INSERT_NODE")} disabled={!ready||!active||active.isRoot}><ListPlus size={16}/>同级节点</button>
        <span className="dodo-smm-separator"/>
        <button type="button" onClick={()=>exec("BACK")} disabled={!ready} title="撤销"><Undo2 size={16}/>撤销</button>
        <button type="button" onClick={()=>exec("FORWARD")} disabled={!ready} title="重做"><Redo2 size={16}/>重做</button>
        <span className="dodo-smm-separator"/>
        <button type="button" onClick={()=>exec("EXPAND_ALL")} disabled={!ready} title="展开所有节点"><ChevronsUpDown size={16}/>全部展开</button>
        <button type="button" onClick={()=>exec("UNEXPAND_ALL")} disabled={!ready} title="折叠所有节点"><ChevronsDownUp size={16}/>全部折叠</button>
        <button type="button" onClick={()=>exec("REMOVE_NODE")} disabled={!ready||!active||active.isRoot} title="删除所选节点及子节点"><Trash2 size={16}/>删除</button>
      </div>
      <div className="dodo-smm-workspace">
        <aside className="dodo-smm-side" aria-label="思维导图设置">
          <nav className="dodo-smm-tabs" role="tablist" aria-label="思维导图设置">
            {([['layout','布局',LayoutTemplate],['theme','主题',Palette],['node','节点',Shapes]] as const).map(([id,title,Icon])=>
              <button type="button" role="tab" aria-selected={inspector===id} key={id} onClick={()=>setInspector(id)}>
                <Icon size={15}/>{title}</button>)}
          </nav>
          <div className="dodo-smm-inspector">
            {inspector==="layout"&&<>
              <h3>布局结构</h3><div className="dodo-smm-layouts">
                {mindLayouts.map(item=><button type="button" key={item.id} aria-label={item.name}
                  aria-pressed={layout===item.id} disabled={!ready} onClick={()=>applyLayout(item.id)}>
                  <span className="dodo-smm-layout-icon" aria-hidden="true">{item.id.includes('Left')?'◧':item.id.includes('Map')?'◇':item.id.includes('timeline')?'▱':item.id.includes('organization')||item.id.includes('Organization')?'▥':'⊞'}</span>
                  {item.name}</button>)}
              </div>
              <h3>布局间距</h3><div className="dodo-smm-segment" role="group" aria-label="布局密度">
                {([['compact','紧凑'],['comfortable','舒适']] as const).map(([id,title])=><button key={id} type="button"
                  aria-pressed={density===id} disabled={!ready} onClick={()=>setCompact(id)}>{title}</button>)}
              </div>
              <h3>分支连接</h3><div className="dodo-smm-segment" role="group" aria-label="分支连接线">
                {([['curve','曲线'],['straight','直线'],['direct','直连']] as const).map(([id,title])=><button key={id} type="button"
                  aria-pressed={lineStyle===id} disabled={!ready} onClick={()=>setLine(id)}>{title}</button>)}
              </div>
            </>}
            {inspector==="theme"&&<><h3>整体主题</h3><div className="dodo-smm-theme-list">
              {mindThemes.map(item=><button type="button" key={item.id} aria-label={item.name}
                aria-pressed={preset===item.id} disabled={!ready} onClick={()=>setVisualTheme(item.id)}>
                <span className="dodo-smm-theme-preview" style={{background:item.paper}}>
                  <i style={{background:item.root}}/><i style={{background:item.branch,borderColor:item.line}}/><i style={{background:item.branch,borderColor:item.line}}/></span>
                <span>{item.name}</span></button>)}
            </div><p className="dodo-smm-hint">切换主题只改变当前导图的颜色与节点样式，不会改变 Excalidraw 其他元素。</p></>}
            {inspector==="node"&&<><h3>所选节点</h3>
              {!active?<p className="dodo-smm-hint">点击画布中的节点后，可在此编辑名称、形状、颜色与展开状态。</p>:<>
                <label className="dodo-smm-field">节点文字<input aria-label="节点文字" value={textDraft}
                  onChange={e=>setTextDraft(e.target.value)} onBlur={commitNodeText}
                  onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();commitNodeText();(e.target as HTMLElement).blur();}}}/></label>
                <h3>形状</h3><div className="dodo-smm-shapes">
                  {nodeShapes.map(item=><button type="button" key={item.id} aria-label={item.name} aria-pressed={active.shape===item.id}
                    onClick={()=>commandOnNode("SET_NODE_SHAPE",item.id)}><span className={'dodo-smm-shape '+item.id}/>{item.name}</button>)}
                </div>
                <h3>节点颜色</h3><div className="dodo-smm-color-inputs">
                  <label>填充<input type="color" aria-label="节点填充色" defaultValue="#e9f1fb"
                    onChange={e=>commandOnNode("SET_NODE_STYLE","fillColor",e.target.value)}/></label>
                  <label>边框<input type="color" aria-label="节点边框色" defaultValue="#537aab"
                    onChange={e=>commandOnNode("SET_NODE_STYLE","borderColor",e.target.value)}/></label>
                </div>
                <h3>结构</h3><button type="button" className="dodo-smm-outline-action"
                  disabled={!active.hasChildren} onClick={()=>commandOnNode("SET_NODE_EXPAND",!active.expand)}>
                  {active.expand?<ChevronDown size={15}/>:<ChevronRight size={15}/>}{active.expand?"折叠当前分支":"展开当前分支"}</button>
              </>}
            </>}
          </div>
        </aside>
        <section className="dodo-smm-canvas" ref={canvas} aria-label="SimpleMindMap 画布"/>
      </div>
      {error&&<div className="dodo-smm-error" role="alert">{error}</div>}
      <footer className="dodo-smm-footer"><span>使用 Tab / Enter 建立节点，双击编辑文字；保存后整棵导图作为一个 SVG。</span>
        <div><button type="button" onClick={close}>取消</button><button type="button" className="dodo-smm-primary"
          disabled={!ready||busy} onClick={()=>void save()}><Check size={16}/>{busy?"正在生成 SVG…":"保存到画布"}</button></div></footer>
    </div>
  </div>;
}

function Host({api,subscribe}:{api:any;subscribe:(callback:()=>void)=>()=>void}){
  const [session,setSession]=useState<Session|null>(null);
  const token=useRef(0);
  const open=useCallback((element:any|null=null)=>setSession({element,token:++token.current}),[]);
  useEffect(()=>subscribe(()=>open(selectedProofImage(api))),[api,open,subscribe]);
  useEffect(()=>{
    const edit=(event:MouseEvent)=>{
      if(event.button!==0||!(event.target instanceof Element)||!event.target.closest(".excalidraw__canvas"))return;
      const apiState=api.getAppState();
      const zoom=apiState.zoom?.value||1;
      const bounds=document.querySelector(".excalidraw")?.getBoundingClientRect();
      if(!bounds)return;
      const px=(event.clientX-bounds.left)/zoom-(apiState.scrollX||0);
      const py=(event.clientY-bounds.top)/zoom-(apiState.scrollY||0);
      const target=[...api.getSceneElements()].reverse().find((el:any)=>
        getProofMeta(el) && px>=el.x && px<=el.x+el.width && py>=el.y && py<=el.y+el.height);
      if(!target)return;
      event.preventDefault();event.stopImmediatePropagation();open(target);
    };
    document.addEventListener("dblclick",edit,true);
    return()=>document.removeEventListener("dblclick",edit,true);
  },[api,open]);
  return session?<Editor key={session.token} api={api} session={session} onClose={()=>setSession(null)}/>:null;
}

const feature:InteractionFeature = {
  id:"simpleMindMapProof",label:"SimpleMindMap（SVG 实验）",
  description:"独立实验：成熟 SimpleMindMap 编辑器生成 SVG 图片，双击编辑，JSON 随画布保存；与原生思维导图方案 B 隔离。",
  defaultEnabled:false,
  mount(api){
    const host=document.createElement("div");host.className="dodo-smm-root";document.body.append(host);
    const launcher=document.createElement("button");launcher.className="dodo-smm-launcher";
    launcher.type="button";launcher.title="思维导图（SVG 实验）";launcher.setAttribute("aria-label","思维导图（SVG 实验）");
    const icon=createRoot(launcher);icon.render(<Network size={19} strokeWidth={1.7} aria-hidden="true"/>);
    let callback:(()=>void)|null=null;
    const subscribe=(fn:()=>void)=>{callback=fn;return()=>{if(callback===fn)callback=null;};};
    launcher.addEventListener("click",()=>callback?.());
    const attach=()=>{
      const anchor=document.querySelector(".dodo-mind-launcher")||document.querySelector(".dodo-icon-launcher")||
        document.querySelector('[data-testid="toolbar-image"]')?.closest("label");
      if(anchor?.parentElement&&launcher.previousElementSibling!==anchor)anchor.insertAdjacentElement("afterend",launcher);
    };
    const observer=new MutationObserver(attach);
    observer.observe(document.querySelector(".excalidraw")||document.body,{childList:true,subtree:true});attach();
    const root=createRoot(host);root.render(<Host api={api} subscribe={subscribe}/>);
    return()=>{observer.disconnect();root.unmount();icon.unmount();launcher.remove();host.remove();};
  }
};
export default feature;
