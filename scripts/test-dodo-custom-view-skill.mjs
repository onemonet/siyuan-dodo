import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourceRoot = "skills/dodo-custom-view";
const skill = readFileSync(sourceRoot + "/SKILL.md", "utf8");
assert.match(skill, /^---\r?\nname: dodo-custom-view\r?\n/);
assert.match(skill, /description:/);
assert.match(skill, /save_source/);
assert.match(skill, /expectedVersion/);
assert.match(skill, /do not|Do not/i);
assert.match(skill, /style|visual|风格/i);
assert.match(skill, /dodo-database\.custom\.current/);
assert.match(skill, /dodo-database\.custom\.create/);
assert.match(skill, /frontend-design/);
assert.match(skill, /web-artifacts-builder/);
assert.match(skill, /theme-factory/);
assert.match(skill, /reference\(\{topic:"themes"\}\)/);
assert.match(skill, /reference\(\{topic:"builder"\}\)/);
assert.match(skill, /createPaginator/);
assert.match(skill, /native AV|nativePageSize|原生|条目数/);
assert.match(skill, /echarts\.init/);
assert.match(skill, /dodo-echarts/);
assert.match(skill, /\?style=thumb/);
assert.match(skill, /full-size|original quality|原图|original.*resolution/i);
assert.match(skill, /searchParams\.delete\('style'\)/);
assert.match(skill, /no sandbox/);
assert.match(skill, /createRecord/);
assert.match(skill, /preventDefault/);

