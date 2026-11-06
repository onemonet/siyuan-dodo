import assert from "node:assert/strict";
import { build } from "esbuild";

const sourceId = "20260101010101-aaaaaaa";
const alternateId = "20260101010102-bbbbbbb";
const newId = "20260101010103-ccccccc";
const blockId = "20260101010104-ddddddd";
const avID = "20260101010105-eeeeeee";

let ids = [sourceId, alternateId];
let transactionCalls = [];
let tamperOriginal = false;
globalThis.window = {Lute: {NewNodeID: () => newId}};
globalThis.__nativeViews = ids;
globalThis.__nativeRequest = async (url, data) => {
  assert.equal(url, "/api/transactions");
  const tx = data.transactions[0];
  assert.deepEqual(tx.doOperations.map(x => x.action), ["addAttrViewView"]);
  assert.deepEqual(tx.undoOperations.map(x => x.action), ["removeAttrViewView"]);
  const op = tx.doOperations[0];
  assert.deepEqual({avID:op.avID,blockID:op.blockID,layout:op.layout,name:op.name},
    {avID,blockID:blockId,layout:"table",name:"AI 自定义视图"});
  assert.equal(op.id,newId);
  assert(!ids.includes(op.id));
  ids.push(newId);
  transactionCalls.push(op);
};
globalThis.__nativePost = async (url, payload) => {
  assert.equal(url,"/api/av/getAttributeView");
  assert.deepEqual(payload,{id:avID});
  return {av:{id:avID,views:ids.map(id => ({id}))}};
};

const mock = {
  "../../api": 'export async function request(...args){ return globalThis.__nativeRequest(...args) }',
  "../../shared/av/kernel-api": 'export async function postJson(...args){ return globalThis.__nativePost(...args) }',
};
const virtual = {name:"agent-native-api-mocks",setup(build){
  build.onResolve({filter:/^\.\.\/\.\.\/api$|^\.\.\/\.\.\/shared\/av\/kernel-api$/},
    args => ({path:args.path,namespace:"mock"}));
  build.onLoad({filter:/.*/,namespace:"mock"}, args => ({contents:mock[args.path],loader:"js"}));
}};
const b = await build({entryPoints:["src/lets-database-view/custom/native-view-create.ts"],
  bundle:true,write:false,format:"esm",platform:"node",plugins:[virtual],logLevel:"silent"});
const native = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
assert.equal(await native.createNativeCustomView(blockId,avID,sourceId),newId);
assert.deepEqual(ids,[sourceId,alternateId,newId]);
assert.equal(transactionCalls.length,1);
await assert.rejects(() => native.createNativeCustomView(blockId,avID,"20260101010106-fffffff"),
  /原视图已不存在/);
assert.equal(transactionCalls.length,1);
console.log("PASS: native transaction creates unique tab while retaining all original native view IDs");

const currentDoc = {views:{
  [sourceId]:{mode:"chart",configs:{chart:{type:"bar-basic"}}},
  [alternateId]:{mode:"table",configs:{}},
}};
const customApp = {manifest:{version:1},html:"<html><body>Agent custom</body></html>"};
const header = {dataset:{currentViewId:sourceId},
  querySelector:(q)=>q.includes("item--focus") ? {textContent:"统计图"} : null};
const av = {isConnected:true,dataset:{nodeId:blockId,avId:avID},
  querySelector:()=>header};
globalThis.document = {querySelectorAll:()=>[av]};
globalThis.__doc = currentDoc;
globalThis.__target = {av,blockId,avID,viewId:sourceId,viewName:"统计图",search:""};
globalThis.__agentSaved = [];
globalThis.__agentChanges = 0;
let callbackCalls = 0;

