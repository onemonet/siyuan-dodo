import assert from "node:assert/strict";
import { build } from "esbuild";
const blockID="20261105000000-aaa0000", avID="20261105000000-bbb0000";
const viewID="20261105000000-ccc0000", itemID="20261105000000-ddd0000";
const locationID="20261105000000-eee0000";
const otherID="20261105000000-fff0000";
let currentLocation="", writes=[], rows=[itemID], configMode="map";
globalThis.__locationMocks={
  getBlockDOM: async id=>{assert.equal(id,blockID);return {dom:`<div data-av-id="${avID}"></div>`}},
  render: async payload=>{
    assert.equal(payload.id,avID);assert.equal(payload.viewID,viewID);
    return {view:{
      columns:[{id:locationID,name:"位置",type:"location"}],
      rows:rows.map(id=>({
        id,cells:[{value:{keyID:locationID,location:
          id===itemID?globalThis.__nativeRawLocation||{}:{}}}],
      })),
    }};
  },
  load: async id=>{assert.equal(id,blockID);return {views:{
    [viewID]:{mode:configMode,configs:{map:{fieldMapping:{coordinate:locationID}}}}
  }}},
  adapt: ()=>({avID,headers:["位置"],columnIds:[locationID],fieldTypes:["location"],
    rows:rows.map(id=>[id===itemID?currentLocation:""]),
    rowBlockIds:rows,rowBoundBlockIds:rows.map(()=>""),rowValueIds:rows.map(()=>"")}),
  binding: (table,binding,types)=>binding===locationID && types.includes("location")
    ? {status:"resolved",index:0,id:locationID}:{status:"missing"},
};
globalThis.fetch=async (url, init)=>{
  const payload=JSON.parse(init.body);
  writes.push({url,payload});
  return {ok:true,json:async()=>({code:0,data:{}})};
};
const modules=new Map([
  ["../../shared/av/kernel-api",'export const renderAttributeView=(...args)=>globalThis.__locationMocks.render(...args);export const getBlockDOM=(...args)=>globalThis.__locationMocks.getBlockDOM(...args);'],
  ["../view-config-store",'export const DatabaseViewConfigStore={load:(...args)=>globalThis.__locationMocks.load(...args)};'],
  ["../../shared/av/av-data-adapter",'export const adaptAttributeViewRender=(...args)=>globalThis.__locationMocks.adapt(...args);'],
  ["../../shared/av/field-binding",'export const resolveFieldBinding=(...args)=>globalThis.__locationMocks.binding(...args);'],
]);
const mock={name:"map-location-write-mocks",setup(bundle){
  bundle.onResolve({filter:/^\.\.\/(?:view-config-store)$|^\.\.\/\.\.\/shared\/av\/(?:kernel-api|av-data-adapter|field-binding)$/},
    args=>({namespace:"mock",path:args.path}));
  bundle.onLoad({namespace:"mock",filter:/.*/},args=>({contents:modules.get(args.path),loader:"js"}));
}};
const b=await build({entryPoints:["src/lets-database-view/map/map-block-service.ts"],
  bundle:true,platform:"node",format:"esm",write:false,plugins:[mock],logLevel:"silent"});
const {MapBlockService}=await import("data:text/javascript;base64,"+
  Buffer.from(b.outputFiles[0].text).toString("base64"));
const target={itemId:itemID,avID,databaseBlockID:blockID};
await MapBlockService.locateExistingItem(blockID,target,30.123456,120.123456,viewID);
assert.equal(writes.length,1);
assert.equal(writes[0].url,"/api/av/setAttributeViewBlockAttr");
assert.deepEqual(writes[0].payload,{
  avID,keyID:locationID,itemID,
  value:{type:"location",location:{
    latitude:30.123456,longitude:120.123456,originalInput:"120.123456,30.123456"
  }},
});
assert(writes.every(x=>!String(x.url).includes("addAttributeViewBlocks")));
console.log("PASS: locating an existing row writes ONLY its native location field, no new item");
for(const bad of ["120,30", "无效坐标", " 120,999 "]) {
  currentLocation=bad;
  await assert.rejects(()=>MapBlockService.locateExistingItem(blockID,target,31,121,viewID),/已设置位置|无效坐标/);
}
assert.equal(writes.length,1,"existing/nonempty location must not be overwritten");
currentLocation="";
globalThis.__nativeRawLocation={originalInput:"120,999"};
await assert.rejects(()=>MapBlockService.locateExistingItem(blockID,target,31,121,viewID),/已设置位置|无效坐标/);
assert.equal(writes.length,1,"native originalInput must prevent silent overwrite");
globalThis.__nativeRawLocation={};
rows=[otherID];
await assert.rejects(()=>MapBlockService.locateExistingItem(blockID,target,31,121,viewID),/条目已不存在|不在当前/);
rows=[itemID];
configMode="table";
await assert.rejects(()=>MapBlockService.locateExistingItem(blockID,target,31,121,viewID),/未启用地图/);
configMode="map";
await assert.rejects(()=>MapBlockService.locateExistingItem(blockID,{...target,avID:otherID},31,121,viewID),/数据库 ID 已改变/);
await assert.rejects(()=>MapBlockService.locateExistingItem(blockID,target,92,121,viewID),/坐标无效/);
assert.equal(writes.length,1);
console.log("PASS: rejects filled, invalid, stale, non-map and out-of-range location writes");

// Data classification includes blank locations ONLY, excluding invalid nonempty cells.
const dataBuild=await build({entryPoints:["src/lets-database-view/map/map-data.ts"],
  bundle:true,platform:"node",format:"esm",write:false,logLevel:"silent"});
const data=await import("data:text/javascript;base64,"+
  Buffer.from(dataBuild.outputFiles[0].text).toString("base64"));
const table={headers:["标题","位置"],columnIds:["name",locationID],fieldTypes:["block","location"],
  rows:[["已定位","120,30"],["空白条目",""],["无效坐标","120,999"],["另一个空白"," "],["没有身份",""]],
  rowBlockIds:[itemID,otherID,"20261105000000-ggg0000","20261105000000-hhh0000",""],
  rowBoundBlockIds:["","","","",""],rowValueIds:["","","","",""],avID,databaseBlockID:blockID};
const preview=data.buildMapPreviewData(table,{coordinate:locationID,image:""});
assert.equal(preview.points.length,1);
assert.deepEqual(preview.unlocated.map(x=>x.title),["空白条目","另一个空白"]);
assert(preview.unlocated.every(x=>x.itemId && x.avID===avID && x.databaseBlockID===blockID));
assert.equal(preview.points[0].title,"已定位");
console.log("PASS: unlocated selection shows only empty cells with valid original AV item identity");
