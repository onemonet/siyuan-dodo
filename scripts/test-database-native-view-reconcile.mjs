import assert from "node:assert/strict";
import { build } from "esbuild";

const blockId = "20261104191000-aaaaaaa";
const avID = "20261104191000-bbbbbbb";
const kept = "20261104191000-ccccccc";
const removed = "20261104191000-ddddddd";
const another = "20261104191000-eeeeeee";
const appId = "app-f34086b0-4cd1-4039-8720-71154e50d5cb";

await build({
  entryPoints:["src/lets-database-view/core/native-view-reconcile.ts"],
  outfile:"tmp/test-native-view-reconcile.mjs",
  bundle:true,platform:"node",format:"esm",logLevel:"silent",
  plugins:[{name:"test-native-view",setup(builder){
    builder.onResolve({filter:/^\.\.\/view-config-store$|^\.\/view-host$|^\.\.\/\.\.\/shared\/av\/kernel-api$/},
      args=>({path:args.path,namespace:"stub"}));
    builder.onLoad({filter:/.*/,namespace:"stub"},args=>{
      if (args.path === "../view-config-store") return {loader:"js",contents:`
        export const DatabaseViewConfigStore = {
          async load(){return structuredClone(globalThis.__doc)},
          async update(_block,action){
            const doc=structuredClone(globalThis.__doc);
            const result=await action(doc);
            globalThis.__doc=doc;
            globalThis.__writeCount++;
            return {document:doc,result};
          }
        };`};
      if (args.path === "./view-host") return {loader:"js",contents:`
        export const databaseViewHost = {
          subscribe(listener){globalThis.__listener=listener;return ()=>{globalThis.__listener=null}}
        };`};
      return {loader:"js",contents:`
        export async function postJson(url,payload){
          if(url!=="/api/av/getAttributeView")throw Error("wrong API");
          globalThis.__reads.push(payload);
          if(globalThis.__apiError) throw Error("kernel not ready");
          const entries=globalThis.__sequence.length
            ? globalThis.__sequence.shift():globalThis.__nativeIds;
          if(entries===null)return {av:{id:payload.id,views:null}};
          return {av:{id:payload.id,views:entries.map(id=>({id}))}};
        }`};
    });
  }}]
});
const api=await import("../tmp/test-native-view-reconcile.mjs");
const initialDoc=()=>({schemaVersion:1,views:{
  [kept]:{mode:"custom",configs:{custom:{appId}}},
  [removed]:{mode:"table",configs:{custom:{appId,allowWrites:false}}},
  [another]:{mode:"gantt",configs:{gantt:{}}},
}});
const reset=(nativeIds=[kept,another])=>{
  globalThis.__nativeIds=nativeIds;
  globalThis.__sequence=[];
  globalThis.__doc=initialDoc();
  globalThis.__writeCount=0;
  globalThis.__reads=[];
  globalThis.__apiError=false;
};
const settle=async()=>{};

reset();
assert.deepEqual(await api.reconcileDeletedNativeViews(blockId,avID,settle),[removed],
  "Only the native view that no longer exists should be pruned");
assert.deepEqual(Object.keys(globalThis.__doc.views).sort(),[kept,another].sort());
assert.equal(globalThis.__doc.views[kept].configs.custom.appId,appId,
  "Existing view's HTML App binding must remain unchanged");
assert.equal(globalThis.__writeCount,1);
assert.equal(globalThis.__reads.length,3,"Require a third authoritative check inside the write");
assert.deepEqual(await api.reconcileDeletedNativeViews(blockId,avID,settle),[]);
assert.equal(globalThis.__writeCount,1);

reset([kept,removed,another]);
assert.deepEqual(await api.reconcileDeletedNativeViews(blockId,avID,settle),[]);
assert.equal(globalThis.__writeCount,0,"Switching modes must not delete native view settings");

reset();
globalThis.__sequence=[[kept,another],[kept,removed,another]];
assert.deepEqual(await api.reconcileDeletedNativeViews(blockId,avID,settle),[]);
assert.equal(globalThis.__writeCount,0,"Transiently hidden/deleted native view must be preserved");

reset();
globalThis.__sequence=[[kept,another],[kept,another],[kept,removed,another]];
assert.deepEqual(await api.reconcileDeletedNativeViews(blockId,avID,settle),[]);
assert.equal(globalThis.__doc.views[removed].mode,"table",
  "If a view reappears just before the serialized write, preserve its Dodo config");

reset();
globalThis.__apiError=true;
await assert.rejects(()=>api.reconcileDeletedNativeViews(blockId,avID,settle),/kernel not ready/);
assert.equal(globalThis.__writeCount,0,"Kernel failure must not write attrs");

reset();
globalThis.__sequence=[null];
await assert.rejects(()=>api.reconcileDeletedNativeViews(blockId,avID,settle),/列表不完整/);
assert.equal(globalThis.__writeCount,0,"Missing kernel views must not imply deletion");

reset();
globalThis.__doc.views={};
assert.deepEqual(await api.reconcileDeletedNativeViews(blockId,avID,settle),[]);
assert.equal(globalThis.__reads.length,0,"Skip native read when no Dodo view bindings exist");

reset();
await assert.rejects(()=>api.reconcileDeletedNativeViews("../x",avID,settle),/ID 无效/);
await assert.rejects(()=>api.reconcileDeletedNativeViews(blockId,"incorrect",settle),/ID 无效/);
assert.equal(globalThis.__writeCount,0);

// End-to-end observer simulation: a native view tab disappears and the host
// emits its ordinary DOM scan event. The plugin should reconcile on its own.
reset([kept,removed,another]);
let tabs=[kept,removed,another];
const avElement={
  isConnected:true,dataset:{nodeId:blockId,avId:avID},
  querySelectorAll:()=>tabs.map(id=>({dataset:{id}})),
};
globalThis.document={querySelectorAll:()=>[avElement]};
const reconciler=new api.NativeDatabaseViewReconciler();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  reconciler.start();
  await sleep(850);
  assert.equal(globalThis.__writeCount,0,"Opening an existing AV must not rewrite its attributes");
  tabs=[kept,another];
  globalThis.__nativeIds=[kept,another];
  globalThis.__listener.scan();
  let success=false;
  for(let tries=0;tries<25;tries++){
    if(!globalThis.__doc.views[removed]){success=true;break}
    await sleep(250);
  }
  assert(success,"Deleting a native AV view should trigger automatic stale-config cleanup");
  assert.equal(globalThis.__writeCount,1);
  assert.equal(globalThis.__doc.views[kept].configs.custom.appId,appId);
} finally {
  reconciler.stop();
  delete globalThis.document;
}
console.log("PASS: native view deletion auto-sync, triple authoritative verification, mode switch/transient guards, fail closed");
