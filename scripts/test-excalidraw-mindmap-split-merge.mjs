import assert from "node:assert/strict";
import { build } from "esbuild";
const load = async entry => {
  const stub = {name:"excalidraw-test-stub",setup(b){
    b.onResolve({filter:/^@excalidraw\/excalidraw$/},()=>({path:"mock",namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:
      "export const CaptureUpdateAction={IMMEDIATELY:1,NEVER:0}; export const convertToExcalidrawElements=()=>[];",loader:"js"}));
  }};
  const out = await build({entryPoints:[entry],bundle:true,format:"esm",
    write:false,platform:"node",logLevel:"silent",plugins:[stub]});
  return import("data:text/javascript;base64,"+Buffer.from(out.outputFiles[0].text).toString("base64"));
};
const {distanceToOriginalTree,isDetachmentCandidate,resolveMindMerge,patchMindSplit,patchMindMerge}
  = await load("src/lets-excalidraw/app/mindmap/split-merge.ts");
const {mindData,rootFor,descendantsOf} = await load("src/lets-excalidraw/app/mindmap/model.ts");
const {isMindConnector,protectMindConnectors}=await load("src/lets-excalidraw/app/mindmap/connector-protection.ts");
const node=(id,mapId,parentId,x,y,order=0,extra={})=>({
  id,type:"rectangle",x,y,width:160,height:54,version:1,versionNonce:1,updated:1,
  isDeleted:false,locked:false,containerId:null,boundElements:null,
  customData:{dodoMind:{mapId,parentId,order,side:"right",...extra}}
});
const edge=(id,mapId,parentId,childId)=>({
  id,type:"arrow",version:1,versionNonce:1,isDeleted:false,
  x:0,y:0,width:100,height:0,points:[[0,0],[100,0]],opacity:76,
  startBinding:{elementId:parentId},endBinding:{elementId:childId},
  customData:{dodoMindEdge:{mapId,parentId,childId}}
});
const withRefs=(els)=> {
  const edges=els.filter(el=>el.type==="arrow");
  return els.map(el=>{
    if(el.type==="arrow")return el;
    const refs=edges.filter(a=>a.startBinding.elementId===el.id||a.endBinding.elementId===el.id);
    return {...el,boundElements:refs.length?refs.map(e=>({id:e.id,type:"arrow"})):null};
  });
};
const hidden=node("hidden","A","grand",900,180);
const hiddenEdge=edge("hidden-edge","A","grand","hidden");
const rootA=node("root-a","A",null,100,160,0,{direction:"right",branchStyle:"curve"});
const a=node("a","A","root-a",380,160);
const grand=node("grand","A","a",650,160,0,{collapsedElements:[hidden,hiddenEdge]});
const sibling=node("sibling","A","root-a",380,280,1);
const rootB=node("root-b","B",null,1400,160,0,{direction:"both",branchStyle:"elbow"});
const target=node("target","B","root-b",1660,160);
const source=withRefs([rootA,a,grand,sibling,rootB,target,
  edge("incoming","A","root-a","a"),edge("inner","A","a","grand"),
  edge("sibling-edge","A","root-a","sibling"),edge("target-edge","B","root-b","target")]);
const at=(els,id)=>els.find(el=>el.id===id);
const plainArrow={id:"user-arrow",type:"arrow",isDeleted:false,locked:false};
const originalEdges=[...source,plainArrow];
assert.equal(isMindConnector(plainArrow),false);
assert.equal(isMindConnector(at(source,"inner")),true);
const protectedEdges=protectMindConnectors(originalEdges);
assert.ok(protectedEdges.filter(el=>el.customData?.dodoMindEdge).every(el=>el.locked));
assert.strictEqual(at(protectedEdges,"user-arrow"),plainArrow,
  "normal Excalidraw arrows must remain fully editable");
assert.strictEqual(protectMindConnectors(protectedEdges),protectedEdges,
  "re-applying the lock should not mutate scene versions");
assert.equal(at(protectedEdges,"inner").id,at(source,"inner").id);
assert.deepEqual(at(protectedEdges,"inner").points,at(source,"inner").points);

