import assert from "node:assert/strict";
import { build } from "esbuild";

const load = async entry => {
  const output = await build({ entryPoints: [entry], bundle: true, platform: "node",
    format: "esm", target: "es2022", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].contents).toString("base64"));
};

const { ViewMountLifecycle } = await load("src/lets-database-view/core/view-mount-lifecycle.ts");
const { DatabaseViewWriteCoordinator } = await load("src/lets-database-view/core/view-write-coordinator.ts");
const { DatabaseViewHost } = await load("src/lets-database-view/core/view-host.ts");

const av = (id = "block", connected = true) => ({ dataset: { nodeId: id, avId: "av" }, isConnected: connected });
const first = av(), second = av();
const frame = { contentWindow: {}, isConnected: true };
let removed = 0, cleaned = 0, created = 0, updated = 0;
const host = { isConnected: true, remove() { this.isConnected = false; removed++; } };
const entry = { viewId: "view", host, frame };
const lifecycle = new ViewMountLifecycle(item => item.frame, (_node, value) => {
  if (value) cleaned++;
});
const strategy = {
  viewId: "view", kind: "map", frame: item => item.frame,
  reusable: item => item.viewId === "view" && item.host.isConnected,
  update: () => updated++,
  create: () => { created++; return entry; },
};
assert.equal(lifecycle.reconcile(first, strategy), entry);
assert.equal(lifecycle.reconcile(first, strategy), entry);
assert.equal(created, 1, "reconcile must not reload the existing iframe");
assert.equal(updated, 1, "reuse must delegate renderer policy");
first.isConnected = false;
assert.equal(lifecycle.reconcile(second, {
  ...strategy,
  adopt: entries => Array.from(entries.entries()).find(([node]) => !node.isConnected),
}), entry);
assert.equal(created, 1, "native element adoption must keep the same browsing context");
assert.equal(lifecycle.entries.has(first), false);
assert.equal(lifecycle.entries.get(second), entry);
lifecycle.detach(second);
assert.equal(frame.isConnected, true, "unmount does not navigate an iframe");
assert.equal(removed, 1);
assert.equal(cleaned, 1);
assert.equal(lifecycle.entries.size, 0);
lifecycle.detach(second);
assert.equal(cleaned, 1, "already detached instance is not disposed twice");

const viewHost = new DatabaseViewHost();
const fakeAv = av();
fakeAv.querySelector = () => ({ dataset: { currentViewId: "view" },
  querySelector: () => ({ dataset: { avType: "table" } }) });
const fakeFrame = { isConnected: true, contentWindow: {} };
const fakeHost = { isConnected: true };
viewHost.track(fakeAv, "view", "chart", fakeHost, fakeFrame);
const ticket = viewHost.beginRead(fakeFrame);
assert.equal(ticket(), true);
viewHost.invalidateBlock("block");
assert.equal(ticket(), false, "AV-level write invalidates in-flight reads across views");

const coordinator = new DatabaseViewWriteCoordinator();
let release;
const gate = new Promise(resolve => { release = resolve; });
const events = [];
coordinator.subscribe(event => { events.push(event); });
coordinator.subscribe(() => { throw new Error("broken subscriber"); });
const previousWarn = console.warn;
const reportedWarnings = [];
console.warn = (...args) => { reportedWarnings.push(String(args[0])); };
const write = { blockId: "block", viewId: "view", kind: "map", action: "correct", itemId: "row" };
const pending = coordinator.run(write, () => gate.then(() => "committed"));
assert.equal(coordinator.isPending("block"), true);
await assert.rejects(coordinator.run({ ...write, kind: "calendar", action: "dates" },
  async () => "unexpected"), /正在保存/);
assert.equal(events.length, 0, "an in-flight mutation must not announce a commit");
assert.equal(await coordinator.run({ ...write, blockId: "other" },
  async () => "parallel database"), "parallel database",
  "different AV blocks may save concurrently");
release();
assert.equal(await pending, "committed");
assert.equal(coordinator.isPending("block"), false);
assert.deepEqual(events.filter(event => event.blockId === "block"), [write]);
await assert.rejects(coordinator.run({ ...write, action: "delete" },
  async () => { throw new Error("network write failed"); }), /network write failed/);
assert.equal(events.length, 2, "rejected writes must not notify subscribers");
assert.equal(coordinator.isPending("block"), false, "failed write must release lock");
const unsubscribe = coordinator.subscribe(() => {});
unsubscribe();
console.warn = previousWarn;
assert.equal(reportedWarnings.length, 2, "failed notification listener is isolated");
console.log("PASS: shared mount reuse/adoption/disposal, AV read invalidation, write serialization, success-only notification, and exception-safe release");
