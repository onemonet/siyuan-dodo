import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

const source = await readFile("src/lets-database-view/map/iframe/main.ts","utf8");
const host = await readFile("src/lets-database-view/index.ts","utf8") +
  await readFile("src/lets-database-view/map/map-interaction.ts","utf8");
const service = await readFile("src/lets-database-view/map/map-block-service.ts","utf8");
const menuStart=source.indexOf("function attachPointContextMenu(");
const menuEnd=source.indexOf("function exitPointCorrection()",menuStart);
assert.ok(menuStart>=0&&menuEnd>menuStart);
const menuCode=(await transformWithEsbuild(source.slice(menuStart,menuEnd),"menu.ts",{loader:"ts"})).code;
const point={itemId:"20261019110000-abcdefg",avID:"20261019110000-abcdefh",
  databaseBlockID:"20261019110000-abcdefi",title:"测试坐标"};
const element={addEventListener(name,fn){this[name]=fn;}};
const menu={hidden:true,offsetWidth:120,offsetHeight:82,style:{}};
const state={
  pointContextMenu:menu,contextPoint:null,addMode:false,correctionPoint:null,locateTarget:null,
  mapAddingPoint:false,isDatabaseMapView:true,window:{innerWidth:600,innerHeight:420},
  hidePointPreview(){},
};
vm.runInNewContext(menuCode+
  "\nthis.show=(element,cluster)=>attachPointContextMenu(element,cluster);",state);
state.show(element,{points:[point]});
assert.equal(typeof element.contextmenu,"function","Native database markers must get a contextmenu listener");
const event={clientX:200,clientY:120,
  prevented:false,stopped:false,
  preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
element.contextmenu(event);
assert.equal(event.prevented,true);
assert.equal(event.stopped,true);
assert.equal(menu.hidden,false,"Database marker menu should be displayed");
assert.equal(state.contextPoint?.itemId,point.itemId);
assert.equal(menu.style.left,"200px");
assert.equal(menu.style.top,"120px");
assert.match(source,/data-action="correct"/);
assert.match(source,/data-action="delete"/);
assert.doesNotMatch(source.slice(menuStart,menuEnd),/if \(isDatabaseMapView\) return;/);
assert.match(host,/data\.type === "dodoMapMutatePoint"/);
assert.match(host,/mapViews\.getFrameContext\(source\)/);
assert.match(host,/MapBlockService\.correctPoint\(context\.blockId, point, latitude, longitude, context\.viewId\)/);
assert.match(host,/MapBlockService\.deletePoint\(context\.blockId, point, context\.viewId\)/);

const targetStart=service.indexOf("  private static async verifyMapItemTarget(");
const targetEnd=service.indexOf("  private static async mutateMapRow(",targetStart);
assert.ok(targetStart>=0&&targetEnd>targetStart);
const verifyCode=(await transformWithEsbuild(
 "class Tester {\n"+service.slice(targetStart,targetEnd).replace("private static","static")+"\n}\nthis.Tester=Tester;",
 "verify.ts",{loader:"ts",format:"cjs"})).code;
const viewID="20261019110000-abcdefj",columnID="20261019110000-abcdefk";
const rendered={view:{columns:[{id:columnID,type:"location"}],rows:[{id:point.itemId}]}};
const avTable={headers:["坐标"],fieldTypes:["location"],columnIds:[columnID],
 rows:[["122,31"]],rowBlockIds:[point.itemId],rowBoundBlockIds:[""]};
let requests=[];
const verification={exports:{},
  DatabaseViewConfigStore: { load:async()=>({views:{
    [viewID]:{mode:"map",configs:{map:{fieldMapping:{coordinate:columnID,image:""}}}}
  }})},  getBlockDOM:async()=>({dom:'<div data-av-id="'+point.avID+'"></div>'}),
  renderAttributeView:async request=>{requests.push(request);return rendered;},
  adaptAttributeViewRender:()=>avTable,
  resolveFieldBinding:(_table,key,types)=>({status:key===columnID?"resolved":"invalid",
    id:key,index:key===columnID?0:-1}),
  validateMapSource:()=>{},
  loadMapSource:async()=>({...avTable,avID:point.avID}),
  parseMapConfig:source=>JSON.parse(source||"{}"),
};
vm.runInNewContext(verifyCode,verification);
const allowed=await verification.exports.Tester.verifyMapItemTarget(point.databaseBlockID,point,viewID);
assert.equal(allowed.avID,point.avID);
assert.equal(allowed.locationKeyID,columnID);
assert.equal(requests[0].viewID,viewID);
assert.equal(requests[0].blockID,point.databaseBlockID);
assert.equal(requests[0].pageSize,100000);
await assert.rejects(
  verification.exports.Tester.verifyMapItemTarget("20261019110000-abcdefx",point,viewID),
  /来源数据库已改变/,"A point cannot be edited in an unrelated database");
verification.adaptAttributeViewRender=()=>({...avTable,rowBlockIds:[]});
await assert.rejects(
  verification.exports.Tester.verifyMapItemTarget(point.databaseBlockID,point,viewID),
  /条目已不存在/,"Do not mutate a row filtered out of the selected view");
verification.adaptAttributeViewRender=()=>avTable;
verification.DatabaseViewConfigStore.load=async()=>({views:{}});
await assert.rejects(
  verification.exports.Tester.verifyMapItemTarget(point.databaseBlockID,point,viewID),
  /未启用地图模式/,"Reject stale native-map view");
console.log("PASS: database map right-click menu opens; safe edit/delete message routing; native AV view and row/keyID verification");