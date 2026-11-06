import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { nanoid } from "nanoid";

/** Separate from the native `dodoMind` implementation: one SVG = one object. */
export type SimpleMindMapMeta = { engine: "simple-mind-map"; schemaVersion: 1; data: any };
export const getProofMeta = (element: any): SimpleMindMapMeta | null => {
  const meta = element?.type === "image" ? element.customData?.dodoSimpleMindMap : null;
  return meta?.engine === "simple-mind-map" && meta.schemaVersion === 1 && meta.data ? meta : null;
};
export const selectedProofImage = (api: any): any | null => {
  const ids = api.getAppState()?.selectedElementIds || {};
  const selected = Object.keys(ids).filter(id => ids[id]);
  if (selected.length !== 1) return null;
  const el = api.getSceneElements().find((e: any) => e.id === selected[0]);
  return getProofMeta(el) ? el : null;
};
export function svgDimensions(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const node = document.documentElement;
  if (node.nodeName === "parsererror" || node.localName !== "svg") throw new Error("SimpleMindMap 未生成有效 SVG");
  const box = (node.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const width = parseFloat(node.getAttribute("width") || "") || (box.length === 4 ? box[2] : 0);
  const height = parseFloat(node.getAttribute("height") || "") || (box.length === 4 ? box[3] : 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("SVG 缺少有效尺寸");
  }
  return {width, height};
}
function base64Svg(svg: string) {
  const utf8 = new TextEncoder().encode(svg);
  let raw = "";
  for (const byte of utf8) raw += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(raw)}`;
}
export function saveProofImage(api: any, svg: string, data: any, current: any | null): string {
  const {width:originalWidth, height:originalHeight} = svgDimensions(svg);
  const fileId = nanoid(), now = Date.now();
  api.addFiles([{ id:fileId, dataURL:base64Svg(svg), mimeType:"image/svg+xml", created:now, lastRetrieved:now }]);
  const fullData = JSON.parse(JSON.stringify(data));
  const meta:SimpleMindMapMeta = {engine:"simple-mind-map",schemaVersion:1,data:fullData};
  const elements = api.getSceneElementsIncludingDeleted();
  if (current?.id) {
    const old = elements.find((el:any)=>el.id===current.id&&!el.isDeleted);
    if (!getProofMeta(old)) throw new Error("所编辑的 SVG 已被删除或替换");
    // Keep the user-set display width and the image center. A structural
    // edit can change the SVG aspect ratio, so keeping both dimensions would
    // stretch the diagram (e.g. mindMap -> organizationStructure).
    const nextHeight = old.width * originalHeight / originalWidth;
    const next = elements.map((el:any)=>el.id === old.id ? {
      ...el,fileId,status:"saved",height:nextHeight,y:old.y+(old.height-nextHeight)/2,
      customData:{...el.customData,dodoSimpleMindMap:meta},
      version:el.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:now,
    }:el);
    api.updateScene({elements:next,appState:{selectedElementIds:{[old.id]:true}},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
    return old.id;
  }
  const state=api.getAppState();
  // Initial insertion is near the visible viewport center; never add 1000s of native nodes.
  const root=document.querySelector(".excalidraw")?.getBoundingClientRect();
  const zoom=state.zoom?.value||1;
  const width=Math.min(560,Math.max(220,originalWidth));
  const height=width*originalHeight/originalWidth;
  const x=((root?.width||900)/2)/zoom-(state.scrollX||0)-width/2;
  const y=((root?.height||600)/2)/zoom-(state.scrollY||0)-height/2;
  const id=nanoid();
  const element={
    id,type:"image",x,y,width,height,angle:0,
    strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",
    strokeWidth:1,strokeStyle:"solid",roughness:0,opacity:100,
    groupIds:[],frameId:null,roundness:null,seed:Math.floor(Math.random()*2147483647),
    version:1,versionNonce:Math.floor(Math.random()*2147483647),updated:now,
    isDeleted:false,boundElements:null,link:null,locked:false,
    fileId,status:"saved",scale:[1,1],crop:null,
    customData:{dodoSimpleMindMap:meta}
  };
  api.updateScene({elements:[...elements,element],
    appState:{selectedElementIds:{[id]:true},activeTool:{type:"selection"}},
    captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  return id;
}