assert.equal(distanceToOriginalTree(source,"a"),66);
assert.equal(distanceToOriginalTree(source,"root-a"),Infinity);
assert.equal(isDetachmentCandidate(120,222,151),true);
assert.equal(isDetachmentCandidate(120,219,151),false);
assert.equal(isDetachmentCandidate(120,190,100,true),true);
assert.equal(isDetachmentCandidate(120,190,70,true),false);
const moved=source.map(el=>el.id==="a"?{...el,x:850}:el);
assert.ok(distanceToOriginalTree(moved,"a")>=120,"distance excludes moving descendants");
assert.equal(resolveMindMerge(source,"root-a",{...rootA,x:1670,y:162},1)?.id,"target");
assert.equal(resolveMindMerge(source,"a",{...a,x:1670,y:162},1)?.id,"target");
// Both grips leave the cursor outside target while the node overlaps it.
for (const leftOrRight of [1540,1780]) {
  const rect={...a,x:leftOrRight,y:160};
  assert.equal(resolveMindMerge(source,"a",rect,1)?.id,"target",
    "cross-map matching must use moved rectangle, not pointer");
}

assert.equal(resolveMindMerge(source,"root-a",{...rootA,x:1850,y:400},1),null);
assert.equal(resolveMindMerge(source,"a",{...a,x:400,y:180},1),null,"same tree cannot merge");
const split=patchMindSplit(source,"a","split-001");
assert.ok(split);
assert.equal(mindData(at(split,"a")).parentId,null);
assert.equal(rootFor(split,"grand").id,"a");
assert.equal(mindData(at(split,"grand")).mapId,"split-001");
assert.equal(mindData(at(split,"sibling")).mapId,"A");
assert.equal(at(split,"incoming").isDeleted,true);
assert.ok(!(at(split,"root-a").boundElements||[]).some(ref=>ref.id==="incoming"));
assert.ok(!(at(split,"a").boundElements||[]).some(ref=>ref.id==="incoming"));
assert.equal(at(split,"inner").customData.dodoMindEdge.mapId,"split-001");
assert.equal(mindData(at(split,"grand")).collapsedElements[0].customData.dodoMind.mapId,"split-001");
assert.equal(mindData(at(split,"grand")).collapsedElements[1].customData.dodoMindEdge.mapId,"split-001");
assert.equal(at(split,"a").x,380,"new independent root must not jump");
assert.equal(patchMindSplit(source,"root-a","split-002"),null);
const merged=patchMindMerge(split,"a","target",{});
assert.ok(merged);
assert.equal(mindData(at(merged,"a")).mapId,"B");
assert.equal(mindData(at(merged,"a")).parentId,"target");
assert.equal(mindData(at(merged,"grand")).mapId,"B");
assert.equal(mindData(at(merged,"grand")).collapsedElements[0].customData.dodoMind.mapId,"B");
assert.equal(rootFor(merged,"grand").id,"root-b");
assert.equal(descendantsOf(merged,"target").some(n=>n.id==="grand"),true);
const newEdge=merged.filter(el=>!el.isDeleted&&el.type==="arrow"&&el.customData?.dodoMindEdge?.childId==="a");
assert.equal(newEdge.length,1,"reparented root must have one incoming arrow");
assert.equal(newEdge[0].startBinding.elementId,"target");
assert.equal(newEdge[0].customData.dodoMindEdge.mapId,"B");
assert.equal(newEdge[0].endBinding.elementId,"a");
assert.equal(newEdge[0].locked,true,"new merge connectors are inherently nonselectable");
assert.equal(at(merged,"inner").customData.dodoMindEdge.mapId,"B");
assert.equal(mindData(at(merged,"a")).branchStyle,undefined,"former root loses root-only style");
assert.equal(patchMindMerge(source,"a","sibling"),null,"cannot merge inside own tree");
assert.equal(patchMindMerge(source,"root-a","a"),null,"cannot merge own child");
const branch=patchMindMerge(source,"a","target",{});
assert.ok(branch);
assert.equal(at(branch,"incoming").isDeleted,false,"existing incoming edge is reused");
assert.equal(at(branch,"incoming").startBinding.elementId,"target");
assert.equal(at(branch,"incoming").locked,true,"reused old edges are locked on merge");
assert.equal(at(branch,"incoming").customData.dodoMindEdge.mapId,"B");
assert.ok(!(at(branch,"root-a").boundElements||[]).some(ref=>ref.id==="incoming"));
assert.ok((at(branch,"target").boundElements||[]).some(ref=>ref.id==="incoming"));
assert.equal(mindData(at(branch,"grand")).mapId,"B");
assert.equal(mindData(at(branch,"sibling")).parentId,"root-a");
assert.equal(mindData(at(branch,"sibling")).order,0);
console.log("PASS: nonselectable generated connectors, legacy auto-lock, untouched ordinary arrows; edge-distance hysteresis, root/branch cross-map hover, split with archived descendants, root merge and direct branch merge, connector reuse, map IDs, and tree integrity");


