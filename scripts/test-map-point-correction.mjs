import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

const iframe=await readFile("src/lets-database-view/map/iframe/main.ts","utf8");
const host=await readFile("src/lets-database-view/map/map-interaction.ts","utf8");
const standalone=await readFile("src/lets-custom-block/index.ts","utf8");
const service=await readFile("src/lets-database-view/map/map-block-service.ts","utf8");
const views=await readFile("src/lets-database-view/map/map-view-service.ts","utf8");
const html=await readFile("src/lets-database-view/map/iframe/index.html","utf8");

const start=iframe.indexOf("function applyPointCorrection(");
const end=iframe.indexOf("function render(data: MapPreviewData): void",start);
assert.ok(start>0 && end>start,"Extract marker-only correction from iframe");
const {code}=await transformWithEsbuild(iframe.slice(start,end),"correction.ts",{loader:"ts",format:"esm"});
for(const engine of ["leaflet","google","amap-api2"]){
  let position,draws=0;
  const marker={
    setLatLng:value=>{position=value},
    setPosition:value=>{position=value},
    set position(value){position=value},
  };
  const point={itemId:"point1",latitude:30,longitude:120,title:"测试"};
  const state={
    latestData:{points:[point]},
    activeMapTable:null,activeMapMapping:null,
    singlePointMarkers:new Map([["point1",{engine,marker}]]),
    activeEngine:engine,
    resolveFieldBinding:()=>({status:"missing"}),
    displayCoordinate:point=>[point.longitude,point.latitude],
    clusterPoints:points=>points.map(item=>({points:[item]})),
    drawMarkers:()=>{draws++},
  };
  vm.runInNewContext(code+"\nthis.runCorrection=applyPointCorrection;",state);
  state.runCorrection("point1",31.5,121.75);
  assert.equal(point.latitude,31.5);
  assert.equal(point.longitude,121.75);
  assert.equal(draws,0,engine+" must not redraw the marker layer for standalone point");
  if(engine==="google"){
    assert.equal(position.lat,31.5);
    assert.equal(position.lng,121.75);
  }else{
    assert.deepEqual(Array.from(position),engine==="leaflet"?[31.5,121.75]:[121.75,31.5]);
  }
  const before={...point};
  state.runCorrection("point1",200,121.75);
  assert.deepEqual(point,before,"Out-of-range coordinate must not mutate map");
  state.clusterPoints=points=>[{points:[points[0],{itemId:"other"}]}];
  state.runCorrection("point1",32,122);
  assert.equal(draws,1,engine+" must recluster only marker overlay when necessary");
}
const detailTable={
  headers:["标题","坐标"],
  rows:[["标题","120,30"]],
  rowBlockIds:["point1"],
};
const record={
  itemId:"point1",latitude:30,longitude:120,description:"坐标：120,30",
};
const detail={
  latestData:{points:[record]},
  activeMapTable:detailTable,
  activeMapMapping:{fieldMapping:{coordinate:"20261019000000-abcdefg"}},
  singlePointMarkers:new Map(),
  activeEngine:"leaflet",
  resolveFieldBinding:()=>({status:"resolved",index:1}),
  clusterPoints:points=>points.map(point=>({points:[point]})),
  drawMarkers:()=>{},
};
vm.runInNewContext(code+"\nthis.runCorrection=applyPointCorrection;",detail);
detail.runCorrection("point1",31,121);
assert.equal(detailTable.rows[0][1],"121,31");
assert.match(record.description,/坐标：121,31/);

const renderStart=iframe.indexOf("function render(data: MapPreviewData): void");
const renderEnd=iframe.indexOf("async function reload(): Promise<void>",renderStart);
assert.ok(renderStart>0 && renderEnd>renderStart);
const renderCode=(await transformWithEsbuild(
  iframe.slice(renderStart,renderEnd),"map-render.ts",{loader:"ts"})).code;
const originalPoint={itemId:"item-1",title:"旅游地点",longitude:122,latitude:32,
  description:"位置：122,32",displayText:"地点"};
const before={points:[originalPoint],message:"旧地图信息"};
let redraws=0;
const renderState={
  latestData:before,
  activeConfig:{mapSource:"osm"},
  engineSignature:"leaflet:osm",
  initialViewportPending:false,
  lastRenderSignature:JSON.stringify({data:before,engineSignature:"leaflet:osm",source:"osm"}),
  drawMarkers:()=>{redraws++},
  renderUnlocatedItems:()=>{},
  restoreMapViewport:()=>true,
  fitAll:()=>{},
};
vm.runInNewContext(renderCode+"\nthis.renderMap=render;",renderState);
renderState.renderMap({points:[{...originalPoint,description:"修改后的坐标详情"}],
  message:"数据刷新"});
assert.equal(redraws,0,"Native data reload with unchanged marker geometry must not redraw");
assert.equal(renderState.latestData.points[0],originalPoint,
  "Must retain same marker object for hover/click event closures");
assert.equal(originalPoint.description,"修改后的坐标详情");
renderState.renderMap({points:[{...originalPoint,image:"/assets/updated.png"}],
  message:"图片修改"});
assert.equal(redraws,1,"Visible marker content changes still require marker redraw");
assert.match(host,/mapViews\.beginPointCorrection\(context\.blockId, context\.viewId\)/);
assert.match(host,/mapViews\.finishPointCorrection\(context\.blockId, context\.viewId\)/);
assert.match(views,/correctionsInFlight\.has\(av\)/);
const corrStart=service.indexOf("  static async correctPoint(");
const corrEnd=service.indexOf("  /** 删除 AV 条目",corrStart);
assert.ok(corrStart>0&&corrEnd>corrStart);
assert.doesNotMatch(service.slice(corrStart,corrEnd),/refreshMapBlock|dodoMapRefresh/);
assert.doesNotMatch(service,/static broadcastPointCorrection/);
const dbStart=host.indexOf('} else if (data.type === "dodoMapMutatePoint")');
const dbEnd=host.indexOf('} else if (data.type === "dodoMapCreatePoint")',dbStart);
assert.ok(dbStart>0&&dbEnd>dbStart);
const dbBranch=host.slice(dbStart,dbEnd);
assert.match(dbBranch,/mapViews\.broadcastPointCorrection/);
assert.match(dbBranch,/mapViews\.refreshFrames\(\)/);
assert.match(dbBranch,/action === "correct" \? \{ itemId: point\.itemId, latitude, longitude \}/);
assert.doesNotMatch(standalone,/MapBlockService\.broadcastPointCorrection/);

assert.match(views,/correctionMuteUntil\.set\(av, Date\.now\(\) \+ 1200\)/);
assert.match(views,/Date\.now\(\) < \(this\.correctionMuteUntil\.get\(av\) \|\| 0\)/);
assert.match(views,/this\.reloadTimers\.delete\(av\)/);
assert.match(iframe,/if \(action === "correct"\) \{[\s\S]*?applyPointCorrection/);
assert.match(iframe,/else \{\s*void reload\(\); \/\/ Deletion/);
assert.match(iframe,/dodoMapPointCorrected/);
assert.match(html,/main\.js\?v=20261105-locate-existing/);

console.log("PASS: correction changes one marker in-place on Leaflet/Google/AMap, reclusters overlays only as needed, keeps AV cache, no reload on success, delete still refreshes");