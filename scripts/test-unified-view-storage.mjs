import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

const schemaPath="src/lets-database-view/view-config-schema.ts";
const storePath="src/lets-database-view/view-config-store.ts";
const [schemaSource,storeSource]=await Promise.all([readFile(schemaPath,"utf8"),readFile(storePath,"utf8")]);
const schemaBuilt=await transformWithEsbuild(schemaSource,schemaPath,{loader:"ts",format:"esm"});
const schemaURI="data:text/javascript;base64,"+Buffer.from(schemaBuilt.code).toString("base64");
const schema=await import(schemaURI);
const A="20261019124400-abcdefg",B="20261019124400-abcdefh",C="20261019124400-abcdefi";
const block="20261019124400-abcdefj";
assert.equal(schema.DATABASE_VIEWS_ATTR,"custom-dodo-views");
assert.equal(schema.readDatabaseViewDocument().schemaVersion,1);
assert.deepEqual(schema.readDatabaseViewDocument().views,{});
assert.throws(()=>schema.readDatabaseViewDocument("{bad"),/JSON 无效/);
assert.throws(()=>schema.readDatabaseViewDocument('{"schemaVersion":2,"views":{}}'),/版本/);

const withExtra={
  schemaVersion:1,
  views:{
    [A]:{mode:"map",configs:{map:{fieldMapping:{coordinate:"location-a",image:""},height:520}}},
    [B]:{mode:"map",configs:{map:{fieldMapping:{coordinate:"location-b",image:""},height:720}}},
    [C]:{mode:"chart",configs:{chart:{type:"bar-basic"}}}
  }
};
assert.equal(Object.keys(schema.activeMapConfigs(withExtra)).length,2,
  "Two separate map views must be retained in one JSON");
assert.equal(schema.activeMapConfigs(withExtra)[B].height,720);
assert.equal(schema.activeVisualConfigs(withExtra)[C].kind,"chart");

const fakeAttrs={
  // These old keys must never be read or consulted by the new store:
  "custom-dodo-map-views":JSON.stringify({[A]:{fieldMapping:{coordinate:"OLD"}}}),
  "custom-dodo-database-visual-views":JSON.stringify({[C]:{kind:"chart"}}),
};
const state={calls:0, reads:0, writes:0};
globalThis.__dodoViewTestMocks={
  async getBlockAttrs(id){
    assert.equal(id,block);state.reads++;
    await new Promise(resolve=>setTimeout(resolve,4));
    return {...fakeAttrs};
  },
  async setBlockAttrs(id,payload){
    assert.equal(id,block);state.writes++;
    assert.deepEqual(Object.keys(payload),["custom-dodo-views"],
      "Only the unified view attribute can be written");
    await new Promise(resolve=>setTimeout(resolve,12));
    Object.assign(fakeAttrs,payload);
  }
};
const mockApiURI="data:text/javascript;base64,"+
  Buffer.from('export const getBlockAttrs=(...a)=>globalThis.__dodoViewTestMocks.getBlockAttrs(...a);export const setBlockAttrs=(...a)=>globalThis.__dodoViewTestMocks.setBlockAttrs(...a);').toString("base64");
const storeBuilt=await transformWithEsbuild(storeSource,storePath,{loader:"ts",format:"esm"});
let code=storeBuilt.code
  .replace('from "../api"', 'from "'+mockApiURI+'"')
  .replaceAll('from "./view-config-schema"', 'from "'+schemaURI+'"');
if(code.includes('"../api"')||code.includes('"./view-config-schema"'))
  throw new Error("Failed to replace native runtime imports in store test");
const store=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const first=await store.DatabaseViewConfigStore.load(block);
assert.deepEqual(first.views,{},"Legacy map and chart properties must NOT be imported");

