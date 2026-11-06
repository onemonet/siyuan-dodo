import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

const metadataSource = await readFile("src/lets-database-view/plugin.ts","utf8");
const visualSource = await readFile("src/lets-database-view/visual/visual-view-service.ts","utf8");
const settingsSource = await readFile("src/lets-database-view/visual/visual-settings.ts","utf8");
const pluginSource = await readFile("src/lets-database-view/index.ts","utf8");
const documentStore = await readFile("src/lets-database-view/view-config-schema.ts","utf8");
const compiled = await transformWithEsbuild(metadataSource,"database-meta.ts",{loader:"ts",format:"esm"});
const metadata = (await import("data:text/javascript;base64,"+Buffer.from(compiled.code).toString("base64"))).default;

for(const [key,section] of [
  ["map-view-enabled","地图视图"],
  ["chart-view-enabled","图表视图"],
  ["timeline-view-enabled","时间线视图"],
  ["gantt-view-enabled","甘特视图"],
  ["calendar-view-enabled","日历视图"]
]){
  const item=metadata.settings.find(v=>v.key===key);
  assert.ok(item,"Missing switch "+key);
  assert.equal(item.type,"checkbox");
  assert.equal(item.value,true,"Existing installations should preserve enabled-by-default behavior");
  assert.equal(item.section,section);
  assert.ok(item.sectionDescription);
}
assert.match(pluginSource,/settings\.getBySpace\(this\.name, "chart-view-enabled"\) !== false/);
assert.match(pluginSource,/settings\.getBySpace\(this\.name, "timeline-view-enabled"\) !== false/);
assert.match(pluginSource,/if \(map \|\| chart \|\| timeline \|\| gantt \|\| calendar \|\| custom\) this\.visualViews\.start\(\)/);
assert.match(pluginSource,/else this\.visualViews\.stop\(\)/);
assert.match(visualSource,/disabled:!this\.isKindEnabled\(item\.id\)/);
assert.match(visualSource,/if\(!this\.isKindEnabled\(next\)\)/);
assert.match(visualSource,/if\(!this\.isKindEnabled\(kind\)\)return false/);
assert.match(settingsSource,/!this\.bridge\.isEnabled\(selected\.kind\)/);
const chartRenderer = await readFile("src/lets-database-view/visual/chart-renderer.ts","utf8");
assert.match(chartRenderer,/!bridge\.enabled\('chart'\) \|\| !mounted \|\| mounted\.kind !== "chart"/);
assert.match(settingsSource,/if \(!this\.bridge\.isEnabled\("chart"\)\) throw new Error\("图表视图已在插件配置中关闭。"\)/);
assert.match(settingsSource,/if \(!this\.bridge\.isEnabled\("timeline"\)\) throw new Error\("时间线视图已在插件配置中关闭。"\)/);

function extract(start,end){
  const a=visualSource.indexOf(start);
  const b=visualSource.indexOf(end,a);
  assert.ok(a>=0 && b>a,"Missing service code boundary "+start);
  return visualSource.slice(a,b);
}
const isKind=extract("  private isKindEnabled(", "  start(): void");
const scan=extract("  private async scan(): Promise<void>", "  /** A single entry in the leftmost");
const viewId="20261019163000-abcdefg";
const blockId="20261019163000-abcdefh";
const synthetic=[
  'const ID = /^\\d{14}-[a-z0-9]{7}$/;',
  'const TIMELINE_FIELD_DEFINITIONS = [];',
  'class Probe {',
  ' constructor(){this.running=true;this.map=true;this.chart=true;this.timeline=true;this.gantt=true;this.calendar=true;this.mounted=new Map();this.events=[];this.config={};}',
  ' isMapEnabled(){return this.map;}',
  ' isChartEnabled(){return this.chart;}',
  ' isTimelineEnabled(){return this.timeline;}',
  ' isGanttEnabled(){return this.gantt;}',
  ' isCalendarEnabled(){return this.calendar;}',
  ' currentView(header){return header.dataset.currentViewId;}',
  ' read(){return Promise.resolve({["'+viewId+'"]:this.config});}',
  ' ensurePicker(){this.events.push("picker");}',
  ' ensureSettingsButton(){this.events.push("settings");}',
  ' attach(av,blockId,viewId,kind){this.events.push("attach:"+kind);this.mounted.set(av,{kind});}',
  ' detach(av){this.events.push("detach");this.mounted.delete(av);}',
  ' async initializeChartMapping(){this.events.push("chart:init");return this.config;}',
  ' async initializeTimelineMapping(){this.events.push("timeline:init");return this.config;}',
  isKind,scan,
  '}',
  'export { Probe };'
].join("\n");
const transformed=await transformWithEsbuild(synthetic,"native-feature-probe.ts",{loader:"ts",format:"esm"});
const {Probe}=await import("data:text/javascript;base64,"+Buffer.from(transformed.code).toString("base64"));

const previousDocument=globalThis.document;
const header={dataset:{currentViewId:viewId},isConnected:true,
  querySelector:()=>({dataset:{avType:"table"}})};
const av={dataset:{nodeId:blockId,avId:"20261019163000-abcdefi"},isConnected:true,
  querySelector:()=>header,classList:{contains:()=>false}};
globalThis.document={querySelectorAll:()=>[av]};
try {
  const probe=new Probe();
  probe.config={kind:"chart",enabled:true,chart:{x:{column:"field-a"},y:{column:"field-b"}}};
  await probe.scan();
  assert.ok(probe.events.includes("attach:chart"));
  const saved=JSON.stringify(probe.config);
  probe.chart=false;probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("detach"),"Disabling chart must detach the active renderer");
  assert.ok(!probe.events.includes("attach:chart"));
  assert.equal(JSON.stringify(probe.config),saved,"Global setting must not overwrite per-view stored configuration");
  probe.chart=true;probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("attach:chart"),"Re-enabling chart must restore the view");
  probe.config={kind:"timeline",enabled:true,timeline:{fieldMapping:{title:"field-a",startDate:"field-b"}}};
  probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("attach:timeline"));
  probe.timeline=false;probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("detach"),"Disabling timeline must detach its renderer");
  assert.ok(!probe.events.includes("attach:timeline"));
  probe.timeline=true;probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("attach:timeline"),"Re-enabling timeline must restore the renderer");
  probe.config={kind:"calendar",enabled:true,calendar:{}};probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("attach:calendar"));
  probe.calendar=false;probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("detach"),"Disabling calendar must detach without discarding its mapping");
  probe.calendar=true;probe.events=[];
  await probe.scan();
  assert.ok(probe.events.includes("attach:calendar"),"Re-enabling calendar must restore native view");
  probe.config={kind:"chart",enabled:true,chart:{}};probe.chart=false;probe.events=[];
  await probe.scan();
  assert.ok(!probe.events.includes("chart:init"),
    "Disabling a view type must not initialize/overwrite bindings");
} finally {globalThis.document=previousDocument;}
assert.match(documentStore,/custom-dodo-views/);
console.log("PASS: separate map/chart/timeline/gantt/calendar switches default on; disabled views stop rendering without altering view configs; re-enable restores; picker and transitions honor switches");