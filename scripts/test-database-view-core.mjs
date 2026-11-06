import assert from "node:assert/strict";
import { build } from "esbuild";

const load = async entry => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: "node", format: "esm", target: "es2022", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
};
const { DatabaseViewHost } = await load("src/lets-database-view/core/view-host.ts");
const { DATABASE_VIEW_DEFINITIONS } = await load("src/lets-database-view/view-registry.ts");
const kernel = await load("src/shared/av/kernel-api.ts");
assert.equal(new Set(DATABASE_VIEW_DEFINITIONS.map(item => item.id)).size, 7);

// Minimal native DOM protocol: the host only depends on these methods.
let observerCount = 0, disconnects = 0, callback, bodyObserverOptions;
globalThis.MutationObserver = class {
  constructor(fn) { callback = fn; observerCount++; }
  observe(target, options) { if (target === globalThis.document.body) bodyObserverOptions = options; }
  disconnect() { disconnects++; }
};
const head = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { body: {}, documentElement: {}, head };
const host = new DatabaseViewHost();
let scans = 0, changes = 0, themes = 0;
const listener = { scan: () => scans++, changed: () => changes++, theme: () => themes++ };
const unsubscribe = host.subscribe(listener);
const unsubscribeSecond = host.subscribe({ ...listener });
assert.equal(observerCount, 1, "map and visual renderers share one observer");
assert.equal(bodyObserverOptions.attributes,true,
  "Native AV switch can change focused-tab class or current-view-id without replacing DOM");
assert(bodyObserverOptions.attributeFilter.includes("class"));
assert(bodyObserverOptions.attributeFilter.includes("data-current-view-id"));
const makeFrame = () => {
  const header = { dataset: { currentViewId: "view" }, querySelector: () => ({ dataset: { avType: "table" } }) };
  const av = { isConnected: true, dataset: { nodeId: "block", avId: "av" }, querySelector: () => header };
  const frame = { isConnected: true, contentWindow: {} };
  const surface = { isConnected: true };
  host.track(av, "view", "chart", surface, frame);
  return { av, frame, surface, header };
};
const first = makeFrame(), second = makeFrame();
assert.equal(host.fromSource(null), null);
assert.equal(host.fromSource({}), null, "unregistered source is ignored");
assert.equal(host.fromSource(first.frame.contentWindow, "map"), null);
assert.equal(host.fromSource(first.frame.contentWindow, "chart").av, first.av);
const firstRead = host.beginRead(first.frame), secondRead = host.beginRead(second.frame);
assert.ok(firstRead() && secondRead());
const newestRead = host.beginRead(first.frame);
assert.equal(firstRead(), false, "older response cannot overwrite the new request");
assert.ok(newestRead() && secondRead(), "separate split instances have independent tickets");
host.invalidate("block", "view");
assert.equal(newestRead(), false);
assert.equal(secondRead(), false, "shared config changes invalidate both instances");
const beforeSwitch = host.beginRead(first.frame);
first.header.dataset.currentViewId = "another";
assert.equal(beforeSwitch(), false);
assert.equal(host.fromSource(first.frame.contentWindow), null, "inactive view cannot send commands");
first.header.dataset.currentViewId = "view";
first.header.querySelector = () => ({ dataset: { avType: "kanban" } });
assert.equal(host.fromSource(first.frame.contentWindow), null, "an explicit native non-table view cannot send commands");
first.header.querySelector = () => ({ dataset: { avType: "table" } });
const beforeReplace = host.beginRead(first.frame);
first.av.isConnected = false;
assert.equal(beforeReplace(), false);
const replacement = { ...first.av, isConnected: true };
host.track(replacement, "view", "chart", first.surface, first.frame);
assert.ok(beforeReplace(), "adopted stable frame may finish reading the same database/view");
assert.equal(host.fromSource(first.frame.contentWindow).av, replacement);
replacement.dataset = { nodeId: "block", avId: "different-av" };
assert.equal(beforeReplace(), false, "changed AV identity invalidates a request");
replacement.dataset.avId = "av";
const beforeDetach = host.beginRead(first.frame);
host.untrack(first.frame);
assert.equal(beforeDetach(), false);
assert.equal(host.fromSource(first.frame.contentWindow), null);

