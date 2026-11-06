import assert from "node:assert/strict";
import {build} from "esbuild";
const id=(c)=>"20261104000000-"+c.repeat(7);
const avID=id("a"),blockId=id("b"),viewId=id("c"),recordId=id("d");
const keyPrimary=id("e"),keyNumber=id("f"),keyText=id("0"),
  keyCheckbox=id("1"),keyDepartment=id("4"),keyDepartments=id("6");
await build({entryPoints:["src/lets-database-view/custom/data-service.ts"],
  outfile:"tmp/custom-view-test/data-service.mjs",
  format:"esm",platform:"node",bundle:true,logLevel:"silent",
  plugins:[{name:"mock-open-item",setup(build){
    build.onResolve({filter:/^\.\.\/map\/open-map-item$/},args=>({path:args.path,namespace:"stub"}));
    build.onLoad({filter:/.*/,namespace:"stub"},()=>({contents:
      "export async function openMapItem(value){globalThis.lastOpenedRecord=value}",loader:"js"}));
  }}]});
const api=await import("../tmp/custom-view-test/data-service.mjs");
const raw={viewID:viewId,name:"Mock database",view:{
  rowCount:1,pageSize:25,columns:[
    {id:keyPrimary,type:"block",name:"名称"},
    {id:keyNumber,type:"number",name:"价格"},
    {id:keyText,type:"text",name:"描述"},
    {id:keyCheckbox,type:"checkbox",name:"启用"},
    {id:keyDepartment,type:"select",name:"部门"},
    {id:keyDepartments,type:"mSelect",name:"参与部门"},
  ],
  rows:[{id:recordId,cells:[
    {value:{keyID:keyPrimary,id:id("2"),block:{id:id("3"),content:"产品 A"}}},
    {value:{keyID:keyNumber,number:{content:12,isNotEmpty:true}}},
    {value:{keyID:keyText,text:{content:"备注"}}},
    {value:{keyID:keyCheckbox,checkbox:{checked:true}}},
    // A real SiYuan single-select column may store its option under mSelect.
    {value:{keyID:keyDepartment,type:"select",select:{},mSelect:[{content:"销售一部",color:"red"}]}},
    {value:{keyID:keyDepartments,type:"mSelect",mSelect:[{content:"销售一部"},{content:"产品研发部"}]}},
  ]}],
}};
const calls=[];
const nativePageSizeOverrides=[];
globalThis.fetch=async (url,options)=>{
  const payload=JSON.parse(options.body);
  calls.push({url,payload});
  const returnedRaw=url==="/api/av/renderAttributeView" &&
    nativePageSizeOverrides.length
    ?{...raw,view:{...raw.view,pageSize:nativePageSizeOverrides.shift()}}:raw;
  return new Response(JSON.stringify({code:0,data:
    url==="/api/av/renderAttributeView"?returnedRaw:{}}),{status:200});
};
const ctx={avID,blockId,viewId,search:"特定条件"};
const schema=await api.getCustomSchema(ctx);
assert.equal(schema.name,"Mock database");
assert.equal(schema.pageSize,25);
assert.equal(schema.batchSize,25);
assert.equal(schema.all,false);
assert.deepEqual(schema.fields.map(x=>x.id),[keyPrimary,keyNumber,keyText,keyCheckbox,keyDepartment,keyDepartments]);
const page=await api.listCustomRecords(ctx,{page:1,pageSize:1000});
assert.equal(page.pageSize,25,"HTML-supplied pageSize must NOT override SiYuan native setting");
assert.equal(page.nativePageSize,25);
assert.equal(page.all,false);
assert.equal(page.hasMore,false);
assert.equal(calls.at(-1).payload.pageSize,25);
assert.equal(page.records[0].values[keyPrimary],"产品 A");
assert.equal(page.records[0].values[keyNumber],12);
assert.equal(page.records[0].values[keyText],"备注");
assert.equal(page.records[0].values[keyCheckbox],true);
assert.equal(page.records[0].values[keyDepartment],"销售一部",
  "Single-select must read mSelect[0] when select.content is absent");
assert.deepEqual(page.records[0].values[keyDepartments],["销售一部","产品研发部"],
  "Multiple-select must remain an array");
for(const size of [5,10,25,50,100,102400]){
  raw.view.pageSize=size;
  const batch=await api.listCustomRecords(ctx,{page:2,pageSize:3});
  assert.equal(batch.nativePageSize,size);
  assert.equal(batch.pageSize,size===102400?100:size);
  assert.equal(batch.all,size===102400);
  assert.equal(calls.at(-1).payload.page,2);
  assert.equal(calls.at(-1).payload.pageSize,size===102400?100:size);
}
raw.view.pageSize=25;
nativePageSizeOverrides.push(25,50);
await assert.rejects(()=>api.listCustomRecords(ctx,{page:1}),
  /条目数.*变化/,"A native setting changed during fetch must not mix pagination boundaries");
delete raw.view.pageSize;
assert.equal((await api.getCustomSchema(ctx)).pageSize,50,
  "Malformed/legacy AV view config falls back to SiYuan's native default 50");
raw.view.pageSize=25;
const departmentCell = raw.view.rows[0].cells.find(cell=>cell.value.keyID===keyDepartment);
departmentCell.value = {
  keyID:keyDepartment,type:"select",select:{content:"产品研发部"},mSelect:[],
};
assert.equal((await api.listCustomRecords(ctx,{page:1,pageSize:50})).records[0].values[keyDepartment],
  "产品研发部","Legacy select.content must remain supported");
departmentCell.value = {
  keyID:keyDepartment,type:"select",select:{},mSelect:[],
};
assert.equal((await api.listCustomRecords(ctx,{page:1,pageSize:50})).records[0].values[keyDepartment],
  "","Empty single-select must stay empty");
departmentCell.value = {
  keyID:keyDepartment,type:"select",mSelect:[{content:"销售一部"}],
};
assert.equal(calls.at(-1).payload.query,"特定条件");
assert.equal((await api.openCustomRecord(ctx,recordId)).opened,true);
assert.equal(globalThis.lastOpenedRecord.blockId,id("3"));
assert.equal((await api.openCustomRecord(ctx,id("3"))).opened,true,
  "SiYuan deep link's bound document ID should resolve to its AV row");
assert.equal(globalThis.lastOpenedRecord.itemId,recordId);
await assert.rejects(()=>api.openCustomRecord(ctx,id("9")),/记录不在当前数据库视图/);
await assert.rejects(()=>api.updateCustomCell(ctx,{recordId,fieldId:keyNumber,value:2},false),/尚未授权/);
await assert.rejects(()=>api.updateCustomCell(ctx,{recordId,fieldId:keyNumber,value:"bad"},true),/仅支持写入/);
assert.equal((await api.updateCustomCell(ctx,{recordId,fieldId:keyNumber,value:22},true)).updated,true);
const mutation=calls.find(x=>x.url==="/api/av/setAttributeViewBlockAttr");
assert.equal(mutation.payload.keyID,keyNumber);
assert.equal(mutation.payload.value.number.content,22);
await assert.rejects(()=>api.createCustomRecord(ctx,{values:{}},true),/主键标题/);
const created=await api.createCustomRecord(ctx,{values:{[keyPrimary]:"新商品",[keyNumber]:25}},true);
assert.equal(created.created,true);
assert.match(created.recordId,/^\d{14}-[a-z0-9]{7}$/);
assert(calls.some(x=>x.url==="/api/av/addAttributeViewBlocks"&&x.payload.srcs[0].content==="新商品"));
console.log("PASS: typed AV schema/records, query & pagination, deny-by-default writes, validated cell update/create");
