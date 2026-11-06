import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

const source = await readFile("src/lets-database-view/map/open-map-item.ts", "utf8");
assert.match(source, /position: "right"/, "Unbound native database rows should use a right split");
const testSource = source
  .replace('import { openTab } from "siyuan";',
    "const openTab = (...args) => globalThis.__dodoNativeTabTest.openTab(...args);")
  .replace('import { plugin as mainPlugin } from "../../utils";',
    "const mainPlugin = { app: globalThis.__dodoNativeTabTest.app };");
assert.doesNotMatch(testSource, /^import /m, "All test-only imports must be replaced");
const code = (await transformWithEsbuild(testSource, "open-map-item.ts", {
  loader: "ts", format: "esm", target: "es2020"
})).code;
const calls = [];
const app = { id: "test-app" };
globalThis.__dodoNativeTabTest = {
  app,
  openTab: async options => { calls.push(options); return {}; }
};
const module = await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));

const previousFetch = globalThis.fetch;
const itemId = "20261019000000-abcdefg";
const valueId = "20261019000000-abcdefh";
const avID = "20261019000000-abcdefi";
const databaseBlockID = "20261019000000-abcdefj";
const docId = "20261019000000-abcdefk";

try {
  globalThis.fetch = async () => { throw new Error("Bound documents should not query the database"); };
  await module.openMapItem({ blockId: docId });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    app, doc: { id: docId }, openNewTab: true
  }, "Bound documents must use an independent tab in the current editor, matching the previous behavior");

  await module.openMapItem({ blockId: docId }, {position:"right"});
  assert.deepEqual(calls[1],{
    app, doc:{id:docId}, position:"right", openNewTab:true,
  }, "Timeline-specific navigation must keep the source timeline visible by opening bound docs in the right split");

  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/block/getBlockInfo");
    assert.equal(JSON.parse(options.body).id, databaseBlockID);
    return { ok: true, json: async () => ({ code: 0, data: { box: "notebook-demo" } }) };
  };
  await module.openMapItem({ itemId, valueId, avID, databaseBlockID, title: "地图条目" });
  assert.equal(calls.length, 3);
  const detached = calls[2];
  assert.equal(detached.app, app);
  assert.equal(detached.position, "right");
  assert.equal(detached.openNewTab, true);
  assert.equal(detached.custom.id, "siyuan-database-row",
    "Detached rows must use the original native database-row editor");
  assert.deepEqual(detached.custom.data, {
    avID, itemID: itemId, valueID: valueId, blockID: databaseBlockID,
    notebookId: "notebook-demo", title: "地图条目", isDetached: true
  });

  await assert.rejects(
    () => module.openMapItem({ itemId: "invalid", valueId, avID, databaseBlockID }),
    /有效的标识/
  );
  assert.equal(calls.length, 3, "Invalid database records must never open a tab");
  console.log("PASS: bound documents open independent tabs in the main editor; detached database rows open in the native SiYuan right split; invalid IDs are rejected");
} finally {
  globalThis.fetch = previousFetch;
  delete globalThis.__dodoNativeTabTest;
}