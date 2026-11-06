import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const load = async entry => {
  const compiled = await build({entryPoints:[entry],bundle:true,write:false,platform:"node",
    format:"esm",target:"es2022",logLevel:"silent",loader:{".svg":"text"}});
  return import("data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
};
const { prepareVisualConfigs, visualAppearance } = await load("src/lets-database-view/visual/visual-initializers.ts");
const { visualMountPolicies } = await load("src/lets-database-view/visual/visual-mount-policies.ts");
const kinds = ["calendar","chart","custom","gantt","timeline"];
assert.deepEqual(Object.keys(visualAppearance).sort(),kinds);
assert.deepEqual(Object.keys(visualMountPolicies).sort(),kinds);
for(const kind of kinds) assert.ok(visualAppearance[kind].name && visualAppearance[kind].iconFile);
const id = c => "20261023123456-" + c.repeat(7);
const raw = {view:{columns:[
  {id:id("a"),name:"任务",type:"block"},
  {id:id("b"),name:"截止时间",type:"date"},
  {id:id("c"),name:"统计",type:"number"},
  {id:id("d"),name:"状态",type:"select"},
],rows:[]}};
const chart = prepareVisualConfigs("chart",{},raw);
assert.equal(chart.chart.y.column,id("c"));
assert.equal(chart.chart.x.column,id("a"));
assert.throws(() => prepareVisualConfigs("chart",{}, {view:{columns:[
  {id:id("b"),name:"无数字",type:"date"},
]}}), /数字或多选列/);
const savedChart={chart:{type:"pie-basic",y:{column:id("c"),agg:"sum"},height:700}};
assert.deepEqual(prepareVisualConfigs("chart",savedChart,raw),savedChart,
  "Returning to a configured chart does not erase its chosen chart type");
const gantt = prepareVisualConfigs("gantt",{},raw).gantt;
assert.equal(gantt.progressMax,100);
assert.equal(gantt.timeStep,0);
assert.equal(gantt.demo,false);
assert.equal(gantt.fieldMapping.start,id("b"));
assert.equal(prepareVisualConfigs("gantt",{gantt:{...gantt,timeStep:15,progressMax:1}},raw)
  .gantt.timeStep,15);
assert.equal(prepareVisualConfigs("calendar",{},raw).calendar.defaultView,"dayGridMonth");
assert.equal(prepareVisualConfigs("calendar",{calendar:{defaultView:"timeGridWeek"}},raw)
  .calendar.defaultView,"timeGridWeek");
assert.ok(prepareVisualConfigs("timeline",{},raw).timeline.fieldMapping,
  "First-use timeline mapping is prepared by its own initializer");
const firstDate = prepareVisualConfigs("calendar",{},raw);
assert.deepEqual(prepareVisualConfigs("chart",savedChart,undefined),{},
  "Deactivating the same visual kind must not change saved chart fields");
assert.ok(firstDate.calendar.fieldMapping);
assert.equal(visualMountPolicies.gantt.outsideAv,true);
assert.equal(visualMountPolicies.calendar.outsideAv,true);
assert.equal(visualMountPolicies.custom.outsideAv,true);
assert.equal(visualMountPolicies.custom.url(),"about:blank");
assert.equal(visualMountPolicies.timeline.outsideAv,true,
  "Timeline iframe stays a stable sibling so navigation does not destroy its current slide");
assert.equal(visualMountPolicies.chart.outsideAv,false);
assert.equal(visualMountPolicies.chart.height({chart:{height:700}}),"700px");
assert.equal(visualMountPolicies.calendar.height(),"720px");

const priorLocation = globalThis.location;
globalThis.location={origin:"http://localhost"};
try {
  assert.equal(visualMountPolicies.chart.url({blockId:id("z"),viewId:id("v"),avID:id("a"),search:""}),
    "/plugins/siyuan-dodo/preview/chart/chart-iframe.html");
  const timelineUrl = new URL(visualMountPolicies.timeline.url({
    blockId:id("z"),viewId:id("v"),avID:id("a"),search:"中文",
  }));
  assert.equal(timelineUrl.searchParams.get("viewId"),id("v"));
  assert.equal(timelineUrl.searchParams.get("avID"),id("a"));
  assert.equal(timelineUrl.searchParams.get("query"),"中文");
} finally {globalThis.location=priorLocation;}

let callback, observes=0, disconnects=0;
const oldObserver=globalThis.ResizeObserver;
globalThis.ResizeObserver=class {
  constructor(fn){callback=fn;}
  observe(){observes++;}
  disconnect(){disconnects++;}
};
let ready=false,renders=0;
const preview={querySelector:()=>ready?{}:null,getBoundingClientRect:()=>({height:500})};
const frame={style:{height:"720px"},contentDocument:{querySelector:()=>preview}};
const mounted={frame};
try{
  visualMountPolicies.calendar.loaded(mounted,()=>renders++);
  assert.equal(renders,1,"Calendar renderer starts even before dimensions stabilize");
  assert.equal(frame.style.height,"720px","Never shrink the frame on the initial empty month");
  ready=true;callback();
  assert.equal(frame.style.height,"508px");
  callback();assert.equal(frame.style.height,"508px","Sub-pixel feedback must not jitter");
  assert.equal(observes,1);
  mounted.resizeObserver.disconnect();
  assert.equal(disconnects,1);
}finally{globalThis.ResizeObserver=oldObserver;}

const controller = readFileSync("src/lets-database-view/visual/visual-view-service.ts","utf8");
assert.match(controller,/Object\.entries\(visualRenderers\)/);
assert.match(controller,/prepareVisualConfigs\(kind,/);
assert.match(controller,/visualMountPolicies\[kind\]/);
assert.match(controller,/Object\.values\(visualInteractions\)/);
console.log("PASS: five independent view defaults and identity, stable iframe policies, calendar resize guard and registration-based render/message dispatch");