const native = { nodeType: 1, closest: selector => selector === "head" ? null :
  selector === ".av[data-av-id]" ? second.av : selector === ".av__scroll, .av__header" ? {} : null };
callback([{ target: native, type: "childList", addedNodes: [], removedNodes: [] }]);
assert.equal(scans, 2);
assert.equal(changes, 2);
// Native tab switches may mutate only attributes, which the previous DOM-only
// observer missed until a full document navigation. Such changes MUST rescan.
const switchNode = matches => ({
  nodeType: 1,
  matches,
  closest: selector => selector === "head" ? null :
    selector === ".av[data-av-id]" ? second.av :
    selector === ".av__scroll, .av__header" ? {} : null,
});
const nativeTab=switchNode(selector=>selector === ".layout-tab-bar .item");
callback([{ target:nativeTab, type:"attributes", attributeName:"class",
  addedNodes:[],removedNodes:[] }]);
assert.equal(scans,4,"focused native view tab must trigger a scan for both listeners");
assert.equal(changes,4,"view switch must trigger mounted frame reconciliation");
const nativeHeader=switchNode(selector=>selector === ".av__header");
callback([{ target:nativeHeader, type:"attributes", attributeName:"data-current-view-id",
  addedNodes:[],removedNodes:[] }]);
assert.equal(scans,6);
assert.equal(changes,6);
const unrelated=switchNode(()=>false);
callback([{ target:unrelated, type:"attributes", attributeName:"class",
  addedNodes:[],removedNodes:[] }]);
assert.equal(scans,6,"ordinary database row/hover class changes must not trigger a full rescan");
callback([{ target: { nodeType: 1, closest: selector => selector === "head" ? head : null },
  addedNodes: [], removedNodes: [] }]);
assert.equal(themes, 2);
unsubscribe();
assert.equal(disconnects, 0);
unsubscribeSecond();
assert.equal(disconnects, 1, "last renderer unsubscribes the observer");

let request;
const raw = { view: { columns: [{ id: "date", type: "date" }], rows: [
  { id: "row", cells: [{ value: { date: { content: 123, isNotTime: false } } }] },
] } };
globalThis.fetch = async (url, options) => {
  request = { url, body: JSON.parse(options.body) };
  return { ok: true, json: async () => ({ code: 0, data: raw }) };
};
assert.deepEqual(await kernel.renderAttributeView({ id: "av", blockID: "block", viewID: "view", pageSize: 1 }), raw);
assert.deepEqual(request, { url: "/api/av/renderAttributeView",
  body: { page: 1, createIfNotExist: false, id: "av", blockID: "block", viewID: "view", pageSize: 1 } });
globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: 0, data: { viewID: "other" } }) });
await assert.rejects(kernel.renderAttributeView({ id: "av", viewID: "view" }), /不同的视图/);
globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: -1, msg: "rejected" }) });
await assert.rejects(kernel.renderAttributeView({ id: "av" }), /rejected/);
globalThis.fetch = async () => ({ ok: false, status: 503, statusText: "Unavailable" });
await assert.rejects(kernel.renderAttributeView({ id: "av" }), /503/);
const { TimelineTableProvider } = await load("src/lets-custom-block/timeline/services/table-provider.ts");
const reads = [];
globalThis.fetch = async (url, options) => {
  reads.push({ url, body: JSON.parse(options.body) });
  return { ok: true, json: async () => ({ code: -1, msg: "viewNotFound" }) };
};
const config = { sourceType: "database", sourceAvID: "av", sourceBlockId: "block",
  sourceViewID: "view", sourceQuery: "needle" };
await assert.rejects(TimelineTableProvider.load("block", config), /viewNotFound/);
assert.equal(reads.length, 1, "missing explicit view must never retry without viewID");
assert.equal(reads[0].body.query, "needle");
assert.equal(reads[0].body.createIfNotExist, false, "presentation reads cannot create a missing database");
console.log("PASS: shared observer, active source checks, split instance isolation, stale response rejection, stable adoption and typed kernel reads");
