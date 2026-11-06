import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { Shapes, Search, X, Palette, RefreshCw, FaceSlightlySmilingPlus } from "lucide-react";
import type { InteractionFeature } from "../toolbar/types";
import { displayName } from "./tabler-icon-data";
import { libraries, loadLibrary, previewSrc, styleOf, type IconCatalog, type LibraryId } from "./icon-library-data";
import { ColorField } from "../tools/style-controls";
import {
  avatarStyles, generateAvatar, makeAvatarCatalog, prepareAvatarStyle,
  type AvatarStyleId,
} from "./icon-avatar-generator";
import { insertLibraryImage, updateLibraryImage, selectedLibraryImage, type IconMeta } from "./icon-library-scene";
import "./icon-library.css";

const recentKey = "dodo-excalidraw-recent-icons:v2";
const oldRecentKey = "dodo-excalidraw-recent-icons:v1";
const popular: Record<LibraryId, string[]> = {
  tabler:["alarm","heart","home","user","settings","arrow-right","star","search","calendar","photo","check","bell"],
  lucide:["house","heart","settings","user","search","star","calendar","camera","smile","image","bell","arrow-right"],
  iconpark:["home","user","application","search","like","setting","calendar","camera","alarm"],
  phosphor:["heart","house","user","gear","bell","magnifying-glass","calendar","star"],
  carbon:["accessibility","add--document","cloud","ai","automobile","agile"],
  dicebear:[],
};
const keyFor = (library: LibraryId,name: string,avatarStyle:AvatarStyleId="open-peeps") =>
  library==="dicebear" ? "dicebear:"+avatarStyle+":"+name : library+":"+name;
const readRecent = (): string[] => {
  try {
    const content = localStorage.getItem(recentKey);
    const parsed: unknown = content ? JSON.parse(content) : (JSON.parse(localStorage.getItem(oldRecentKey) || "[]") as unknown[])
      .map(name => typeof name === "string" ? keyFor("tabler",name) : "");
    return Array.isArray(parsed) ? parsed.filter((name):name is string=>typeof name === "string")
      .map(name=>name.startsWith("dicebear:")&&name.split(":").length===2
        ? "dicebear:open-peeps:"+name.slice("dicebear:".length):name).slice(0,24) : [];
  } catch { return []; }
};
const remember = (library:LibraryId,name:string,avatarStyle:AvatarStyleId="open-peeps"):string[] => {
  const value=keyFor(library,name,avatarStyle);
  const names=[value,...readRecent().filter(item=>item!==value)].slice(0,24);
  try {localStorage.setItem(recentKey,JSON.stringify(names));}catch {/* storage quota */}
  return names;
};
const filters: Record<LibraryId,{id:string;label:string}[]> = {
  tabler:[{id:"all",label:"全部"},{id:"outline",label:"描边"},{id:"filled",label:"填充"}],
  lucide:[{id:"all",label:"全部"}],
  iconpark:[{id:"all",label:"全部"},{id:"outline",label:"描边"},{id:"filled",label:"填充"},{id:"twotone",label:"双色"}],
  phosphor:[{id:"all",label:"全部"},{id:"outline",label:"常规"},{id:"filled",label:"填充"},{id:"thin",label:"细线"},{id:"light",label:"轻线"},{id:"bold",label:"粗线"},{id:"twotone",label:"双色"}],
  carbon:[{id:"all",label:"全部"}],
  dicebear:avatarStyles.map(({id,label})=>({id,label})),
};
function Glyph({library,catalog,name,color,strokeWidth,size=29}:{library:LibraryId;catalog:IconCatalog;name:string;color:string;strokeWidth:number;size?:number}) {
  if(!catalog.icons[name])return null;
  return <img alt="" aria-hidden="true" width={size} height={size} loading="lazy" decoding="async" draggable={false}
    src={previewSrc(library,catalog,name,color,strokeWidth)} />;
}
/** Color launcher stays one compact row; its popup reuses StrokePanel's
 * complete ColorField (palette, shades, HEX and screen eyedropper). */
