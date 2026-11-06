import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync("src/lets-file-manager/file-service.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal((js.diagnostics ?? []).length, 0);

const ids = Array.from({length: 9}, (_, n) => "2026102013" + String(n).padStart(4,"0") + "-abc1234");
const fallbackId = "20261020130009-abc1234";
let fallbackCalls = 0;
let calls = 0;
let active = 0;
let maxActive = 0;
const moduleExports = {};
const sandbox = {
  exports: moduleExports,
  require(name) {
    assert.equal(name,"../request-utils");
    return {
      postJsonWithTimeout: async (endpoint, args) => {
        if (endpoint === "/api/filetree/getHPathByPath") {
          assert.equal(args.path, "/20261020130000-abc1234/20261020130009-abc1234.sy");
          assert.equal(args.notebook, ids[0]);
          fallbackCalls++;
          return {code: 0, data: "/通过路径找到的文档"};
        }
        assert.equal(endpoint, "/api/filetree/getFullHPathByID");
        assert.ok(ids.includes(args.id) || args.id === fallbackId);
        calls++;
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        await Promise.resolve();
        active--;
        if (args.id === fallbackId) return {code: -1, msg: "full path not available"};
        return {code: 0, data: "/工作笔记/项目文档/第" + ids.indexOf(args.id) + "页"};
      },
    };
  },
  Date, Map, Set, Promise, Error, Array, Number, String, console,
};
vm.runInNewContext(js.outputText, sandbox);
const api=moduleExports;
const ref=(id)=>({rootID:id, path:"notebook/other.sy", blockID:"00000000000000-0000000"});
assert.equal(api.getReferenceDocumentId(ref(ids[0])), ids[0]);
assert.equal(api.getReferenceDocumentId({path:"/box/20261020130000/"+ids[1]+".sy"}), ids[1]);
assert.equal(api.getReferenceDocumentId({rootID:"invalid",blockID:ids[2]}), ids[2]);
assert.equal(api.getReferenceDocumentId({path:"assets/image.png", blockID:"invalid"}), null);

const refs=[...ids.map(ref), ref(ids[0]), ref(ids[1])];
const progress=[];
const values=await api.getReadableReferencePaths(refs, (item) => progress.push(item));
assert.equal(progress.length,9,"each completed document must emit an independent progress event");
assert.equal(values.length,9,"same-document references collapse into one path query");
assert.equal(values[0].path,"/工作笔记/项目文档/第0页");
assert.equal(calls,9);
assert.ok(maxActive<=4,"path API requests must remain bounded by 4");
assert.ok(maxActive>1,"path API should load concurrently");

const duplicate=await Promise.all([api.getReferenceReadablePath(ids[0]),api.getReferenceReadablePath(ids[0])]);
assert.equal(calls,9,"in-memory HPath lookup cache prevents repeat requests");
assert.equal(duplicate[0],duplicate[1]);
await assert.rejects(api.getReferenceReadablePath("invalid"));
assert.deepEqual(await api.getReadableReferencePaths([]),[]);

const fallbackResult = await api.getReadableReferencePaths([{
  rootID: fallbackId,
  notebook: ids[0],
  path: "/20261020130000-abc1234/20261020130009-abc1234.sy",
}]);
assert.equal(fallbackResult[0].path, "/通过路径找到的文档");
assert.equal(fallbackCalls, 1, "document HPath must fall back to official getHPathByPath");

console.log("PASS: official HPath resolution, progressive callbacks, notebook/path fallback, deduplication and concurrency");
