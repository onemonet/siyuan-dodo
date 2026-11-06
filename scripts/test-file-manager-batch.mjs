import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ts=createRequire(import.meta.url)("typescript");
const src=readFileSync("src/lets-file-manager/batch-compression.ts","utf8");
const code=ts.transpileModule(src,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const api={};
vm.runInNewContext(code,{
  exports:api,Math,Number,Set,Array,Promise,Error,
  require(name){
    assert.equal(name,"./image-compression");
    return {supportsImageCompression:(n)=>/\.(png|jpe?g|webp|avif)$/i.test(n)};
  },
},{filename:"batch-compression.cjs"});

const sources=[
  {path:"assets/a.png",name:"a.png"},
  {path:"assets/b.jpg",name:"b.jpg"},
  {path:"assets/c.png",name:"c.png"},
  {path:"assets/d.webp",name:"d.webp"},
  {path:"assets/e.jpg",name:"e.jpg"},
];
let maxActive=0, active=0;
const statuses=new Map(sources.map(x=>[x.path,{...x,status:"pending",checked:false}]));
const events=[];
async function encoder(path){
  active++;maxActive=Math.max(active,maxActive);
  await Promise.resolve();
  await Promise.resolve();
  active--;
  const size=path.endsWith("a.png")?200:
    path.endsWith("b.jpg")?1200:
    path.endsWith("c.png")?100:
    path.endsWith("d.webp")?300:
    220;
  if(path.endsWith("e.jpg"))throw Error("decode unsupported");
  return {blob:new Blob([new Uint8Array(size)]),originalSize:1000,
    width:100,height:100,originalWidth:200,originalHeight:200};
}
await api.prepareCompressionBatch(sources,{format:"webp",quality:.8,maxEdge:0},
  (path,patch)=>{
    statuses.set(path,{...statuses.get(path),...patch});
    events.push({path,...patch});
  },encoder);
assert.equal(maxActive,2,"encoder should process at most 2 images concurrently");
assert.equal(statuses.get("assets/a.png").checked,true,"profitable result checked by default");
assert.equal(statuses.get("assets/b.jpg").status,"larger","worse output unselected");
assert.equal(statuses.get("assets/b.jpg").checked,false);
assert.equal(statuses.get("assets/e.jpg").status,"error","per-image errors must not block other images");
assert.equal(statuses.get("assets/d.webp").status,"ready");
const records=sources.map(x=>statuses.get(x.path));
assert.equal(api.selectedBatchRecords(records).length,3);
records[0]={...records[0],checked:false};
assert.equal(api.selectedBatchRecords(records).length,2,"unchecked output excluded from upload plan");
const summary=api.batchCompressionSummary(records);
assert.equal(summary.eligible,3);
assert.equal(summary.selected,2);
assert.equal(summary.discarded,1);
assert.equal(summary.failed,2);
assert.equal(summary.savedBytes,(1000-100)+(1000-300));

let prepared=0,uploaded=0;
const fakeSave=async()=>{uploaded++;};
for (const row of api.selectedBatchRecords(records)) {
  prepared++;
  await fakeSave(row.preview);
}
assert.equal(uploaded,2,"only checked, profitable output should be saved");
assert.equal(prepared,2);
const upToLimit=Array.from({length:api.MAX_COMPRESSION_BATCH+1},(_,i)=>({path:"asset"+i+".png",name:"image.png"}));
await assert.rejects(api.prepareCompressionBatch(upToLimit,{format:"webp",quality:.8,maxEdge:0},()=>{},encoder),/最多/);
await assert.rejects(api.prepareCompressionBatch([sources[0],sources[0]],{format:"webp",quality:.8,maxEdge:0},()=>{},encoder),/重复/);
await assert.rejects(api.prepareCompressionBatch([{path:"a.gif",name:"a.gif"}],{format:"webp",quality:.8,maxEdge:0},()=>{},encoder),/不支持/);
const memory=new Map(sources.slice(0,2).map(x=>[x.path,{...x,status:"pending",checked:false}]));
await api.prepareCompressionBatch(sources.slice(0,2),{format:"webp",quality:.8,maxEdge:0},
  (p,patch)=>memory.set(p,{...memory.get(p),...patch}),async()=>{
    return {blob:new Blob([new Uint8Array(800)]),originalSize:1000};
  },900);
assert.equal(memory.get("assets/a.png").status,"ready");
assert.equal(memory.get("assets/b.jpg").status,"error","in-memory result cap enforced");
assert.equal(memory.get("assets/b.jpg").checked,false);
const ui=readFileSync("src/lets-file-manager/FileManagerPage.svelte","utf8");
assert.ok(ui.includes('compressionStage === "review"') && ui.includes('confirm("确认替换 "'),"user confirmation mandatory before writes");
assert.ok(ui.includes('for (const item of picked)') && ui.includes('"relink-delete"'),"selected results alone reach safe native migration");
assert.ok(ui.includes('URL.revokeObjectURL('),"temporary preview URLs released on close");
assert.ok(!ui.includes('saveCompressedImage()'),"old immediate single-preview commit removed");
console.log("PASS: batch two-worker concurrency, default selection, no upload on uncheck, failed/large-image protection, memory bounds, confirmed safe commits");