function IconColorControl({ color, onChange }: { color: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({left: 8, top: 8});
  const trigger = useRef<HTMLButtonElement>(null);
  const palette = useRef<HTMLDivElement>(null);
  const place = () => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const width = 194, height = 288;
    setPosition({
      left: Math.max(8, Math.min(box.left, innerWidth - width - 8)),
      top: Math.max(8, Math.min(box.bottom + 8, innerHeight - height - 8)),
    });
  };
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (palette.current?.contains(event.target as Node) ||
          trigger.current?.contains(event.target as Node) ||
          (event.target as Element)?.closest?.(".dodo-icon-color-popover")) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".dodo-icon-color-popover")) return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  return <>
    <button ref={trigger} className="dodo-icon-color-button" type="button"
      aria-label="图标颜色" aria-expanded={open} aria-haspopup="dialog"
      onClick={() => { place(); setOpen(value => !value); }}>
      <span>图标颜色</span><span className="dodo-icon-color-preview" style={{backgroundColor:color}} aria-hidden="true"/>
    </button>
    {open && createPortal(<div ref={palette} className="dodo-icon-palette-popover dt-style-panel dt-style-compact-panel"
      role="dialog" aria-label="图标颜色色卡" style={position}>
      <ColorField name="图标颜色" color={color} index={4} onChange={onChange}
        popupClassName="dodo-icon-color-popover"/>
    </div>,document.body)}
  </>;
}
function IconLibrary({api,onMountButton}:{api:any;onMountButton:(callback:()=>void)=>()=>void}) {
  const [open,setOpen]=useState(false);
  const [library,setLibrary]=useState<LibraryId>("tabler");
  const [catalogs,setCatalogs]=useState<Partial<Record<LibraryId,IconCatalog>>>({});
  const [avatarStyle,setAvatarStyle]=useState<AvatarStyleId>("open-peeps");
  const [avatarCatalogs,setAvatarCatalogs]=useState<Partial<Record<AvatarStyleId,IconCatalog>>>({});
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [style,setStyle]=useState("all");
  const [page,setPage]=useState(0);
  const [recent,setRecent]=useState<string[]>(readRecent);
  const [color,setColor]=useState("#1e1e1e");
  const [strokeWidth,setStrokeWidth]=useState(2);
  const [seed,setSeed]=useState("");
  const [pending,setPending]=useState<{library:LibraryId;name:string;avatarStyle?:AvatarStyleId}|null>(null);
  const [selected,setSelected]=useState<any>(null);
  const search=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null);
  const resultsScroll=useRef<HTMLDivElement>(null);
  const loadSentinel=useRef<HTMLDivElement>(null);
  const activeCatalog=library==="dicebear"?avatarCatalogs[avatarStyle]:catalogs[library];
  const selectedMeta=selected?.customData?.dodoIcon as IconMeta|undefined;
  const selectionId=selected?.id as string|undefined;
  const selectLibrary=(id:LibraryId)=>{setLibrary(id);setQuery("");setStyle("all");setPage(0);setError("");};
  const recentPrefix=library==="dicebear"?"dicebear:"+avatarStyle+":":library+":";
  const toggle=()=>{setOpen(prev=>!prev);setQuery("");setStyle("all");setPage(0);setPending(null);};
  useEffect(()=>onMountButton(toggle),[onMountButton]);
  useEffect(()=>{
    if(!open)return;
    let alive=true;
    const request=library==="dicebear"
      ? avatarStyle==="open-peeps"
        ? loadLibrary("dicebear")
        : avatarCatalogs[avatarStyle]
          ? Promise.resolve(avatarCatalogs[avatarStyle]!)
          : makeAvatarCatalog(avatarStyle)
      : loadLibrary(library);
    request.then(value=>{
      if(!alive)return;
      if(library==="dicebear")setAvatarCatalogs(prev=>({...prev,[avatarStyle]:prev[avatarStyle]||value}));
      else setCatalogs(prev=>({...prev,[library]:prev[library]||value}));
    }).catch(reason=>{if(alive)setError(reason instanceof Error?reason.message:String(reason));});
    const focus=window.setTimeout(()=>search.current?.focus(),30);
    return()=>{alive=false;window.clearTimeout(focus);};
  },[open,library,avatarStyle]);
  useEffect(()=>{
    const update=()=>{
      const theme=api.getAppState()?.theme||"light";
      document.querySelector<HTMLElement>(".dodo-icon-root")?.setAttribute("data-theme",theme);
      const el=selectedLibraryImage(api);
      setSelected((old:any)=>el?.id===old?.id&&el?.fileId===old?.fileId?old:el);
    };
    const off=api.onChange(update),timer=window.setInterval(update,300);update();
    return()=>{off?.();window.clearInterval(timer);};
  },[api]);
  useEffect(()=>{
    if(!open||!selectedMeta)return;
    setLibrary(selectedMeta.library);setColor(selectedMeta.color);setStrokeWidth(selectedMeta.strokeWidth);
    if(selectedMeta.library==="dicebear")setAvatarStyle(
      avatarStyles.some(item=>item.id===selectedMeta.avatarStyle)
        ? selectedMeta.avatarStyle! : "open-peeps");
    setSeed(selectedMeta.library==="dicebear"?selectedMeta.name:"");
  },[open,selectionId]);
  const names=useMemo(()=>{
    if(!activeCatalog)return[];
    const text=query.trim().toLowerCase();
    return Object.keys(activeCatalog.icons).filter(name=>
      (library==="dicebear"||style==="all"||styleOf(library,name)===style) &&
      (!text||name.toLowerCase().includes(text)||displayName(name).toLowerCase().includes(text)));
  },[activeCatalog,library,style,query]);
  const visible=names.slice(0,(page+1)*80);
  const hasMore=visible.length<names.length;
  // Observe the bottom marker inside the dialog's own scrollport.
  // Each intersection advances just one batch, with a new observer
  // attached after React renders the next 80 icons.
  useEffect(()=>{
    const root=resultsScroll.current;
    const marker=loadSentinel.current;
    if(!open||!activeCatalog||!hasMore||!root||!marker)return;
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      observer.disconnect();
      setPage(value=>value+1);
    },{root,rootMargin:"0px 0px 180px 0px",threshold:0});
    observer.observe(marker);
    return()=>observer.disconnect();
  },[open,library,style,query,page,names.length,activeCatalog,hasMore]);
  const choose=(name:string)=>{
    setRecent(remember(library,name,avatarStyle));setOpen(false);
    setPending({library,name,...(library==="dicebear"?{avatarStyle}:{})});
    api.setToast?.({message:"点击画布放置图标或头像，按 Esc 取消。",duration:2700});
  };
  const prepareSeed=async()=>{
    const value=seed.trim();if(!value){setError("请输入头像种子。");return;}
    try {
      await prepareAvatarStyle(avatarStyle);
      const next=generateAvatar(activeCatalog||{icons:{}},value,avatarStyle);
      setAvatarCatalogs(old=>({...old,[avatarStyle]:next}));
      setQuery(value);setStyle("all");setPage(0);setError("");
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  };
  const editSelected=async()=>{
    const element=selectedLibraryImage(api);
    const meta=element?.customData?.dodoIcon as IconMeta|undefined;
    if(!meta){setError("请先选中一个通过图标库插入的图标或头像。");return;}
    let catalog=meta.library==="dicebear"?avatarCatalogs[avatarStyle]:catalogs[meta.library];
    let name=meta.name;
    if(meta.library==="dicebear"){
      name=seed.trim();if(!name){setError("请输入头像种子。");return;}
      try {
        await prepareAvatarStyle(avatarStyle);
        catalog=generateAvatar(catalog||{icons:{}},name,avatarStyle);
        setAvatarCatalogs(prev=>({...prev,[avatarStyle]:catalog}));
      }catch(reason){setError(reason instanceof Error?reason.message:String(reason));return;}
    }
    if(!catalog)return;
    try{updateLibraryImage(api,catalog,element,color,strokeWidth,name,
      meta.library==="dicebear"?avatarStyle:undefined);setError("");}
    catch(reason){setError(String(reason));}
  };
  useEffect(()=>{
    if(!pending)return;
    const catalog=pending.library==="dicebear"
      ? avatarCatalogs[pending.avatarStyle||"open-peeps"] : catalogs[pending.library];
    if(!catalog)return;
    const place=(event:PointerEvent)=>{
      if(event.button!==0||!(event.target instanceof Element)||!event.target.closest('.excalidraw__canvas'))return;
      event.preventDefault();event.stopImmediatePropagation();
      try {
        insertLibraryImage(api,catalog,{library:pending.library,name:pending.name,color,strokeWidth,
          ...(pending.library==="dicebear"?{avatarStyle:pending.avatarStyle||"open-peeps"}:{})},event.clientX,event.clientY);
        api.setToast?.({message:"已插入",duration:1400});
      }catch(reason){setError(String(reason));setOpen(true);}
      setPending(null);
    };
    const cancel=(event:KeyboardEvent)=>{if(event.key==="Escape"){setPending(null);api.setToast?.(null);}};
    document.addEventListener("pointerdown",place,true);document.addEventListener("keydown",cancel,true);
    return()=>{document.removeEventListener("pointerdown",place,true);document.removeEventListener("keydown",cancel,true);};
  },[pending,catalogs,avatarCatalogs,api,color,strokeWidth]);
  useEffect(()=>{
    if(!open)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){
      if(document.querySelector('.dodo-icon-color-popover,.dodo-icon-palette-popover')) return;
      event.stopPropagation();setOpen(false);
    }};
    const outside=(event:PointerEvent)=>{if(panel.current&&!panel.current.contains(event.target as Node)&&
      !(event.target as Element).closest?.('.dodo-icon-launcher,.dodo-icon-color-popover,.dodo-icon-palette-popover'))setOpen(false);};
    document.addEventListener("keydown",escape,true);document.addEventListener("pointerdown",outside,true);
    return()=>{document.removeEventListener("keydown",escape,true);document.removeEventListener("pointerdown",outside,true);};
  },[open]);
  const tile=(name:string,prefix:string)=>activeCatalog&&<button key={prefix+name} type="button" title={displayName(name)}
    aria-label={`插入 ${displayName(name)} 图标`} onClick={()=>choose(name)}>
    <Glyph library={library} catalog={activeCatalog} name={name} color={color} strokeWidth={strokeWidth}/>
    {prefix==="all-"&&<span>{displayName(name)}</span>}</button>;
  return <>
    {pending&&<div className="dodo-icon-pending" role="status" aria-label="等待放置图标"><Shapes size={16}/>
      点击画布放置「{displayName(pending.name)}」<button type="button" onClick={()=>setPending(null)}>取消</button></div>}
    {open&&<div ref={panel} role="dialog" aria-modal="false" aria-label="插入图标" className="dodo-icon-panel"
      onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
      <div className="dodo-icon-header"><div><Shapes size={17}/><strong>插入图标</strong><small>图标与头像均可离线保存</small></div>
        <button type="button" aria-label="关闭图标库" onClick={()=>setOpen(false)}><X size={17}/></button></div>
      <div className="dodo-icon-libraries" role="tablist" aria-label="图标库">
        {libraries.map(item=><button type="button" role="tab" key={item.id} aria-selected={library===item.id}
          onClick={()=>selectLibrary(item.id)} title={item.detail}>{item.label}</button>)}
      </div>
      {library==="dicebear"?<div className="dodo-icon-avatar-seed">
        <label>头像种子 <input aria-label="头像种子" value={seed} placeholder="输入名称生成头像" maxLength={80}
          onChange={event=>setSeed(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void prepareSeed();}}/></label>
        <button type="button" onClick={()=>void prepareSeed()}><RefreshCw size={15}/>生成头像</button></div>
      : <label className="dodo-icon-search"><Search size={17}/><input ref={search} type="search" aria-label="搜索图标"
          value={query} placeholder="搜索图标名称（英文）…" onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>}
      <div className="dodo-icon-config">
        {library!=="dicebear"&&<><IconColorControl color={color} onChange={setColor}/>
          <label>线条粗细 <select aria-label="图标线条粗细" value={strokeWidth} onChange={event=>setStrokeWidth(Number(event.target.value))}>
            {[1,1.5,2,2.5,3,4].map(value=><option key={value} value={value}>{value}px</option>)}
          </select></label></>}
        {selectedMeta?.library===library&&<button type="button" className="dodo-icon-apply" onClick={()=>void editSelected()}>
          <Palette size={15}/>{library==="dicebear"?"重新生成选中头像":"应用到选中图标"}</button>}
      </div>
      <div className="dodo-icon-filter" role="group" aria-label={library==="dicebear"?"头像风格":"图标风格"}>
        {filters[library].map(item=><button type="button" key={item.id}
          aria-pressed={library==="dicebear"?avatarStyle===item.id:style===item.id}
          onClick={()=>{
            if(library==="dicebear"){
              setAvatarStyle(item.id as AvatarStyleId);setQuery("");setError("");
            }else setStyle(item.id);
            setPage(0);
          }}>{item.label}</button>)}
        <small>{names.length.toLocaleString()} 个{library==="dicebear"?"头像":"图标"}</small>
      </div>
      {error&&<div role="alert" className="dodo-icon-error">{error}</div>}
      {!activeCatalog&&!error&&<p className="dodo-icon-empty" role="status">正在加载图标库…</p>}
      {activeCatalog&&<div ref={resultsScroll} className="dodo-icon-results" key={`${library}:${style}:${query}:${avatarStyle}`}>
        {!query&&recent.some(name=>name.startsWith(recentPrefix))&&<section><h3>最近使用</h3><div className="dodo-icon-grid">
          {recent.filter(name=>name.startsWith(recentPrefix)).map(name=>name.slice(recentPrefix.length))
            .filter(name=>activeCatalog.icons[name]).slice(0,12).map(name=>tile(name,"recent-"))}</div></section>}
        {!query&&popular[library].length>0&&<section><h3>常用图标</h3><div className="dodo-icon-grid">
          {popular[library].filter(name=>activeCatalog.icons[name]).map(name=>tile(name,"popular-"))}</div></section>}
        <section><h3>{library==="dicebear"
          ?avatarStyles.find(item=>item.id===avatarStyle)?.label+" 头像":"图标库"}</h3><div className="dodo-icon-grid">
          {visible.map(name=>tile(name,"all-"))}</div>
          {hasMore&&<div ref={loadSentinel} className="dodo-icon-load-sentinel" role="status"
            aria-label="向下滚动自动加载更多图标">
            已显示 {visible.length} / {names.length} · 向下滚动自动加载
          </div>}
          {names.length===0&&<p className="dodo-icon-empty">没有找到匹配的图标</p>}
        </section>
      </div>}
      <footer>{library==="dicebear"
        ?avatarStyles.find(item=>item.id===avatarStyle)?.label+" · CC0：可通过种子生成不同头像。"
        :"选择图标后，在画布单击放置。"} 默认 96×96，可缩放与保存。</footer>
    </div>}
  </>;
}

