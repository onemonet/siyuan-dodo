import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const { DebouncedSettingsSaver } = await server.ssrLoadModule("/src/lets-custom-block/timeline/ui/debounced-settings-saver.ts");

  const writes = [];
  const states = [];
  const saver = new DebouncedSettingsSaver(async snapshot => {
    writes.push({ ...snapshot });
    return { success:true };
  }, (state, message) => states.push([state, message]), 35);
  saver.schedule({ height: 440 });
  await sleep(10);
  saver.schedule({ height: 500 });
  await sleep(85);
  assert.deepEqual(writes, [{ height:500 }], "Multiple changes during debounce must persist only the newest snapshot");
  assert.equal(states.at(-1)[0], "saved");
  assert.equal(await saver.flush(), true, "Flushing an already saved queue is a no-op");

  let releaseFirst;
  const barrier = new Promise(resolve => { releaseFirst=resolve; });
  let active = 0;
  let peak = 0;
  const serializedWrites = [];
  const serializedStates = [];
  const serial = new DebouncedSettingsSaver(async snapshot => {
    active++; peak = Math.max(peak, active);
    serializedWrites.push({ ...snapshot });
    if (serializedWrites.length === 1) await barrier;
    active--;
    return { success:true };
  }, state => serializedStates.push(state), 1000);
  serial.schedule({ startPosition:"first" });
  const first = serial.flush();
  await sleep(5);
  serial.schedule({ startPosition:"last", height:550 });
  serial.schedule({ startPosition:"last", height:600 });
  releaseFirst();
  assert.equal(await first, true);
  assert.deepEqual(serializedWrites, [
    { startPosition:"first" },
    { startPosition:"last", height:600 },
  ], "In-flight older write must finish before the newest draft is saved, never after it");
  assert.equal(peak,1,"Only one backend attribute update may be in flight");
  assert.equal(serializedStates.at(-1),"saved");
  assert.equal(await serial.flush(),true);
  await sleep(5);
  assert.equal(serializedWrites.length,2,"An old debounce timer must not write a duplicate snapshot");

  const immediate = [];
  const close = new DebouncedSettingsSaver(async value => { immediate.push(value); return {success:true}; }, () => {}, 1000);
  close.schedule({ group:"" });
  assert.equal(await close.flush(),true,"Closing dialog must flush the last pending change immediately");
  assert.deepEqual(immediate,[{group:""}],"Explicit unused field must be persisted as the empty keyID sentinel");

  const errors = [];
  let fail = true;
  const failed = new DebouncedSettingsSaver(async value => {
    if (fail) return { success:false, message:"开始时间无效" };
    return { success:true };
  }, (state,message) => errors.push([state,message]), 1000);
  failed.schedule({startDate:"stale-keyid"});
  assert.equal(await failed.flush(),false,"Backend validation failure must not be reported as saved");
  assert.deepEqual(errors.at(-1),["error","开始时间无效"]);
  assert.equal(errors.filter(([state]) => state === "error").length,1,"No retry loop on invalid configuration");
  fail=false;
  failed.schedule({startDate:"20261018000000-aaaaaaa"});
  assert.equal(await failed.flush(),true,"A user correction after validation failure must auto-save");
  assert.equal(errors.at(-1)[0],"saved");

  const exceptions = [];
  const throwing = new DebouncedSettingsSaver(async () => { throw Error("网络暂时不可用"); },
    (state,message) => exceptions.push([state,message]),1000);
  throwing.schedule({height:999});
  assert.equal(await throwing.flush(),false);
  assert.deepEqual(exceptions.at(-1),["error","网络暂时不可用"],"A thrown network error must remain visible");

  const panel = await readFile("src/lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte","utf8");
  assert.match(panel,/databaseSaver = new DebouncedSettingsSaver\(/);
  assert.match(panel,/databaseSaver\?\.schedule\(draft\)/);
  assert.match(panel,/void databaseSaver\?\.flush\(\)/,"Dialog destruction must flush edits");
  assert.match(panel,/databaseView && databaseSaver && !\(await databaseSaver\.flush\(\)\)/,
    "Manual refresh must first persist pending changes");
  assert.doesNotMatch(panel,/saveDatabaseSettings|>保存设置<|有未保存的修改/,
    "Database timeline must not require manual submission or show stale manual-save guidance");
  assert.match(panel,/修改后自动保存并刷新预览/);
  const native = await readFile("src/lets-database-view/visual/visual-settings.ts","utf8");
  assert.match(native,/DatabaseViewConfigStore\.updateView\(blockId,viewId,entry=>\{/,
    "Native adapter must persist to the selected database view config");
  assert.match(native,/this\.bridge\.scheduleFrame\(av\)/,
    "Native adapter must reload mounted timeline preview after successful save");
  console.log("PASS: database timeline autosave debounces, serializes in-flight saves, flushes on close, handles errors, refreshes automatically");
} finally {
  await server.close();
}
