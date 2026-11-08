import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync("src/lets-file-manager/file-service.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);

const ID = "20261108123456-abcdefg";
const ATTR = "custom-cover";
const oldPath = "photos/old.jpg";
const newPath = "photos/new.webp";
const originalValue = JSON.stringify({
  cover: "assets/photos/old.jpg",
  preview: "/assets/photos/old.jpg?v=2",
  next: "assets/photos/old.jpg.backup",
  external: "https://somewhere.example/assets/photos/old.jpg",
  other: "assets/photos/old.jpg2",
});
const attrs = new Map([[ID, {
  [ATTR]: originalValue,
  "custom-title": "safe",
  "custom-description": "assets/elsewhere.png",
  "id": ID,
}]]);
let sqlCalls = 0, getCalls = 0, setCalls = 0;
let denyWrites = false, failSql = false, corruptRow = false;
let extraRows = [];
let sqlValueOverride = null;

const fakePost = async (endpoint, args) => {
  if (endpoint === "/api/query/sql") {
    sqlCalls++;
    if (failSql) return { code: -1, msg: "SQL blocked" };
    assert.match(args.stmt, /name LIKE 'custom-%'/);
    const matches = [...args.stmt.matchAll(/instr\(value, '((?:''|[^'])*)'\)/g)];
    assert.ok(matches.length >= 1, "scan must compare quoted SQL literals");
    const needles = matches.map((match) => match[1].replace(/''/g, "'"));
    const limit = Number(args.stmt.match(/LIMIT (\d+)/)?.[1]);
    const offset = Number(args.stmt.match(/OFFSET (\d+)/)?.[1]);
    assert.equal(limit, 200);
    const all = [
      ...Array.from(attrs, ([block_id, values]) =>
        Object.entries(values).filter(([name, value]) => name.startsWith("custom-") &&
          typeof value === "string")
          .map(([name, value]) => ({ block_id, name, value }))).flat(),
      ...extraRows,
    ].map((row) => row.block_id === ID && row.name === ATTR && sqlValueOverride !== null
      ? {...row, value: sqlValueOverride} : row)
      .filter((row) => needles.some((needle) => row.value.includes(needle)))
      .sort((a,b) => a.block_id.localeCompare(b.block_id) || a.name.localeCompare(b.name));
    const rows = all.slice(offset, offset + limit);
    return { code: 0, data: corruptRow ? [{block_id:"bad",name:ATTR,value:originalValue}] : rows };
  }
  if (endpoint === "/api/attr/getBlockAttrs") {
    getCalls++;
    return { code: 0, data: { ...(attrs.get(args.id) ?? {}) } };
  }
  if (endpoint === "/api/attr/setBlockAttrs") {
    setCalls++;
    assert.equal(args.id, ID);
    assert.deepEqual(Object.keys(args.attrs), [ATTR],
      "only matched custom attr may be updated");
    if (!denyWrites) attrs.set(args.id, { ...attrs.get(args.id), ...args.attrs });
    return { code: 0, data: null };
  }
  throw Error("unexpected " + endpoint);
};
const exports = {};
vm.runInNewContext(compiled.outputText,{
  exports, Map, Set, Date, Number, String, Array, Promise, Error,
  console, require(name) {
    assert.equal(name, "../request-utils");
    return {postJsonWithTimeout:fakePost};
  },
}, {filename:"file-service.cjs"});

const rewrite = exports.replaceCustomAssetPathInValue;
const rewritten = rewrite(originalValue, oldPath, newPath);
const parsed = JSON.parse(rewritten);
assert.equal(parsed.cover, "assets/photos/new.webp");
assert.equal(parsed.preview, "/assets/photos/new.webp?v=2");
assert.equal(parsed.next, "assets/photos/old.jpg.backup");
assert.equal(parsed.external, "https://somewhere.example/assets/photos/old.jpg");
assert.equal(parsed.other, "assets/photos/old.jpg2");
assert.equal(rewrite("assets/photos/old.jpg|assets/photos/old.jpg",oldPath,newPath),
  "assets/photos/new.webp|assets/photos/new.webp");
assert.equal(rewrite("anotherassets/photos/old.jpg",oldPath,newPath),
  "anotherassets/photos/old.jpg");
assert.equal(rewrite("assets/photos/old.jpg/folder",oldPath,newPath),
  "assets/photos/old.jpg/folder");

let before = await exports.findCustomAssetAttributeReferences(oldPath);
assert.equal(before.length,1);
assert.equal(before[0].blockID,ID);
assert.equal(before[0].name,ATTR);
assert.ok(sqlCalls >= 1);
let changed = await exports.relinkCustomAssetAttributeReferences(oldPath,newPath);
assert.equal(changed,1);
assert.equal(setCalls,1);
assert.ok(getCalls >= 2,"read latest attributes and verify native write");
assert.equal(attrs.get(ID)[ATTR],rewritten);
assert.equal(attrs.get(ID)["custom-title"],"safe");
assert.equal((await exports.findCustomAssetAttributeReferences(oldPath)).length,0,
  "remaining false positives (backup filename / external URL) are ignored");

// A no-op second run must never issue another write.
changed = await exports.relinkCustomAssetAttributeReferences(oldPath,newPath);
assert.equal(changed,0);
assert.equal(setCalls,1);

// Simulated kernel accepting writes but not persisting them is detected.
attrs.get(ID)[ATTR] = originalValue;
denyWrites = true;
await assert.rejects(exports.relinkCustomAssetAttributeReferences(oldPath,newPath),/核验失败/);
assert.equal(attrs.get(ID)[ATTR],originalValue);
denyWrites = false;

// Failed or malformed SQL scans must throw, not report 0 and permit deletion.
failSql = true;
await assert.rejects(exports.findCustomAssetAttributeReferences(oldPath),/SQL blocked/);
failSql = false;
corruptRow = true;
await assert.rejects(exports.findCustomAssetAttributeReferences(oldPath),/索引记录异常/);
corruptRow = false;

// Verify SQL literal quoting for filenames containing apostrophes.
await exports.findCustomAssetAttributeReferences("photos/it's.jpg");

// Multiple batches must be scanned in full rather than just the first page.
extraRows = Array.from({length:201},(_,i)=>({
  block_id: ID,
  name: "custom-extra-" + String(i).padStart(3,"0"),
  value: "assets/photos/old.jpg",
}));
before = await exports.findCustomAssetAttributeReferences(oldPath);
assert.equal(before.length,202);
extraRows = [];
// Real user case: gallery custom attrs store filenames with percent-encoded spaces.
const originalName = "M4NZNQLLBG8WT_General 2560x1440 Cyberpunk 2077 V Cyberpunk 2077 CD Projekt RE-20261108161738-cc7cy2f.png";
const optimizedName = "M4NZNQLLBG8WT_General 2560x1440 Cyberpunk 2077 V Cyberpunk 2077 CD Projekt RE-20261108161738-cc7cy2f-optimized-mw7kfk5q-9vrh9r1q.webp";
const encodedOld = "assets/" + encodeURIComponent(originalName);
const encodedNew = "assets/" + encodeURIComponent(optimizedName);
assert.equal(
  rewrite("assets/" + originalName, originalName, optimizedName),
  "assets/" + optimizedName, "raw paths with spaces must migrate",
);
assert.equal(rewrite(encodedOld, originalName, optimizedName), encodedNew,
  "percent-encoded paths must migrate without losing their encoding");
assert.equal(rewrite(encodedOld + "?v=2", originalName, optimizedName), encodedNew + "?v=2");
assert.equal(rewrite("https://host.example/" + encodedOld, originalName, optimizedName),
  "https://host.example/" + encodedOld, "external URLs must never be migrated");
assert.equal(rewrite(encodedOld + ".backup", originalName, optimizedName),
  encodedOld + ".backup", "similar filenames must never be migrated");
attrs.get(ID)[ATTR] = encodedOld;
before = await exports.findCustomAssetAttributeReferences(originalName);
assert.equal(before.length, 1, "encoded-only gallery attribute must be discovered by SQL");
changed = await exports.relinkCustomAssetAttributeReferences(originalName, optimizedName);
assert.equal(changed, 1);
assert.equal(attrs.get(ID)[ATTR], encodedNew);
assert.equal((await exports.findCustomAssetAttributeReferences(originalName)).length, 0,
  "encoded old asset must be absent after migration");
// The native core relinker has already written SQL/.sy with WebP, but
// getBlockAttrs still reports the original JPG from a live block cache.
sqlValueOverride = "assets/photos/new.webp";
attrs.get(ID)[ATTR] = "assets/photos/old.jpg";
const originalSnapshot = [{
  blockID: ID, name: ATTR, value: "assets/photos/old.jpg",
}];
assert.equal((await exports.findCustomAssetAttributeReferences(oldPath)).length,0,
  "native SQL has already moved forward, so re-scanning it would miss the stale getter");
let staleGetter = await exports.findStaleCustomAssetBlockAttrs(oldPath,originalSnapshot);
assert.equal(staleGetter.length,1);
const writesBeforeStaleFix = setCalls;
changed = await exports.relinkCustomAssetAttributeReferences(oldPath,newPath,originalSnapshot);
assert.equal(changed,1,"must reuse preflight snapshot rather than re-scan updated SQL");
assert.equal(setCalls,writesBeforeStaleFix+1,"must call the block setter to refresh stale cached attrs");
assert.equal(attrs.get(ID)[ATTR],"assets/photos/new.webp");
staleGetter = await exports.findStaleCustomAssetBlockAttrs(oldPath,originalSnapshot);
assert.equal(staleGetter.length,0,"getter must agree with updated SQL");
attrs.get(ID)[ATTR] = "assets/photos/old.jpg";
assert.equal((await exports.findStaleCustomAssetBlockAttrs(oldPath,originalSnapshot)).length,1,
  "postflight must detect JPG even if SQL says there are no old references");
console.log("PASS: custom-* SQL scan, exact asset-path tokens, native attribute update + verification, failure guards, SQL escaping, encoded paths and native SQL/getBlockAttrs cache mismatch");