const feature: InteractionFeature = {
  id:"iconLibrary",label:"插入图标",
  description:"Tabler、Lucide、IconPark、Phosphor、Carbon 图标和 DiceBear 五种头像风格，支持离线插入、编辑与最近使用。",
  defaultEnabled:true,
  mount(api){
    const host=document.createElement("div");host.className="dodo-icon-root";document.body.append(host);
    const iconButton=document.createElement("button");iconButton.type="button";
    iconButton.className="dodo-icon-launcher";iconButton.title="插入图标 — 8";
    iconButton.setAttribute("aria-label","插入图标");
    const launcherRoot=createRoot(iconButton);launcherRoot.render(<FaceSlightlySmilingPlus size={19} strokeWidth={1.7} aria-hidden="true"/>);
    let click:(()=>void)|null=null;
    iconButton.addEventListener("click",()=>click?.());
    const shortcut=(event:KeyboardEvent)=>{
      if(event.key!=="8"||event.repeat||event.ctrlKey||event.metaKey||event.altKey||
        event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      event.preventDefault();event.stopPropagation();click?.();
    };
    document.addEventListener("keydown",shortcut,true);
    const mountButton=(onOpen:()=>void)=>{click=onOpen;return()=>{if(click===onOpen)click=null;};};
    const attach=()=>{
      const imageInput=document.querySelector('[data-testid="toolbar-image"]');
      const target=imageInput?.closest('label')||document.querySelector('.excalidraw .App-toolbar .ToolIcon')?.parentElement;
      if(target?.parentElement&&iconButton.previousElementSibling!==target)target.insertAdjacentElement("afterend",iconButton);
    };
    const observer=new MutationObserver(attach);
    observer.observe(document.querySelector('.excalidraw')||document.body,{childList:true,subtree:true});attach();
    const root=createRoot(host);root.render(<IconLibrary api={api} onMountButton={mountButton}/>);
    return()=>{observer.disconnect();document.removeEventListener("keydown",shortcut,true);
      root.unmount();launcherRoot.unmount();iconButton.remove();host.remove();};
  },
};
export default feature;
