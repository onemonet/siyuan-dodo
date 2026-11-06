import assert from "node:assert/strict";
import { build } from "esbuild";

await build({
  entryPoints: [
    "src/lets-database-view/custom/storage.ts",
    "src/lets-database-view/custom/app-management.ts",
  ],
  outdir:"tmp/custom-lifecycle", bundle:true,format:"esm",platform:"node",
  outExtension:{".js":".mjs"},logLevel:"silent",
  plugins:[{name:"mock-config-api",setup(builder){
    builder.onResolve({filter:/^\.\.\/api$/},args=>({path:args.path,namespace:"test-config-api"}));
    builder.onLoad({filter:/.*/,namespace:"test-config-api"},()=>({loader:"js",
      contents:`export async function getBlockAttrs(id){return globalThis.__getBlockAttrs(id)}
        export async function setBlockAttrs(id,attrs){return globalThis.__setBlockAttrs(id,attrs)}`}));
  }}],
});
const storage=await import("../tmp/custom-lifecycle/storage.mjs");
const manager=await import("../tmp/custom-lifecycle/app-management.mjs");
const prefix="/data/storage/petal/siyuan-dodo";
const preferencesPath=prefix+"/custom-views/preferences.json";
const files=new Map([[prefix+"/keep-me.txt","unrelated content"]]);
const dirs=new Set(["/data","/data/storage","/data/storage/petal",prefix]);
const refs=new Map();
globalThis.__getBlockAttrs=async id=>({"custom-dodo-views":refs.get(id)||""});
globalThis.__setBlockAttrs=async(id,attrs)=>{refs.set(id,attrs["custom-dodo-views"]);};
let sqlUnavailable=false,operations=[];
let preferenceReads=0;
const result=(data,code=0,msg="")=>new Response(JSON.stringify({code,msg,data}),{status:200});
const fail=(message="not found")=>new Response(JSON.stringify({code:404,msg:message}),{status:404});
const contents=(path)=>files.get(path);
function entries(path){
  if(!dirs.has(path))return null;
  const names=new Set();
  for(const full of [...dirs,...files.keys()]){
    if(!full.startsWith(path+"/"))continue;
    const relative=full.slice(path.length+1);
    const name=relative.split("/")[0];
    if(name)names.add(name);
  }
  return [...names].sort().map(name=>{
    const full=path+"/"+name;
    return {name,isDir:dirs.has(full),size:files.has(full)?new TextEncoder().encode(files.get(full)).length:0};
  });
}
function moveDirectory(path,to){
  for(const dir of [...dirs])if(dir===path || dir.startsWith(path+"/")){
    dirs.delete(dir);dirs.add(to+dir.slice(path.length));
  }
  for(const [file,body] of [...files])if(file===path || file.startsWith(path+"/")){
    files.delete(file);files.set(to+file.slice(path.length),body);
  }
}
globalThis.fetch=async(url,options={})=>{
  if(url==="/api/file/putFile"){
    const path=options.body.get("path");
    if(options.body.get("isDir")==="true")dirs.add(path);
    else files.set(path,await options.body.get("file").text());
    return result(null);
  }
  const arg=JSON.parse(options.body);
  if(url==="/api/file/getFile"){
    if(arg.path===preferencesPath)preferenceReads++;
    return files.has(arg.path)
    ?new Response(files.get(arg.path),{status:200})
    : arg.path===preferencesPath
      ?new Response(JSON.stringify({code:404,msg:"file does not exist"}),{status:200})
      :fail();
  }
  if(url==="/api/file/readDir"){
    const data=entries(arg.path);
    return data===null?fail():result(data);
  }
  if(url==="/api/file/removeFile"){
    operations.push(["remove",arg.path]);
    if(files.delete(arg.path))return result(null);
    if(!dirs.has(arg.path))return fail();
    for(const file of [...files.keys()])if(file.startsWith(arg.path+"/"))files.delete(file);
    for(const dir of [...dirs])if(dir===arg.path || dir.startsWith(arg.path+"/"))dirs.delete(dir);
    return result(null);
  }
  if(url==="/api/file/renameFile"){
    operations.push(["rename",arg.path,arg.newPath]);
    if(!dirs.has(arg.path) || dirs.has(arg.newPath))return fail("invalid rename");
    moveDirectory(arg.path,arg.newPath);
    return result(null);
  }
  if(url==="/api/query/sql"){
    if(sqlUnavailable)return result(null,500,"query unavailable");
    assert.match(arg.stmt,/FROM attributes WHERE name = 'custom-dodo-views'/);
    const limit=Number(arg.stmt.match(/LIMIT (\d+)/)?.[1]||500);
    const offset=Number(arg.stmt.match(/OFFSET (\d+)/)?.[1]||0);
    return result([...refs.entries()].sort().slice(offset,offset+limit)
      .map(([block_id,value])=>({block_id,value})));
  }
  if(url==="/api/attr/getBlockAttrs"){
    return result({"custom-dodo-views":refs.get(arg.id) || ""});
  }
  if(url==="/api/attr/setBlockAttrs"){
    refs.set(arg.id,arg.attrs["custom-dodo-views"]);
    return result(null);
  }
  throw new Error("Unexpected endpoint "+url);
};

const first=await storage.createCustomApp();
const firstId=first.manifest.id;
const original=first.html;
assert.equal(await storage.getCustomHistoryLimit(),20);
assert.equal(preferenceReads,0,
  "First-run missing preferences.json should not be read as a broken file");
