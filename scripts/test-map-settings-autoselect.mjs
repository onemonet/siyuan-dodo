import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";

const meta = readFileSync("src/lets-database-view/plugin.ts", "utf8");
const item = readFileSync("src/libs/setting-item.svelte", "utf8");
const mapData = readFileSync("src/lets-database-view/map/map-data.ts", "utf8");
const iframe = readFileSync("src/lets-database-view/map/iframe/main.ts", "utf8");

assert(meta.includes('title: "地图源"') &&
  meta.includes("OpenStreetMap 无需配置") &&
  !meta.includes("数据库地图视图共用底图来源。OSM 无需 Key") &&
  !meta.includes('title: "使用 API 2.0 地图"') &&
  !meta.includes('key: "map-amap-api2"'),
  "Map source description is user friendly and API2 toggle is no longer shown");
assert.equal((meta.match(/class="dodo-setting-api-link"/g) || []).length, 2,
  "Both AMap and Google API application links use the pill");
assert(meta.includes("https://console.amap.com/dev/key/app") &&
  meta.includes("https://console.cloud.google.com/google/maps-apis/credentials") &&
  item.includes(".config-name :global(a.dodo-setting-api-link)") &&
  item.includes("border: 1px solid var(--b3-theme-primary)") &&
  item.includes("border-radius: 999px") &&
  item.includes("a.dodo-setting-api-link:focus-visible"),
  "API links retain the original official destinations, a clear outline and visible focus");
assert(mapData.includes("useAmapApi2: value?.useAmapApi2 === true"),
  "Legacy saved API2 preference still loads without discarding data");
const helperStart = mapData.indexOf("export function shouldUseAmapApi2(");
const helperEnd = mapData.indexOf("export interface MapFieldMapping", helperStart);
assert(helperStart > 0 && helperEnd > helperStart, "Missing pure engine selection helper");
const helperTransformed = await transformWithEsbuild(
  mapData.slice(helperStart, helperEnd), "map-api2-helper.ts",
  {loader: "ts", format: "esm"}
);
const helperContext = {};
vm.runInNewContext(
  helperTransformed.code.replace(/export\s*\{[^}]*\};?/g, "").replace("export function shouldUseAmapApi2", "function shouldUseAmapApi2") +
  "\nthis.useApi2 = shouldUseAmapApi2;",
  helperContext
);
for (const [provider, key, expected] of [
  ["amap", "", false], ["amap", "   ", false],
  ["amap", "example-key", true],
  ["osm", "example-key", false], ["google", "example-key", false]
]) {
  assert.equal(helperContext.useApi2(provider, key), expected,
    "Incorrect JS API2 auto-selection for " + provider + " / " + key);
}
const start = iframe.indexOf("async function ensureMapEngine(");
const end = iframe.indexOf("function initLeaflet(", start);
assert(start > 0 && end > start);
const {code} = await transformWithEsbuild(
  iframe.slice(start, end), "map-engine-selection.ts", {loader:"ts",format:"esm"}
);
function engine({fail=false, failureInInit=false}={}) {
  const events = [];
  const env = {
    activeEngine:null, engineSignature:"", engineNotice:"", console:{warn(){}},
    shouldUseAmapApi2: helperContext.useApi2,
    destroyMapEngine() { events.push("destroy"); env.activeEngine = null; },
    initLeaflet(source) { events.push("tiles:"+source); env.activeEngine="leaflet"; },
    loadAmapApi: async key => {
      events.push("js2:"+key);
      if(fail) throw new Error("JS API 2.0 unavailable");
    },
    initAmapApi2() {
      events.push("amap-init");
      if(failureInInit) throw new Error("AMap.Map constructor failed");
      env.activeEngine="amap-api2";
    },
    loadGoogleApi: async () => { throw new Error("Should not request Google"); },
  };
  vm.runInNewContext(code+"\nthis.ensure = ensureMapEngine;",env);
  return {env,events};
}
{
  const {env,events}=engine();
  await env.ensure({mapSource:"amap",amapKey:"",useAmapApi2:true});
  assert.deepEqual(events,["destroy","tiles:amap"],
    "No key must use basic tiles regardless of the obsolete on setting");
  await env.ensure({mapSource:"amap",amapKey:"key1",useAmapApi2:false});
  assert.equal(env.activeEngine,"amap-api2");
  assert.deepEqual(events.slice(-3),["destroy","js2:key1","amap-init"],
    "With a key, JS API 2.0 should start regardless of obsolete off setting");
  await env.ensure({mapSource:"amap",amapKey:"key1",useAmapApi2:true});
  assert.equal(events.filter(x=>x==="js2:key1").length,1,
    "Changing the obsolete toggle should not reload maps");
}
for (const failureMode of [{fail:true},{failureInInit:true}]) {
  const {env,events}=engine(failureMode);
  await env.ensure({mapSource:"amap",amapKey:"bad-key",useAmapApi2:false});
  assert.equal(env.activeEngine,"leaflet");
  assert.equal(events.at(-1),"tiles:amap");
  assert(env.engineNotice.includes("基础地图"));
  const previousCount=events.length;
  await env.ensure({mapSource:"amap",amapKey:"bad-key",useAmapApi2:false});
  assert.equal(events.length,previousCount,
    "Do not reattempt failed JS2 on each data reload");
  assert(env.engineNotice.includes("基础地图"),"Fallback explanation must remain visible");
  await env.ensure({mapSource:"amap",amapKey:"new-key",useAmapApi2:false});
  assert.equal(events.filter(x=>x==="js2:new-key").length,1,
    "Changing the key should permit one new enhanced-map attempt");
}
assert(iframe.includes("wgs84ToGcj02(point.longitude, point.latitude)") &&
  iframe.includes("gcj02ToWgs84(mapLng, mapLat)"),
  "Existing WGS84/GCJ02 conversion paths stay intact");
console.log("PASS: friendly map settings, two API capsules, API2 auto-selection, once-only fallback and legacy compatibility");