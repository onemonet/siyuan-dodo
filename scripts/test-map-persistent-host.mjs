import { databaseViewTestRuntime } from "./database-view-test-runtime.mjs";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { transformWithEsbuild } from "vite";

const src = await readFile("src/lets-database-view/map/map-view-service.ts", "utf8");
const css = await readFile("src/lets-database-view/database-view.css", "utf8");

assert.match(css, /dodo-av-map--active[\s\S]{0,350}flex-direction:\s*column/);
assert.match(src, /av\.append\(mapHost\)/, "Persistent host must live outside the kernel-owned AV container");
assert.match(src, /url\.searchParams\.set\("v", "20261105-locate-existing"\)/, "Map iframe HTML must bypass stale asset cache");
assert.doesNotMatch(src, /current\.nativeScroll === scroll && current\.host\.isConnected/,
  "Scroll replacements must not force iframe recreation");
const start = src.indexOf("  private async scan(): Promise<void> {");
const end = src.indexOf("  async toggleView(", start);
assert.ok(start > 0 && end > start, "Extract actual scan, attach, detach and scheduling logic");
const methods = src.slice(start, end).replace(
  "const url = new URL(MAP_IFRAME_PATH, window.location.origin);",
  'const url = new URL("about:blank");'
);
const harnessSource = [
  await databaseViewTestRuntime(),
  'const BLOCK_ID = /^\\d{14}-[a-z0-9]{7}$/;',
  'const MAP_HOST_CLASS = "dodo-av-map-host";',
  'const MAP_IFRAME_CLASS = "dodo-av-map-frame";',
  'const MAP_ADD_CLASS = "dodo-av-map-add";',
  'const MAP_SETTINGS_CLASS = "dodo-av-map-settings";',
  'const MAP_ACTIONS_CLASS = "dodo-av-map-actions";',
  'const normalizePreviewHeight = () => 520;',
  'class Harness {',
  'running = true;',
  'lifecycle = new ViewMountLifecycle(entry => entry.iframe, (av, entry) => this.cleanupAttachment(av, entry));',
  'attachments = this.lifecycle.entries;',
  'reloadTimers = new Map();',
  'correctionMuteUntil = new Map();',
  'correctionsInFlight = new Set();',
  'filterReloadPending = new Set();',
  'configs = new Map();',
  'async readConfigs(blockId) { return this.configs.get(blockId) || {}; }',
  'async openSettings() {}',
  methods,
  '}',
  'this.Harness = Harness;',
].join("\n");
const transformed = (await transformWithEsbuild(harnessSource, "harness.ts", { loader: "ts" })).code;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let available = true;
try { await access(chrome); } catch { available = false; }
if (available) {
  const dir = await mkdtemp(join(tmpdir(), "dodo-map-stable-host-"));
  const file = join(dir, "index.html");
  const testScript = [
    'const check=(truth,msg)=>{ if(!truth)throw Error(msg); };',
    'const blockId="20261019111111-abcdefg", viewId="20261019111111-abcdefh";',
    'const markup=() => {',
    ' const container=document.createElement("div");',
    ' container.className="av__container";',
    ' container.innerHTML = \u0027<div class="av__header" data-current-view-id="20261019111111-abcdefh"><div class="layout-tab-bar"><div class="item item--focus" data-id="20261019111111-abcdefh" data-av-type="table"></div></div></div><div class="av__scroll"></div>\u0027;',
    ' return container;',
    '};',
    'async function run(){',
    ' const av=document.getElementById("test-av");',
    ' const manager=new Harness();',
    ' manager.configs.set(blockId,{[viewId]:{height:520}});',
    ' await manager.scan();',
    ' const attached=manager.attachments.get(av);',
    ' check(attached && attached.iframe.isConnected,"Map should mount initially");',
    ' check(attached.host.parentElement===av,"Map host must be outside .av__container");',
    ' check(getComputedStyle(av).flexDirection==="column","Map and SiYuan header must stack vertically");',
    ' check(Math.abs(attached.host.getBoundingClientRect().width-1120)<=1,"Map host should fill editor width");',
    ' const initialFrame=attached.iframe;',
    ' await new Promise(resolve=>setTimeout(resolve,90));',
    ' initialFrame.contentWindow.__mapKernelIdentity=41;',
    ' const oldScroll=av.querySelector(".av__scroll");',
    ' const newScroll=document.createElement("div");newScroll.className="av__scroll";',
    ' oldScroll.replaceWith(newScroll);',
    ' await manager.scan();',
    ' check(manager.attachments.get(av).iframe===initialFrame,"Scroll replacement must reuse iframe");',
    ' check(newScroll.style.display==="none","New native scroll should remain hidden");',
    ' check(initialFrame.contentWindow.__mapKernelIdentity===41,"Scroll replacement must preserve browsing context");',
    ' const native=av.querySelector(".av__container");native.remove();',
    ' await manager.scan();',
    ' check(manager.attachments.get(av).iframe===initialFrame,"Transiently missing native header must not detach iframe");',
    ' av.insertBefore(markup(),av.firstChild);await manager.scan();',
    ' check(manager.attachments.get(av).iframe===initialFrame,"Entire native container replacement must reuse iframe");',
    ' check(initialFrame.contentWindow.__mapKernelIdentity===41,"Container replacement must keep map engine alive");',
    ' check(av.querySelector(".av__scroll").style.display==="none","Replaced AV body must be hidden");',
    ' check(Math.abs(attached.host.getBoundingClientRect().width-1120)<=1,"Retained map host stays full width");',
    ' const header=av.querySelector(".av__header");',
    ' header.dataset.currentViewId="20261019111111-abcdefi";',
    ' const item=header.querySelector(".item");item.dataset.id="20261019111111-abcdefi";',
    ' await manager.scan();',
    ' check(!manager.attachments.has(av),"Real view switches must detach map");',
    ' check(!initialFrame.isConnected,"Real switch removes iframe");',
    ' check(av.querySelector(".av__scroll").style.display==="","Real switch restores native scroll");',
    ' document.body.dataset.status="PASS";',
    '}',
    'run().catch(error=>{document.body.dataset.status="FAIL";document.body.dataset.error=error.message;});',
  ].join("\n");
  const html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>.protyle-wysiwyg{width:1120px}.av{display:flex;max-width:100%;box-sizing:border-box}',
    css, '</style></head><body>',
    '<main class="protyle-wysiwyg">',
    '<div class="av" id="test-av" data-node-id="20261019111111-abcdefg" data-av-id="20261019111111-abcdefj">',
    '<div class="av__container"><div class="av__header" data-current-view-id="20261019111111-abcdefh">',
    '<div class="layout-tab-bar"><div class="item item--focus" data-id="20261019111111-abcdefh" data-av-type="table"></div></div>',
    '</div><div class="av__scroll"></div></div></div></main>',
    '<script>', transformed, testScript, '</script></body></html>',
  ].join("\n");
  try {
    await writeFile(file, html);
    const rendered = execFileSync(chrome, [
      "--headless=new", "--no-first-run", "--disable-gpu", "--disable-extensions",
      "--disable-background-networking", "--virtual-time-budget=2500",
      "--dump-dom", pathToFileURL(file).href,
    ], { encoding: "utf8", timeout: 18000, stdio: ["ignore","pipe","ignore"] });
    assert.match(rendered, /data-status="PASS"/,
      "Live browser DOM lifecycle failed: " +
      (rendered.match(/data-error="([^"]+)/)?.[1] || "no assertion result"));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
console.log("PASS: native AV scroll/header/whole-container replacement preserves iframe and map state; full width maintained; real view switch detaches");