files.set(preferencesPath,JSON.stringify({historyLimit:10}));
assert.equal(await storage.getCustomHistoryLimit(),10);
files.set(preferencesPath,'{"historyLimit":"invalid"}');
await assert.rejects(()=>storage.getCustomHistoryLimit(),/版本保留设置损坏/);
files.set(preferencesPath,JSON.stringify({code:401,msg:"Auth failed [session]"}));
await assert.rejects(()=>storage.getCustomHistoryLimit(),/无法读取版本保留设置：Auth failed/);
files.set(preferencesPath,JSON.stringify({code:404,msg:"missing"}));
assert.equal(await storage.getCustomHistoryLimit(),20,
  "SiYuan may respond HTTP 200 with kernel 404 JSON");
files.delete(preferencesPath);
assert.equal(await storage.getCustomHistoryLimit(),20);
const v2=await storage.saveCustomApp(firstId,original+"\n<!--2-->",1);
assert.equal(v2.version,2);
const firstSnapshot=(await storage.listCustomVersions(firstId))[0];
await storage.pinCustomVersion(firstId,firstSnapshot,true);
for(let i=3;i<=27;i++){
  await storage.saveCustomApp(firstId,original+ "\n<!--"+i+"-->",i-1);
}
const retained=await storage.listCustomVersions(firstId);
assert.equal(retained.length,21,"20 newest unpinned plus pinned snapshot");
assert(retained.includes(firstSnapshot),"Pinned snapshot must survive automated cleanup");
assert.equal((await storage.getCustomApp(firstId)).manifest.version,27);
assert.equal((await storage.getCustomApp(firstId)).html,original+"\n<!--27-->");
assert(!retained.some(item=>item.startsWith("v2-")),"Old unpinned snapshots should be removed");
assert(retained[0].startsWith("v26-"),"Snapshots must be numerically sorted");
await assert.rejects(()=>storage.pinCustomVersion(firstId,"../x.html",true),/不允许/);
await storage.setCustomHistoryLimit(5);
assert.equal(await storage.getCustomHistoryLimit(),5);
assert.equal(await storage.pruneCustomAppVersions(firstId),15);
assert.equal((await storage.listCustomVersions(firstId)).length,6);
await storage.pinCustomVersion(firstId,firstSnapshot,false);
assert.equal(await storage.pruneCustomAppVersions(firstId),1);
assert.equal((await storage.listCustomVersions(firstId)).length,5);
assert.equal((await storage.getCustomApp(firstId)).html,original+"\n<!--27-->");

const second=await storage.createCustomApp();
const third=await storage.createCustomApp();
const block=(n)=>"20261104000000-"+n.repeat(7);
const view=(n)=>"20261104000001-"+n.repeat(7);
const config=views=>JSON.stringify({schemaVersion:1,views});
refs.set(block("a"),config({[view("a")]:{mode:"custom",configs:{
  custom:{appId:second.manifest.id,allowWrites:false}}}}));
refs.set(block("b"),config({[view("b")]:{mode:"table",configs:{
  custom:{appId:third.manifest.id,allowWrites:false}}}}));
let scan=await manager.scanCustomAppReferences();
assert.equal(scan.byApp[second.manifest.id][0].mode,"custom");
assert.equal(scan.byApp[third.manifest.id][0].mode,"table");
assert.equal(scan.byApp[firstId],undefined);
assert.equal((await storage.listCustomApps()).length,3);
const summary=(await storage.listCustomApps()).find(item=>item.appId===firstId);
assert.equal(summary.versions,5);
assert(summary.sizeComplete);
await assert.rejects(()=>manager.moveUnusedCustomAppToTrash(second.manifest.id),/引用/);
await assert.rejects(()=>manager.moveUnusedCustomAppToTrash(third.manifest.id),/引用/);
await assert.rejects(()=>manager.detachInactiveCustomAppReferences(second.manifest.id),/仍在使用/);
assert.equal(await manager.detachInactiveCustomAppReferences(third.manifest.id),1);
scan=await manager.scanCustomAppReferences();
assert.equal(scan.byApp[third.manifest.id],undefined);
assert.equal(scan.byApp[second.manifest.id].length,1);

// A query failure must fail closed rather than silently classifying all apps as unused.
sqlUnavailable=true;
await assert.rejects(()=>manager.moveUnusedCustomAppToTrash(firstId),/query unavailable/);
sqlUnavailable=false;
const oldHtml=(await storage.getCustomApp(third.manifest.id)).html;
await manager.moveUnusedCustomAppToTrash(third.manifest.id);
assert.equal((await storage.listCustomApps()).length,2);
assert.equal((await storage.listCustomApps("trash")).length,1);
await manager.restoreCustomAppFromTrash(third.manifest.id);
assert.equal((await storage.getCustomApp(third.manifest.id)).html,oldHtml);
await manager.moveUnusedCustomAppToTrash(third.manifest.id);
refs.set(block("c"),config({[view("c")]:{mode:"table",configs:{custom:{appId:third.manifest.id}}}}));
await assert.rejects(()=>manager.purgeCustomAppFromTrash(third.manifest.id),/仍引用/);
refs.delete(block("c"));
await manager.purgeCustomAppFromTrash(third.manifest.id);
assert.equal((await storage.listCustomApps("trash")).length,0);
assert.equal(files.get(prefix+"/keep-me.txt"),"unrelated content");
assert(!operations.some(([kind,path])=>kind==="remove" && path===storage.CUSTOM_VIEW_ROOT),
  "Never delete the entire app root");
console.log("PASS: missing/valid/damaged/HTTP200-kernel-404 preferences, 20-snapshot auto-prune, pin/restore, 5-limit, SQL-only orphan check, inactive detach, recycle/restore/purge, fail-closed safety");
