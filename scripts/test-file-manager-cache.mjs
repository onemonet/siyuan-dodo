import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync("src/lets-file-manager/file-service.ts", "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal((transpiled.diagnostics ?? []).length, 0);
let now = 100_000;
let indexCalls = 0;
let diskCalls = 0;
let writes = 0;
let failIndex = false;
const originals = Array.from({ length: 129 }, (_, i) => ({
  path: "assets/file-" + String(i).padStart(3, "0") + ".jpg", updated: 100 + i,
}));
let indexed = [...originals, { path: "assets/subfolder/photo.avif", updated: 900 }];
const disk = [
  { name: "file-000.jpg", isDir: false, updated: 1 },
  { name: "empty-folder", isDir: true },
  { name: "not-in-index.pdf", isDir: false, updated: 2 },
];
const fakePost = async (url, args) => {
  if (url === "/api/search/searchAsset") {
    indexCalls++;
    if (failIndex) return { code: -1, msg: "index unavailable" };
    assert.equal(args.k, "");
    assert.equal(args.includeMetadata, false);
    const start = (args.page - 1) * args.pageSize;
    return { code: 0, data: indexed.slice(start, start + args.pageSize) };
  }
  if (url === "/api/file/readDir") {
    diskCalls++;
    return { code: 0, data: disk };
  }
  if (url === "/api/asset/renameAsset") {
    return { code: 0, data: { newPath: "assets/renamed.jpg" } };
  }
  throw new Error("unexpected API: " + url);
};
class FakeDate extends Date { static now() { return now; } }
class FakeFormData { append() {} }
const sandbox = {
  exports: {},
  require(name) {
    assert.equal(name, "../request-utils");
    return { postJsonWithTimeout: fakePost };
  },
  Date: FakeDate, Map, Set, Promise, Error, Array, String, Number, FormData: FakeFormData,
  console: { warn() {} },
  fetch: async () => { writes++; return { ok: true, json: async () => ({ code: 0 }) }; },
};
vm.runInNewContext(transpiled.outputText, sandbox, { filename: "file-service.cjs" });
const api = sandbox.exports;

const root = await api.readAssetDirectory("");
assert.equal(root.filter((item) => !item.isDir).length, 129);
assert.equal(root.some((item) => item.isDir && item.name === "subfolder"), true);
assert.equal(indexCalls, 3, "130 indexed files must use three 64-result pages");
assert.equal(diskCalls, 0, "normal listing must not call slow disk API");

const nested = await api.readAssetDirectory("subfolder");
assert.equal(nested.length, 1);
assert.equal(nested[0].name, "photo.avif");
assert.equal(indexCalls, 3, "subfolder listing must reuse global asset index");
assert.strictEqual(await api.readAssetDirectory(""), root, "fresh directory cache reused");
assert.equal(api.getCachedAssetDirectory("").isFresh, true);

now += api.DIRECTORY_CACHE_TTL_MS + 1;
assert.equal(api.getCachedAssetDirectory("").isFresh, false);
indexed = [...indexed, { path: "assets/new-item.webp", updated: 999 }];
const fresh = await api.readAssetDirectory("");
assert.equal(fresh.some((item) => item.name === "new-item.webp"), true, "stale directory refreshed");
assert.equal(indexCalls, 6);
assert.equal(diskCalls, 0);

const deep = await api.deepScanAssetDirectory("");
assert.equal(diskCalls, 1, "complete scan is explicit");
assert.equal(deep.some((item) => item.name === "empty-folder" && item.isDir), true);
const afterScan = await api.readAssetDirectory("", { forceRefresh: true });
assert.equal(afterScan.some((item) => item.name === "empty-folder" && item.isDir), true, "empty folders retained");
assert.equal(afterScan.some((item) => item.name === "not-in-index.pdf"), true, "full-scan discoveries retained");

await api.saveAssetFile("", { name: "just-created.jpg" });
assert.equal(writes, 1);
const afterWrite = await api.readAssetDirectory("");
assert.equal(afterWrite.some((item) => item.name === "just-created.jpg"), true, "recent uploads visible before kernel re-index");

await api.createAssetFolder("", "new-empty-folder");
assert.equal(writes, 2);
const afterFolder = await api.readAssetDirectory("");
assert.equal(afterFolder.some((item) => item.name === "new-empty-folder" && item.isDir), true, "new empty folder visible");

indexed = [...indexed, { path: "assets/file-000.jpg", updated: 999 }];
const renamed = await api.renameAsset("file-000.jpg", "renamed.jpg");
assert.equal(renamed, "assets/renamed.jpg");
const afterRename = await api.readAssetDirectory("");
assert.equal(afterRename.some((item) => item.name === "file-000.jpg"), false, "original renamed entry hidden");
assert.equal(afterRename.some((item) => item.name === "renamed.jpg"), true, "renamed entry visible");

failIndex = true;
api.invalidateAssetDirectory("subfolder");
const fallback = await api.readAssetDirectory("subfolder", { forceRefresh: true });
assert.equal(diskCalls, 2, "fallback to native readDir when index API unavailable");
assert.equal(fallback[0].name, "file-000.jpg");

console.log("PASS: 3-page fast index, nested folders, TTL, full scan, upload, empty folders, rename, fallback");