const expectedReferences = ["runtime", "design", "themes", "builder", "examples", "checklist", "basecoat", "web-awesome"];
for (const topic of expectedReferences) {
  const ref = readFileSync(sourceRoot + "/references/" + topic + ".md", "utf8");
  assert(ref.length > 700, topic + " reference missing or empty");
  if (topic === "runtime") {
    assert.match(ref, /\/stage\/protyle\/js\/echarts\/echarts\.min\.js/);
    assert.match(ref, /ResizeObserver/);
    assert.match(ref, /dodoDB\.createPaginator/);
    assert.match(ref, /nativePageSize/);
    assert.match(ref, /assets\/cover\.png\?style=thumb/);
    assert.match(ref, /thumbnail.*original|original.*thumbnail/i);
    assert.match(ref, /searchParams\.set\('style', 'thumb'\)/);
    assert.match(ref, /no.*sandbox|no.*CSP|unrestricted same-origin/i);
    assert.match(ref, /dodoDB\.createRecord/);
  }
  if (topic === "design") {
    assert.match(ref, /two.pass|Pass A|Pass B/i);
    assert.match(ref, /frontend-design/);
    assert.match(ref, /prefers-reduced-motion/);
  }
  if (topic === "themes") {
    assert.match(ref, /theme-factory/);
    assert.match(ref, /Ocean Depths/);
    assert.match(ref, /Midnight Galaxy/);
    assert.match(ref, /--accent/);
    assert.match(ref, /ECharts/);
    assert.match(ref, /user.*style|user.*subject|user style|user's subject/i);
  }
  if (topic === "builder") {
    assert.match(ref, /web-artifacts-builder/);
    assert.match(ref, /React.*TypeScript/);
    assert.match(ref, /shadcn/);
    assert.match(ref, /save_source/);
    assert.match(ref, /initialized = true/);
    assert.match(ref, /dodoDB\.createPaginator\(\)/);
    assert.match(ref, /pager\.next\(\)/);
    assert.match(ref, /102400/);
    assert.match(ref, /single|one HTML|one deliverable/i);
    assert.match(ref, /scripts\/bundle-artifact\.sh/);
  }
}
// Agent tool metadata should expose the image-size decision before saving HTML.
const toolSource = readFileSync("src/lets-database-view/custom/agent-tools.ts","utf8");
assert.match(toolSource, /read_me[\s\S]{0,450}style=thumb/);
assert.match(toolSource, /save_source[\s\S]{0,600}style=thumb/);
assert.match(toolSource, /import themesGuide from/);
assert.match(toolSource, /import builderGuide from/);
assert.match(toolSource, /createPaginator/);
assert.match(toolSource, /sole batch-size|only batch|唯一|only batch-size|sole source|native AV/);
const original = new URL("assets/cover.png?token=test&style=thumb", "http://127.0.0.1:6806/");
original.searchParams.delete("style");
const thumbnail = new URL(original);
thumbnail.searchParams.set("style", "thumb");
assert.equal(original.pathname, thumbnail.pathname);
assert.equal(original.searchParams.has("style"), false);
assert.equal(thumbnail.searchParams.get("style"), "thumb");
assert.equal(original.searchParams.get("token"), "test");
assert.equal(thumbnail.searchParams.get("token"), "test");
const result = await build({
  entryPoints: ["src/lets-database-view/custom/agent-tools.ts"],
  outfile: "tmp/test-dodo-custom-view-skill.mjs",
  bundle: true, format: "esm", platform: "node", logLevel: "silent",
  plugins: [
    { name: "raw-skill-source", setup(builder) {
      builder.onResolve({filter:/\.md\?raw$/}, args =>
        ({path: resolve(dirname(args.importer), args.path.slice(0, -4)), namespace:"skill-raw"}));
      builder.onLoad({filter:/.*/,namespace:"skill-raw"}, args =>
        ({contents:"export default " + JSON.stringify(readFileSync(args.path, "utf8")) + ";", loader:"js"}));
    }},
    { name: "stub-kernel-deps", setup(builder) {
      builder.onResolve({filter:/^\.\.\/view-config-store$|^\.\.\/core\/view-host$|^\.\/storage$|^\.\/data-service$|^\.\/current-target$/},
        args => ({path:args.path,namespace:"kernel-stub"}));
      builder.onLoad({filter:/.*/,namespace:"kernel-stub"},()=>({loader:"js",contents:`
        export const DatabaseViewConfigStore = {load:async()=>({views:{
          "20261104000000-bbbbbbb": globalThis.__customViewState
        }})};
        export const currentNativeView = ()=>"";
        export const currentDatabaseTarget = ()=>globalThis.__customViewTarget;
        export const getCustomApp = async()=>({html:"<!doctype html><h1>existing</h1>",manifest:{version:3}});
        export const saveCustomApp = async()=>({});
        export const listCustomVersions = async()=>([]);
        export const restoreCustomVersion = async()=>({});
        export const getCustomSchema = async()=>({
          blockId:globalThis.__customViewTarget.blockId,
          avID:globalThis.__customViewTarget.avID,
          viewId:globalThis.__customViewTarget.viewId,
          fields:[{id:"20261104000000-ddddddd",name:"名称",type:"block"}],
          pageSize:25,batchSize:25,all:false,
          name:"Test DB"});
        export const listCustomRecords = async(_ctx,opts)=>({page:1,pageSize:25,nativePageSize:25,
          total:1,records:[{id:"20261104000000-eeeeeee",values:{}}]});
      `}));
    }},
  ],
});
assert(result.errors.length === 0);
const { registerCustomViewAgentCapabilities } =
  await import("../tmp/test-dodo-custom-view-skill.mjs");
const capabilities = new Map();
const fakePlugin = {addAgentCapability(cap){
  assert(!capabilities.has(cap.name), "Duplicate Agent capability " + cap.name);
  capabilities.set(cap.name, cap);
}};
let active = true;
const blockId="20261104000000-aaaaaaa",viewId="20261104000000-bbbbbbb",
  avID="20261104000000-ccccccc";
globalThis.__customViewTarget={blockId,viewId,avID,viewName:"测试视图",search:""};
globalThis.__customViewState={mode:"table",configs:{}};
let creates=0;
assert(registerCustomViewAgentCapabilities(fakePlugin,()=>active,()=>{},
  async()=>{
    if (globalThis.__customViewState.mode !== "custom") {
      creates++;globalThis.__customViewState={mode:"custom",configs:{
        custom:{appId:"app-11111111-2222-3333-4444-555555555555",allowWrites:false}}};
    }
    return viewId;
  }));
assert.equal(capabilities.size, 11,
  "Seven existing database tools, current/create and two Skill docs");
const current=capabilities.get("dodo-database.custom.current");
const create=capabilities.get("dodo-database.custom.create");
assert(current?.effects.localRead);
assert(create?.effects.localWrite);
const initial=(await current.handler()).structuredContent.data;
assert.equal(initial.mode,"table");
assert.equal(initial.blockId,blockId);
assert.equal(initial.records.length,1);
assert.equal(initial.pageSize,25);
assert.equal(initial.batchSize,25);
assert.equal(initial.all,false);
assert.equal(initial.canCreateCustomView,true);
assert.equal(initial.html,undefined);
const created=(await create.handler({blockId,viewId,avID})).structuredContent.data;
assert.equal(created.mode,"custom");
assert.match(created.html,/existing/);
assert.equal(created.version,3);
assert.equal(creates,1);
assert.equal((await create.handler({blockId,viewId,avID})).structuredContent.data.appId,created.appId);
assert.equal(creates,1,"Repeated create must not toggle the custom view off");
assert.match((await create.handler({blockId,viewId,avID:"wrong"})).error,/切换/);

const readMe = capabilities.get("dodo-database.custom.read_me");
const reference = capabilities.get("dodo-database.custom.reference");
assert(readMe?.effects.localRead);
assert(reference?.effects.localRead);
assert.deepEqual(reference.inputSchema.properties.topic.enum, expectedReferences);
assert.equal((await readMe.handler()).result, skill);
assert.match(readMe.description, /frontend-design/);
assert.match(readMe.description, /theme-factory/);
assert.match(readMe.description, /web-artifacts-builder/);
for(const topic of expectedReferences) {
  const body = (await reference.handler({topic})).result;
  assert.equal(body, readFileSync(sourceRoot + "/references/" + topic + ".md","utf8"));
}
assert.match((await reference.handler({topic:"wrong"})).error,/topic/);
active = false;
assert.match((await readMe.handler()).error,/关闭/);
assert.match((await reference.handler({topic:"design"})).error,/关闭/);
const saveHelp = capabilities.get("dodo-database.custom.save_source");
assert.match(saveHelp.description, /reference\(design\|themes\)/);
assert.match(saveHelp.description, /reference\(builder\)/);
console.log("PASS: dodo-custom-view Skill, 11 native capabilities, frontend-design/theme-factory/web-artifacts-builder references, current auto-read, safe save");
