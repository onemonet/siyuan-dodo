import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  configFile: false, server: { middlewareMode: true }, appType: "custom"
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const { DebouncedSettingsSaver } =
    await server.ssrLoadModule("/src/lets-custom-block/timeline/ui/debounced-settings-saver.ts");

  const calls = [];
  const savedStates = [];
  const saver = new DebouncedSettingsSaver(async snapshot => {
    calls.push(snapshot);
    return { success: true };
  }, (state, message) => savedStates.push([state,message]), 35);

  saver.schedule({ type: "bar-basic", config: { height: 320 } });
  await delay(12);
  saver.schedule({ type: "pie-basic", config: { height: 720 } });
  assert.equal(await saver.flush(), true);
  assert.deepEqual(calls, [
    { type: "pie-basic", config: { height: 720 } }
  ], "Closing the chart dialog must preserve the latest chart type and height");
  assert.equal(savedStates.at(-1)[0], "saved");

  let release;
  const gate = new Promise(resolve => release = resolve);
  const ordered = [];
  let active = 0;
  let peak = 0;
  const inFlight = new DebouncedSettingsSaver(async snapshot => {
    active++;
    peak = Math.max(peak, active);
    ordered.push(snapshot);
    if(ordered.length===1)await gate;
    active--;
    return {success:true};
  },()=>{},1000);
  inFlight.schedule({type:"line-basic",config:{height:520}});
  const pending = inFlight.flush();
  await delay(6);
  inFlight.schedule({type:"line-smooth",config:{height:960}});
  release();
  assert.equal(await pending,true);
  assert.deepEqual(ordered.map(x=>x.config.height),[520,960]);
  assert.equal(peak,1,"Concurrent chart settings writes must be serialized");

  const errors = [];
  const failed = new DebouncedSettingsSaver(async () => ({success:false,message:"字段无效"}),
    (state,message)=>errors.push([state,message]),1000);
  failed.schedule({type:"bar-basic",config:{x:{column:"stale-keyid"}}});
  assert.equal(await failed.flush(),false);
  assert.deepEqual(errors.at(-1),["error","字段无效"]);

  const panel=await readFile("src/lets-custom-block/chart/ChartSettingsPanel.svelte","utf8");
  const mount=await readFile("src/lets-database-view/visual/visual-mount-policies.ts","utf8");
  const visualSettings=await readFile("src/lets-database-view/visual/visual-settings.ts","utf8");
  const types=await readFile("src/lets-custom-block/chart/types.ts","utf8");
  const timeline=await readFile("src/lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte","utf8");
  assert.match(panel,/saver = new DebouncedSettingsSaver\(/);
  assert.match(panel,/saver\?\.schedule\(\{ type: chartType, config: snapshot \}\)/);
  assert.match(panel,/void saver\?\.flush\(\)/,"Closing a chart settings panel must save the last edit");
  assert.match(panel,/saver && !\(await saver\.flush\(\)\)/,"Manual refresh should flush edits");
  assert.match(panel,/saveError = state === "error"/);
  assert.match(panel,/PREVIEW_HEIGHT_PRESETS as preset/);
  assert.match(panel,/heightPresetValue\(config\.height\)/);
  assert.match(panel,/draft\.height = height/);
  assert.doesNotMatch(panel,/saveTimer/,"Chart must not use the old cancel-on-close timer");
  assert.match(mount,/normalizePreviewHeight\(config\?\.chart\?\.height\)/);
  assert.match(visualSettings,/item\.frame\.style\.height = normalizePreviewHeight\(config\.height\) \+ "px"/);
  assert.match(types,/height\?: number/);
  assert.match(timeline,/已根据数据库视图刷新/);
  assert.match(timeline,/catch \(error\) \{\s*showMessage\("刷新时间线失败："/);
  console.log("PASS: chart settings autosave latest draft on close, serializes writes, reports errors, independently persists height; timeline refresh errors are handled");
} finally {
  await server.close();
}