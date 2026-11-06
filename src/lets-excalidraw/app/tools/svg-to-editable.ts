import { newId, randomNonce } from "./scene-commands";

export function isEditableSvgImage(api:any,el:any):boolean{
  if(!el || el.isDeleted || el.locked || el.type!=="image" || !el.fileId)return false;
  const file=api.getFiles?.()?.[el.fileId];
  return !!file && (file.mimeType==="image/svg+xml" || /^data:image\/svg\+xml(?:;|,)/i.test(file.dataURL||""));
}
export async function svgImageToText(api:any,image:any):Promise<string>{
  const file=api.getFiles?.()?.[image.fileId];
  const url=file?.dataURL;
  if(!url || !/^data:image\/svg\+xml(?:;|,)/i.test(url))
    throw new Error("所选图片不是可转换的 SVG 文件。");
  if(url.length>4_000_000)throw new Error("SVG 文件过大，无法安全转换。");
  // fetch(data:) decodes both UTF-8 URI-escaped and base64-encoded payloads.
  const source=await (await fetch(url)).text();
  if(!source.trim().startsWith("<") || !/<svg[\s>]/i.test(source))
    throw new Error("SVG 源码无效。");
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source) ||
    /<\s*(?:script|foreignObject)\b/i.test(source) ||
    /\bon[a-z]+\s*=/i.test(source) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:javascript:|https?:)/i.test(source))
    throw new Error("SVG 包含脚本或外部资源，暂不支持转换。");
  return source;
}
/** SVG viewBox is the coordinate frame; element bounds alone would stretch
 * icon artwork that intentionally contains whitespace. */
function svgFrame(svg:string,elements:readonly any[]){
  const doc=new DOMParser().parseFromString(svg,"image/svg+xml");
  if(doc.querySelector("parsererror"))throw new Error("SVG XML 格式无效。");
  const root=doc.documentElement;
  if(root.localName.toLowerCase()!=="svg")throw new Error("文件缺少 SVG 根节点。");
  const vb=(root.getAttribute("viewBox")||"").trim().split(/[\s,]+/).map(Number);
  if(vb.length===4&&vb.every(Number.isFinite)&&vb[2]>0&&vb[3]>0)
    return {x:vb[0],y:vb[1],width:vb[2],height:vb[3]};
  const numeric=(text:string|null)=>{
    if(!text || !/^[+\-]?\d+(?:\.\d+)?(?:px)?$/.test(text.trim()))return NaN;
    return parseFloat(text);
  };
  const width=numeric(root.getAttribute("width")),height=numeric(root.getAttribute("height"));
  if(width>0&&height>0)return {x:0,y:0,width,height};
  const bounds=elements.map((el:any)=>{
    const points=el.points as Array<[number,number]>|undefined;
    if(Array.isArray(points)&&points.length){
      const xs=points.map(p=>el.x+p[0]),ys=points.map(p=>el.y+p[1]);
      return {x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
    }
    return {x:el.x,y:el.y,right:el.x+el.width,bottom:el.y+el.height};
  });
  const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));
  const maxX=Math.max(...bounds.map(b=>b.right)),maxY=Math.max(...bounds.map(b=>b.bottom));
  return {x,y,width:maxX-x,height:maxY-y};
}
export async function convertSvgToNative(svg:string,source:any):Promise<any[]>{
  if(source.crop)throw new Error("请先恢复 SVG 图片的裁剪，再转换为可编辑元素。");  if(!Number.isFinite(source.width)||!Number.isFinite(source.height)||
    source.width<=0||source.height<=0)throw new Error("原 SVG 图片尺寸无效。");
  if(/<\s*(?:script|foreignObject|image|text|filter|linearGradient|radialGradient|pattern)\b/i.test(svg))
    throw new Error("SVG 包含文字、位图或特殊效果，暂不支持无损转换；原图已保留。");
  // 600 kB legacy converter loads only when the user explicitly converts SVG.
  const {default:svgToEx}=await import("svg-to-excalidraw");
  const result=(svgToEx as any).convert(svg);
  if(result.hasErrors)throw new Error("SVG 解析失败，请检查文件格式。");
  const json=typeof result.content==="string"?JSON.parse(result.content):result.content;
  const elements=json?.elements||json?.data?.elements||[];
  if(!Array.isArray(elements)||!elements.length)
    throw new Error("SVG 没有可转换的矢量元素。");
  if(elements.length>2000)throw new Error("SVG 形状数量超过 2000，转换已取消。");
  const valid=elements.filter((el:any)=>el&&typeof el.x==="number"&&typeof el.y==="number"&&
    Number.isFinite(el.x)&&Number.isFinite(el.y)&&Number.isFinite(el.width)&&Number.isFinite(el.height)&&
    ["draw","line","arrow","freedraw","rectangle","ellipse","diamond"].includes(el.type));
  // Do not silently drop unsupported generated data.
  if(valid.length!==elements.length || !valid.length)
    throw new Error("SVG 中包含转换器不支持的元素，已保留原图。");
  const frame=svgFrame(svg,valid);
  if(frame.width<=0||frame.height<=0)throw new Error("SVG 的绘制范围为空。");
  const scaleX=source.width/frame.width,scaleY=source.height/frame.height;
  const mirrorX=(source.scale?.[0]??1)<0,mirrorY=(source.scale?.[1]??1)<0;
  const groupId=newId(), now=Date.now();
  const angle=Number(source.angle)||0,c=Math.cos(angle),s=Math.sin(angle);
  const centerX=source.x+source.width/2,centerY=source.y+source.height/2;
  return valid.map((el:any)=>{
    const baseX=(el.x-frame.x)*scaleX,baseY=(el.y-frame.y)*scaleY;
    const w=el.width*scaleX,h=el.height*scaleY;
    const localX=mirrorX?source.width-baseX-w:baseX;
    const localY=mirrorY?source.height-baseY-h:baseY;
    const dx=localX+w/2-source.width/2,dy=localY+h/2-source.height/2;
    const center={x:centerX+dx*c-dy*s,y:centerY+dx*s+dy*c};
    const rawPoints=(Array.isArray(el.points)?el.points:undefined) as Array<[number,number]>|undefined;
    const points=rawPoints?.map(p=>[
      p[0]*scaleX*(mirrorX?-1:1),p[1]*scaleY*(mirrorY?-1:1)] as [number,number]);
    // SVG parser's legacy 'draw' is not an Excalidraw element type.
    // Closed vector paths become native polygon lines with editable points.
    const closed=!!points&&points.length>=3&&
      Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])<1e-5;
    const out:any={...el,id:newId(),type:el.type==="draw"?"line":el.type,
      x:center.x-w/2,y:center.y-h/2,width:w,height:h,angle:(Number(el.angle)||0)+angle,
      version:1,versionNonce:randomNonce(),updated:now,isDeleted:false,locked:false,
      frameId:source.frameId||null,groupIds:[groupId,...(source.groupIds||[])],
      boundElements:null,link:null,customData:undefined,containerId:null,
      backgroundColor:el.backgroundColor==="none"?"transparent":el.backgroundColor,
      strokeColor:el.strokeColor==="none"?"transparent":el.strokeColor,
      seed:randomNonce()};
    if(points)out.points=points;
    if(out.type==="line"){
      out.polygon=closed;
      out.roundness=null;
      out.lastCommittedPoint=null;
      out.startBinding=null;
      out.endBinding=null;
      out.startArrowhead=null;
      out.endArrowhead=null;
    }
    return out;
  });
}