const notifications = [];
const unsubscribe = store.DatabaseViewConfigStore.subscribe((id, document) => {
  assert.equal(id, block);
  assert.deepEqual(JSON.parse(fakeAttrs["custom-dodo-views"]), document,
    "notify only after the updated config has been committed");
  notifications.push(JSON.stringify(document));
});
await Promise.all([
  store.DatabaseViewConfigStore.updateView(block,A,view=>({
    ...view,mode:"map",configs:{...view.configs,map:{fieldMapping:{coordinate:"a",image:""},height:520}}
  })),
  store.DatabaseViewConfigStore.updateView(block,B,view=>({
    ...view,mode:"map",configs:{...view.configs,map:{fieldMapping:{coordinate:"b",image:""},height:720}}
  })),
  store.DatabaseViewConfigStore.updateView(block,C,view=>({
    ...view,mode:"chart",configs:{...view.configs,chart:{type:"bar-basic"}}
  })),
]);
let saved=await store.DatabaseViewConfigStore.load(block);
assert.equal(Object.keys(saved.views).length,3,
  "Concurrent writes to three viewIDs must not overwrite other views");
assert.equal(saved.views[A].configs.map.height,520);
assert.equal(saved.views[B].configs.map.height,720);
assert.equal(saved.views[C].configs.chart.type,"bar-basic");

await store.DatabaseViewConfigStore.updateView(block,A,entry=>({
  ...entry,mode:"chart",configs:{...entry.configs,chart:{type:"pie-basic"}},
}));
await store.DatabaseViewConfigStore.updateView(block,A,entry=>({...entry,mode:"map"}));
saved=await store.DatabaseViewConfigStore.load(block);
assert.equal(saved.views[A].configs.chart.type,"pie-basic",
  "Switching back to map must retain prior chart settings");
assert.equal(saved.views[A].configs.map.fieldMapping.coordinate,"a");
assert.equal(saved.views[B].configs.map.fieldMapping.coordinate,"b");

const legacyBefore=fakeAttrs["custom-dodo-map-views"];
assert.equal(fakeAttrs["custom-dodo-map-views"],legacyBefore,
  "No migration or deletion of prior user data should occur");
assert.equal(saved.schemaVersion,1);
assert.equal(state.writes,5);
assert.equal(notifications.length, 5, "every committed config notifies all split instances");
unsubscribe();

const [controller,visual,customBlock,customSettings,mapIframe,timelineIframe,host]=await Promise.all([
  readFile("src/lets-database-view/map/map-view-service.ts","utf8"),
  readFile("src/lets-database-view/visual/visual-view-service.ts","utf8"),
  readFile("src/lets-custom-block/index.ts","utf8"),
  readFile("src/lets-custom-block/plugin.ts","utf8"),
  readFile("src/lets-database-view/map/iframe/main.ts","utf8"),
  readFile("src/lets-custom-block/timeline/iframe/main.ts","utf8"),
  readFile("src/lets-database-view/map/map-block-service.ts","utf8"),
]);
for(const str of [controller,visual,host]) {
  assert.match(str,/DatabaseViewConfigStore/);
  assert.doesNotMatch(str,/custom-dodo-database-visual-views|custom-dodo-map-views/);
}
assert.match(mapIframe,/readDatabaseViewDocument\(attrs\[DATABASE_VIEWS_ATTR\]\)/);
assert.match(timelineIframe,/const VIEWS_ATTR = "custom-dodo-views"/);
assert.doesNotMatch(timelineIframe,/custom-dodo-database-visual-views/);
for(const entry of ["chart-enabled","map-enabled","timeline-enabled","chart-slash-entries","map-slash-entries","timeline-slash-entries"]) {
  assert.doesNotMatch(customSettings,new RegExp('"'+entry+'"'),"Standalone settings must be removed: "+entry);
}
assert.doesNotMatch(customBlock,/ChartBlockService|openMapSettings|TimelineConverterService|custom-block-map-|custom-block-chart-|custom-block-timeline-/,
  "Standalone map/chart/timeline creation and settings handlers must no longer be active");
console.log("PASS: one schema-versioned JSON per database; independent same-type viewIDs; concurrent saves serialized; mode history retained; no legacy properties or standalone UI");