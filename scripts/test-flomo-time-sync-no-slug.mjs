import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const source = (p) => readFileSync(p, "utf8");
const constants = source("src/config/constants.ts");
const blockWriterSource = source("src/lets-flomo-sync/services/SiyuanMemoBlockWriter.ts");
const parentWriterSource = source("src/lets-flomo-sync/services/SiyuanWriter.ts");
const syncSource = source("src/lets-flomo-sync/services/SyncService.ts");
const incrementalSource = source("src/lets-flomo-sync/utils/pendingMemos.ts");
assert(!constants.includes("custom-dodo-flomo-slug"));
assert(!blockWriterSource.includes("findExistingMemoBlockId"));
assert(!blockWriterSource.includes("querySQL"));
assert(!blockWriterSource.includes("FLOMO_MEMO_SLUG_ATTR"));
assert(!blockWriterSource.includes('status: "skipped"'));
assert(blockWriterSource.includes("FLOMO_MEMO_ATTR"));
assert(!parentWriterSource.includes("skipped"));
assert(!syncSource.includes("writeResult.skipped"));
assert(syncSource.includes("writeResult.inserted"));
assert(incrementalSource.includes("resolveSyncStartDate(config.lastSyncTime)"));
assert(incrementalSource.includes("getUpdatedMemos(latestUpdatedAt, latestSlug, limit)"));

async function loadSource(entry) {
  const { outputFiles } = await build({
    entryPoints: [entry],
    platform: "node",
    bundle: true,
    write: false,
    format: "esm",
    logLevel: "silent"
  });
  const base64 = Buffer.from(outputFiles[0].contents).toString("base64");
  return import("data:text/javascript;base64," + base64);
}
const { SiyuanMemoBlockWriter } = await loadSource(
  "src/lets-flomo-sync/services/SiyuanMemoBlockWriter.ts");
const timeMemo = {
  content: "A flomo note",
  time: "2026-11-08 10:01:00",
  updatedDate: "2026-11-08",
  updatedAt: 1794112860,
  originalMemo: { slug: "memo-slug-that-must-not-be-written" },
};
const calls = [];
const mockPost = async (endpoint, payload) => {
  calls.push({ endpoint, payload });
  if (endpoint === "/api/attr/setBlockAttrs") return { code: 0 };
  if (endpoint === "/api/block/appendBlock" || endpoint === "/api/block/prependBlock") {
    return { code: 0, data: [{ doOperations: [{ id: "20261108100100-1234567" }] }] };
  }
  throw new Error("Unexpected endpoint " + endpoint);
};
const writer = new SiyuanMemoBlockWriter({ post: mockPost, warn: () => {} });
const first = await writer.insertMemoBlock("20261108090000-1234567", timeMemo, false);
assert.equal(first.status, "inserted");
assert.equal(first.blockId, "20261108100100-1234567");
assert.deepEqual(calls.map((call) => call.endpoint), [
  "/api/block/appendBlock", "/api/attr/setBlockAttrs",
], "Do not execute a pre-insert SQL dedup query");
assert.deepEqual(Object.keys(calls[1].payload.attrs), ["custom-dodo-memo"]);
assert(!JSON.stringify(calls).includes("memo-slug-that-must-not-be-written"),
  "Flomo slug should not appear in new block attribute/API writes");

calls.length = 0;
await writer.insertMemoBlock("20261108090000-1234567",
  { ...timeMemo, updatedAt: 0 }, true);
assert.deepEqual(calls.map(call => call.endpoint), ["/api/block/prependBlock"],
  "A memo without update-time attribute still writes a block");

const failingWriter = new SiyuanMemoBlockWriter({
  post: async (endpoint) => endpoint === "/api/block/appendBlock"
    ? { code: 1, msg: "insert blocked" } : { code: 0 },
  warn: () => {},
});
await assert.rejects(
  failingWriter.insertMemoBlock("parent", timeMemo, false),
  /insert blocked/,
  "Write failures must remain failures to preserve the incremental checkpoint"
);

const {fetchPendingMemos} = await loadSource(
  "src/lets-flomo-sync/utils/pendingMemos.ts");
const reads=[];
const config={
  lastSyncTime:"2026-11-08 10:00:00",
  syncSuccessTag:"",
  syncTagMode:"0",
  syncIncludeTags:"",
  syncExcludeTags:"",
};
const afterStart = [{
  slug:"sample",
  updated_at:"2026-11-08 10:02:00",
  tags:[],
}];
const fakeApi={
  getUpdatedMemos:async (timestamp,slug,limit)=>{
    reads.push({ timestamp,slug,limit });
    return afterStart;
  }
};
const pending=await fetchPendingMemos({api:fakeApi,config,limit:"200"});
assert.equal(pending.length,1);
assert.equal(reads.length,1);
assert.equal(reads[0].timestamp,Math.floor(new Date(2026,10,8,10,0,0).getTime()/1000));
assert.equal(reads[0].slug,"");
console.log("PASS: Flomo slug attribute and SQL lookup removed; timestamp annotation and time-based incremental loading preserved");