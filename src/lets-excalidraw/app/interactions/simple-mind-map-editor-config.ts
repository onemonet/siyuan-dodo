/** SVG-based SimpleMindMap editor choices; styles live in the engine, not Excalidraw elements. */
export const mindLayouts = [
  {id:"logicalStructure",name:"向右逻辑",group:"逻辑"},
  {id:"logicalStructureLeft",name:"向左逻辑",group:"逻辑"},
  {id:"mindMap",name:"双向思维导图",group:"逻辑"},
  {id:"organizationStructure",name:"组织结构",group:"结构"},
  {id:"catalogOrganization",name:"目录结构",group:"结构"},
  {id:"timeline",name:"横向时间轴",group:"时间轴"},
  {id:"verticalTimeline",name:"纵向时间轴",group:"时间轴"},
  {id:"fishbone",name:"鱼骨图",group:"结构"},
] as const;
export const nodeShapes = [
  {id:"rectangle",name:"矩形"},
  {id:"roundedRectangle",name:"圆角矩形"},
  {id:"ellipse",name:"椭圆"},
  {id:"diamond",name:"菱形"},
] as const;
export type ThemeName="business"|"indigo"|"forest"|"coral"|"mono";
export const mindThemes:readonly {id:ThemeName;name:string;root:string;branch:string;line:string;paper:string}[]=[
  {id:"business",name:"商务蓝",root:"#173a5e",branch:"#e9f1fb",line:"#537aab",paper:"#ffffff"},
  {id:"indigo",name:"紫罗兰",root:"#6758cf",branch:"#eeebff",line:"#9a8cec",paper:"#ffffff"},
  {id:"forest",name:"森林绿",root:"#176b53",branch:"#e1f5e8",line:"#65ad8a",paper:"#ffffff"},
  {id:"coral",name:"暖珊瑚",root:"#e06447",branch:"#fff1e9",line:"#e6a18e",paper:"#fffefc"},
  {id:"mono",name:"极简灰",root:"#282b32",branch:"#f0f1f3",line:"#9096a2",paper:"#ffffff"},
];
export type Density="compact"|"comfortable";
export function applyMindTheme(map:any,id:ThemeName,density:Density="comfortable"){
  const choice=mindThemes.find(theme=>theme.id===id)||mindThemes[0];
  const compact=density==="compact";
  const previous=map.getCustomThemeConfig?.()||{};
  // Keep user settings not owned by a theme; override only our visual surface.
  const config={...previous,backgroundColor:choice.paper,lineColor:choice.line,
    lineStyle:"curve",lineWidth:2,paddingX:compact?10:14,paddingY:compact?5:7,
    root:{...previous.root,shape:"roundedRectangle",fillColor:choice.root,color:"#ffffff",
      borderColor:choice.root,borderRadius:9,fontWeight:"bold",fontSize:20},
    second:{...previous.second,shape:"roundedRectangle",fillColor:choice.branch,
      color:"#232d3f",borderColor:choice.line,borderWidth:1,borderRadius:7,
      marginX:compact?48:74,marginY:compact?18:35},
    node:{...previous.node,shape:"roundedRectangle",fillColor:"#ffffff",color:"#303744",
      borderColor:choice.line,borderWidth:1,borderRadius:6,
      marginX:compact?28:46,marginY:compact?8:18}};
  map.setThemeConfig(config);
}
export function applyMindDensity(map:any,density:Density){
  const compact=density==="compact";
  const previous=map.getCustomThemeConfig?.()||{};
  map.setThemeConfig({...previous,
    paddingX:compact?10:14,paddingY:compact?5:7,
    second:{...previous.second,marginX:compact?48:74,marginY:compact?18:35},
    node:{...previous.node,marginX:compact?28:46,marginY:compact?8:18}});
}
