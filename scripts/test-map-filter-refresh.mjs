import { databaseViewTestRuntime } from "./database-view-test-runtime.mjs";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { transformWithEsbuild } from "vite";
const src=await readFile("src/lets-database-view/map/map-view-service.ts","utf8");
const iframe=await readFile("src/lets-database-view/map/iframe/main.ts","utf8");
assert.match(await readFile("src/lets-database-view/core/view-host.ts", "utf8"),/element\.closest\("\.av__scroll, \.av__header"\)/,
  "Native AV header changes and scroll changes must refresh the current map");
assert.match(await readFile("src/lets-database-view/core/view-host.ts", "utf8"),/element === av \|\| element\.classList\.contains\("av__container"\)/,
  "Whole AV container replacements must count as data changes");
assert.match(src,/if \(current\.nativeScroll !== scroll\) \{[\s\S]{0,360}this\.scheduleReload\(av\)/,
  "Reusing a stable iframe after a filtered native table replacement must still fetch rows");
assert.match(src,/document\.addEventListener\("click", this\.handleFilterPanelClick, true\)/);
assert.match(src,/document\.addEventListener\("change", this\.handleFilterPanelChange, true\)/);
assert.match(src,/document\.addEventListener\("input", this\.handleFilterPanelChange, true\)/);
assert.match(src,/document\.removeEventListener\("click", this\.handleFilterPanelClick, true\)/);
assert.match(iframe,/viewID: databaseViewId/, "Native map refresh must select the real SiYuan view");
assert.match(iframe,/pageSize: 100000/, "Native map must request filtered view data, not fixed cached rows");
assert.match(iframe,/event\.data\?\.type === "dodoMapRefresh"[\s\S]{0,100}void reload\(\)/);

function between(from,to){
  const a=src.indexOf(from),b=src.indexOf(to,a);
  assert.ok(a>=0&&b>a,"Missing map method bounds "+from);
  return src.slice(a,b);
}
const startMethod=between('  start(): void {','  stop(): void {');
const filterMethods=between('  private handleFilterPanelClick =','  /** Block SiYuan');
const correctionMethods=between('  beginPointCorrection(', '  /** Broadcast coordinate');
const scheduleMethod=between('  private scheduleReload(', '  async toggleView(');
const wrapped=[
  await databaseViewTestRuntime(),
  "const DatabaseViewConfigStore = {subscribe:()=>()=>{}};",
  "const databaseViewWrites = {subscribe:()=>()=>{}};",
  'class TestMap {',
  startMethod,
  'refreshCount = 0;',
  'refresh() { this.refreshCount++; }',
  'running = true;',
  'attachments = new Map();',
  'reloadTimers = new Map();',
  'correctionMuteUntil = new Map();',
  'correctionsInFlight = new Set();',
  'filterReloadPending = new Set();',
  'activeFilterAv = null;',
  filterMethods,
  correctionMethods,
  scheduleMethod,
  '}',
  'this.TestMap = TestMap;',
].join("\n");
const built=(await transformWithEsbuild(wrapped,"map-filters-test.ts",{loader:"ts"})).code;
const chrome="C:/Program Files/Google/Chrome/Application/chrome.exe";
let available=true;
try{await access(chrome)}catch{available=false}
if(available){
  const dir=await mkdtemp(join(tmpdir(),"dodo-native-map-filter-"));
  const file=join(dir,"index.html");
  const script=[
    'const assert=(ok,message)=>{if(!ok)throw Error(message)};',
    'const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));',
    'async function run(){',
    'const blockId="20261019123456-abcdefg",viewId="20261019123456-abcdefh";',
    'const av=document.querySelector(".av");',
    'const controller=new TestMap();',
    'const messages=[];',
    'const fakeWindow={postMessage:message=>messages.push(message.type)};',
    'controller.attachments.set(av,{viewId,iframe:{isConnected:true,contentWindow:fakeWindow},host:{isConnected:true}});',
    'controller.handleFilterPanelClick({target:document.getElementById("filter-svg")});',
    'assert(controller.activeFilterAv===av,"Native filter button binds the map view");',
    'controller.handleFilterPanelClick({target:document.getElementById("popup-button")});',
    'await sleep(370);',
    'assert(messages.length===1&&messages[0]==="dodoMapRefresh","Filter popup click must post data refresh");',
    'controller.beginPointCorrection(blockId,viewId);',
    'controller.handleFilterPanelChange({target:document.getElementById("popup-input")});',
    'assert(controller.filterReloadPending.has(av),"Filter change during correction must be queued");',
    'await sleep(370);',
    'assert(messages.length===1,"Coordinate correction must not reload the map mid-write");',
    'controller.correctionMuteUntil.set(av,Date.now()+1200);',
    'controller.finishPointCorrection(blockId,viewId);',
    'await sleep(370);',
    'assert(messages.length===2,"Queued filter change must refresh after coordinate write");',
    'controller.scheduleReload(av);',
    'await sleep(370);',
    'assert(messages.length===2,"Correction-only native DOM noise must be muted");',
    'controller.scheduleReload(av,true);',
    'await sleep(370);',
    'assert(messages.length===3,"Real filter change must bypass the correction mute window");',
    'controller.attachments.clear();',
    'controller.scheduleReload(av,true);',
    'await sleep(370);',
    'assert(messages.length===3,"Detached map must never receive a refresh");',
    'controller.attachments.set(av,{viewId,iframe:{isConnected:true,contentWindow:fakeWindow},host:{isConnected:true}});',
    'controller.correctionMuteUntil.clear();',
    'controller.running=false;',
    'controller.start();',
    'assert(controller.refreshCount===1,"Starting the AV observer schedules initial scan");',
    'const beforeHeader=messages.length;',
    'document.querySelector(".av__header").append(document.createElement("span"));',
    'await sleep(370);',
    'assert(messages.length===beforeHeader+1,"Native AV header rerender must refresh map rows");',
    'const beforeContainer=messages.length;',
    'const newContainer=document.createElement("div");newContainer.className="av__container";',
    'av.append(newContainer);',
    'await sleep(370);',
    'assert(messages.length===beforeContainer+1,"Native AV container replacement must refresh map rows");',
    'controller.unsubscribeHost();',
    'document.removeEventListener("click",controller.handleFilterPanelClick,true);',
    'document.removeEventListener("change",controller.handleFilterPanelChange,true);',
    'document.removeEventListener("input",controller.handleFilterPanelChange,true);',
    'document.body.dataset.result="PASS";',
    '}',
    'run().catch(error=>{document.body.dataset.result="FAIL";document.body.dataset.error=error.message;});',
  ].join("\n");
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<div class="av" data-av-id="20261019123456-abcdefi" data-node-id="20261019123456-abcdefg">',
    '<div class="av__header"><span data-type="av-filter"><svg id="filter-svg"></svg></span></div></div>',
    '<div class="av__panel"><button id="popup-button">筛选</button><input id="popup-input"></div>',
    '<script>',built,script,'</script></body></html>',
  ].join("\n");
  try{
    await writeFile(file,html);
    const dump=execFileSync(chrome,[
      "--headless=new","--no-first-run","--disable-gpu","--disable-extensions",
      "--disable-background-networking","--virtual-time-budget=5000",
      "--dump-dom",pathToFileURL(file).href
    ],{encoding:"utf8",timeout:15000,stdio:["ignore","pipe","ignore"]});
    assert.match(dump,/data-result="PASS"/,
      "Native map filter UI regression: "+(dump.match(/data-error="([^"]+)/)?.[1]||"no result"));
  } finally {await rm(dir,{recursive:true,force:true})}
}
console.log("PASS: native filter popover and AV changes re-fetch view rows; correction-only events muted and concurrent filter changes queued");