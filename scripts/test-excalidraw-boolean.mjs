import assert from "node:assert/strict";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { SquareStack, SquaresIntersect, SquaresSubtract, SquaresUnite } from "lucide-react";
await build({entryPoints:["src/lets-excalidraw/app/tools/boolean.tsx"],bundle:true,
  write:true,outfile:"tmp/test-boolean-action-bundle.mjs",platform:"node",format:"esm",logLevel:"silent",
  external:["react","lucide-react"],plugins:[{name:"mock-excalidraw",setup(b){
    b.onResolve({filter:/^@excalidraw\/excalidraw$/},()=>({path:"mock",namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"},()=>({loader:"js",
      contents:'export const CaptureUpdateAction={IMMEDIATELY:"IMMEDIATELY",NEVER:"NEVER"};'}));
  }}]});
const {default:tool,applyBoolean,SquaresXorIcon}=await import("../tmp/test-boolean-action-bundle.mjs");
const expectedIcons=[
  ["boolean-union",SquaresUnite],
  ["boolean-difference",SquaresSubtract],
  ["boolean-intersection",SquaresIntersect],
  ["boolean-xor",SquaresXorIcon],
  ["boolean-split",SquareStack],
];
assert.equal(tool.icon.type,SquaresUnite,"boolean entry uses squares-unite");
for(const [id,icon] of expectedIcons){
  const command=tool.items.find(item=>item.id===id);
  assert(command, "missing Boolean command: "+id);
  assert.equal(command.icon.type,icon,id+" uses its requested icon");
}
const xorSvg=renderToStaticMarkup(tool.items.find(item=>item.id==="boolean-xor").icon);
assert.match(xorSvg,/<svg[^>]+viewBox="0 0 24 24"/);
assert.match(xorSvg,/lucide-squares-xor/);
assert.equal((xorSvg.match(/<path /g)||[]).length,3,"XOR has two solid outline paths and one curved overlap");
assert.match(xorSvg,/c1-1\.3 2\.5-2/,"XOR center overlap is a cubic Bézier curve");
assert.doesNotMatch(xorSvg,/dasharray|stroke-dash/,"XOR outline must not be dashed");
console.log("PASS: Boolean entry and five action icons; custom XOR SVG has solid outlines and curved center");
const supported=(id,x,y,w=100,h=100,extra={})=>({
  id,type:"rectangle",x,y,width:w,height:h,angle:0,
  isDeleted:false,locked:false,roundness:null,backgroundColor:"#dddddd",strokeColor:"#333333",
  strokeWidth:2,strokeStyle:"solid",fillStyle:"solid",roughness:0,opacity:83,
  boundElements:null,groupIds:[],version:1,...extra
});
const initial=[supported("a",0,0),supported("b",50,0)];
assert.equal(tool.id,"boolean");assert.equal(tool.items.length,5);
assert.equal(tool.when({elements:[initial[0]]}),false);
assert.equal(tool.when({elements:initial}),true);
const area=(el)=>{
  const pts=el.points||[];
  return Math.abs(pts.reduce((n,p,i)=>{const q=pts[(i+1)%pts.length];return n+p[0]*q[1]-p[1]*q[0];},0))/2;
};
for(const [operation,expectedArea,expectedCount] of [
  ["union",15000,1],["difference",5000,1],["intersection",5000,1],
  ["xor",10000,2],["split",15000,3]]){
  let current=[...initial],payload=null;
  const ctx={api:{
    getSceneElementsIncludingDeleted:()=>current,
    updateScene:p=>{payload=p;current=p.elements;}
  },elements:initial,appState:{selectedElementIds:{a:true,b:true}}};
  assert.equal(applyBoolean(ctx,operation),true,operation);
  assert.equal(payload.captureUpdate,"IMMEDIATELY");
  assert.equal(current.filter(x=>x.isDeleted).length,2);
  const polygons=current.filter(x=>!x.isDeleted);
  assert.equal(polygons.length,expectedCount,operation);
  assert.equal(Math.round(polygons.reduce((n,el)=>n+area(el),0)),expectedArea,operation);
  assert(polygons.every(el=>el.type==="line"&&el.polygon===true));
  assert(polygons.every(el=>payload.appState.selectedElementIds[el.id]));
}
const enclosed=[supported("a",0,0,200,200),supported("b",60,60,80,80)];
let scene=[...enclosed]; let payload=null;
assert(applyBoolean({elements:enclosed,appState:{selectedElementIds:{a:true,b:true}},
  api:{getSceneElementsIncludingDeleted:()=>scene,updateScene:p=>{payload=p;scene=p.elements;}}},"difference"));
assert(scene.some(el=>el.groupIds?.some(id=>id.startsWith("ShadowCloneOf-"))),
  "closed interior difference should retain hole background shadow layer");
const locked=supported("locked",0,0,100,100,{locked:true});
assert.equal(tool.when({elements:[enclosed[0],locked]}),false);
const mind=supported("mind",0,0,100,100,{customData:{dodoMind:{mapId:"x"}}});
assert.equal(tool.when({elements:[enclosed[0],mind]}),false);
console.log("PASS: five ops exact areas and region counts, hole background, one-step commit, selection, protected mind elements");