const mocks = new Map([
  ["../view-config-store", 'export const DatabaseViewConfigStore={load:async()=>globalThis.__doc};'],
  ["../core/view-host", 'export const currentNativeView=header=>header.dataset.currentViewId;'],
  ["./storage", 'export const getCustomApp=async()=>globalThis.__app; export const saveCustomApp=async (id,html,version)=>{globalThis.__agentSaved.push({id,html,version});return {version:version+1}}; export const listCustomVersions=async()=>[]; export const restoreCustomVersion=async()=>({version:2});'],
  ["./data-service", 'export const getCustomSchema=async (ctx)=>({avID:ctx.avID,blockId:ctx.blockId,viewId:ctx.viewId,name:"测试数据库",pageSize:50,all:false,fields:[]}); export const listCustomRecords=async(ctx)=>({total:0,records:[],page:1,pageSize:50});'],
  ["./current-target", 'export const currentDatabaseTarget=()=>globalThis.__target;'],
]);
globalThis.__app=customApp;
const plugins = [{name:"agent-view-mock",setup(build){
  build.onResolve({filter:/^\.\.\/view-config-store$|^\.\.\/core\/view-host$|^\.\/storage$|^\.\/data-service$|^\.\/current-target$/},
    args=>({path:args.path,namespace:"agent-mock"}));
  build.onLoad({filter:/.*/,namespace:"agent-mock"},
    args=>({contents:mocks.get(args.path),loader:"js"}));
  build.onResolve({filter:/\.md\?raw$/},args=>({path:args.path,namespace:"guide-mock"}));
  build.onLoad({filter:/.*/,namespace:"guide-mock"},
    ()=>({contents:'export default "Agent mock guide";',loader:"js"}));
}}];
const result=await build({entryPoints:["src/lets-database-view/custom/agent-tools.ts"],
  bundle:true,write:false,format:"esm",platform:"node",plugins,logLevel:"silent"});
const {registerCustomViewAgentCapabilities}=await import(
  "data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
const capabilities=new Map();
const host={addAgentCapability(spec){capabilities.set(spec.name,spec);}};
assert(registerCustomViewAgentCapabilities(host,()=>true,
  ()=>{globalThis.__agentChanges++},
  async (b,v,a)=>{
    assert.deepEqual([b,v,a],[blockId,sourceId,avID]);
    callbackCalls++;
    if (globalThis.__doc.views[sourceId]?.mode === "custom") return sourceId;
    globalThis.__doc.views[newId]={mode:"custom",configs:{custom:{appId:"app-agent-new"}}};
    return newId;
  }));
const call=async (name,args)=>capabilities.get("dodo-database.custom."+name).handler(args||{});
const current=await call("current");
assert.equal(current.structuredContent.data.mode,"chart");
assert.equal(current.structuredContent.data.canCreateCustomView,true);
const created=await call("create",{blockId,viewId:sourceId,avID});
assert(!created.error,created.error);
assert.equal(created.structuredContent.data.createdViewId,newId);
assert.equal(created.structuredContent.data.sourceViewId,sourceId);
assert.equal(created.structuredContent.data.appId,"app-agent-new");
assert.equal(created.structuredContent.data.mode,"custom");
assert.equal(created.structuredContent.data.html,customApp.html);
assert.equal(callbackCalls,1);
assert.deepEqual(globalThis.__doc.views[sourceId],{mode:"chart",configs:{chart:{type:"bar-basic"}}});
assert.equal(header.dataset.currentViewId,sourceId,"UI may still be on the old view");
const saved=await call("save_source",{appId:"app-agent-new",expectedVersion:1,html:"<html>new source</html>"});
assert(!saved.error,saved.error);
assert.deepEqual(globalThis.__agentSaved,[{id:"app-agent-new",html:"<html>new source</html>",version:1}]);
assert.equal(globalThis.__agentChanges,1);
console.log("PASS: Agent CREATE binds a new app/view without replacing active chart; save_source works before UI tab activation");

// Active existing custom views reuse their application, not a new view.
globalThis.__doc.views[sourceId]={mode:"custom",configs:{custom:{appId:"app-existing"}}};
const reused=await call("create",{blockId,viewId:sourceId,avID});
assert(!reused.error,reused.error);
assert.equal(reused.structuredContent.data.viewId,sourceId);
assert.equal(reused.structuredContent.data.appId,"app-existing");
assert.equal(reused.structuredContent.data.createdNewView,undefined);
assert.equal(callbackCalls,2);
console.log("PASS: Agent preserves existing custom appId when editing an active custom view");

// A switched native view must be rejected without writing.
const switched=await call("create",{blockId,viewId:alternateId,avID});
assert(switched.error?.includes("数据库已切换"));
assert.equal(callbackCalls,2);
console.log("PASS: stale native view identity is rejected before any changes");
