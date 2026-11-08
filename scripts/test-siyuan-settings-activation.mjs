import assert from "node:assert/strict";
import { build } from "esbuild";

const sectionKeys = {
  "custom-block": ["math-enabled", "toggle-enabled", "sql-enabled", "gallery-enabled"],
  "database-view": [
    "custom-view-enabled", "map-view-enabled", "chart-view-enabled",
    "gantt-view-enabled", "calendar-view-enabled", "timeline-view-enabled",
  ],
};
const raw = {
  "custom-block": Object.fromEntries(sectionKeys["custom-block"].map(key => [key,false])),
  "database-view": {
    ...Object.fromEntries(sectionKeys["database-view"].map(key => [key,false])),
    "map-search-enabled": false, "map-provider": "amap",
  },
};
globalThis.__dodoSettingsTest = raw;
globalThis.__dodoSaved = null;
const files = {
  "siyuan": "export const fetchSyncPost = async()=>{};",
  "./utils": 'export const plugin = {data:{"dodo-config":globalThis.__dodoSettingsTest},loadData:async()=>{},saveData:async(k,v)=>{globalThis.__dodoSaved=structuredClone(v)},removeData:async()=>{}};',
  "./plugin-registry": 'export const PluginRegistry={getInstance:()=>({getPluginConfigs:()=>[{name:"custom-block",settings:[{key:"math-enabled",type:"checkbox",value:true}]},{name:"database-view",settings:[{key:"map-view-enabled",type:"checkbox",value:true},{key:"map-search-enabled",type:"checkbox",value:true}]}]})};',
  "./logger": "export const createLogger = ()=>({debug:()=>{},warn:()=>{}});",
  "./setting-schema": 'export const buildDefaultSettingsConfig=()=>({});export const normalizeSettingsConfig=(saved,schemas)=>Object.fromEntries(schemas.map(schema=>[schema.name,{...(saved[schema.name]||{})}]));',
};
const result = await build({
  entryPoints:["src/settings.ts"],
  bundle:true,write:false,format:"esm",platform:"node",logLevel:"silent",
  plugins:[{
    name:"setting-store-mock",
    setup(builder) {
      builder.onResolve({
        filter:/^(siyuan|\.\/utils|\.\/plugin-registry|\.\/logger|\.\/setting-schema)$/,
      }, args=>({path:args.path,namespace:"setting-store-mock"}));
      builder.onLoad({filter:/.*/,namespace:"setting-store-mock"},
        args=>({contents:files[args.path],loader:"js"}));
    },
  }],
});
const encoded = Buffer.from(result.outputFiles[0].text).toString("base64");
const {settings} = await import("data:text/javascript;base64,"+encoded);
await settings.load();
for (const [space, keys] of Object.entries(sectionKeys)) {
  for (const key of keys) {
    assert.equal(settings.getBySpace(space,key),true, "Hidden flag still disables: "+space+"/"+key);
  }
}
assert.equal(settings.getBySpace("database-view","map-search-enabled"),false);
assert.equal(settings.getBySpace("database-view","map-provider"),"amap");
await settings.save();
assert.equal(globalThis.__dodoSaved["database-view"]["map-search-enabled"],false);
settings.setBySpace("custom-block","math-enabled",false);
await settings.save();
assert.equal(globalThis.__dodoSaved["custom-block"]["math-enabled"],true);
console.log("PASS: previous disabled section flags migrate to enabled, map-search and other settings preserved");