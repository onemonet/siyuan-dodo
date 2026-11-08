import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { preprocess, compile } from "svelte/compiler";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const read = path => readFileSync(path, "utf8");
const metadata = read("src/lets-flomo-sync/pluginSettingsLocation.ts");
const svelte = read("src/lets-flomo-sync/FlomoNotebookSetting.svelte");
const panel = read("src/libs/setting-panel.svelte");
const store = read("src/lets-flomo-sync/services/FlomoConfigStore.ts");
assert(metadata.includes('title: "DailyNote 笔记本"') &&
  metadata.includes('key: "dailnoteNotebook"') &&
  !metadata.includes('title: "DailyNote 笔记本 ID"') &&
  !metadata.includes('description: "DailyNote 模式下使用的笔记本 ID"'),
  "Friendly notebook label but persisted setting key unchanged");
assert(/key: "dailnoteNotebook"[\s\S]*?type: "select"/.test(metadata),
  "Notebook setting must be a native select");
assert(!/key: "dailnoteNotebook"[\s\S]*?options: \{/.test(
  metadata.split('key: "dailnoteNotebook"')[1]?.split('key: "pageId"')[0] ?? ""),
  "Do not set an empty options map because that would erase saved IDs on hydration");
assert(store.includes('"dailnoteNotebook"') &&
  panel.includes('group === "Flomo 同步" && item.key === "dailnoteNotebook"') &&
  panel.includes("<FlomoNotebookSetting") &&
  panel.includes("on:changed={onChanged}"),
  "Saved key and normal onChange/event flow must be retained");
assert(svelte.includes("lsNotebooks()") &&
  svelte.includes("onMount(") && svelte.includes("<SettingItem") &&
  svelte.includes('type="select"') &&
  svelte.includes('configItemId = "Flomo 同步.dailnoteNotebook"') &&
  svelte.includes("on:changed"),
  "Svelte notebook settings uses the native select and the kernel API");
const processed = await preprocess(svelte, vitePreprocess(), {
  filename: "FlomoNotebookSetting.svelte"
});
compile(processed.code,{filename:"FlomoNotebookSetting.svelte",generate:"dom"});

async function importBundled(path){
  const result=await build({
    entryPoints:[path],bundle:true,platform:"node",format:"esm",
    write:false,logLevel:"silent"
  });
  return import("data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
const {
  buildFlomoNotebookChoices, pendingFlomoNotebookChoices,
} = await importBundled("src/lets-flomo-sync/flomo-notebook-choices.ts");
const notebooks=[
  {id:"20260801084926-fudq3wk",name:"工作",icon:"1f4d2",sort:1,closed:false},
  {id:"20260801084926-closed1",name:"封存",icon:"1f4d5",sort:2,closed:true},
  {id:"20260801084926-opened2",name:"个人",icon:"",sort:3,closed:false},
  {id:"20260801084926-opened2",name:"重复数据",icon:"",sort:9,closed:false},
];
const saved="20260801084926-fudq3wk";
const available=buildFlomoNotebookChoices(notebooks,saved);
assert.equal(available.notice,"");
assert.match(available.options[saved],/工作/);
assert.match(available.options[saved],/📒/);
assert.equal(available.options["20260801084926-closed1"],undefined,
  "Other closed notebooks are not offered");
assert.match(available.options["20260801084926-opened2"],/个人/);
assert.equal(available.options[""],"请选择笔记本");
const closed=buildFlomoNotebookChoices(notebooks,"20260801084926-closed1");
assert.match(closed.options["20260801084926-closed1"],/封存.*已关闭/);
assert.match(closed.notice,/当前笔记本已关闭/);
const missing="20260801084926-missing";
const invalid=buildFlomoNotebookChoices(notebooks,missing);
assert.match(invalid.options[missing],/已不存在/);
assert.match(invalid.notice,/请选择其他笔记本/);
const loading=pendingFlomoNotebookChoices(saved,"loading");
assert.equal(Object.hasOwn(loading.options,saved),true);
assert.match(loading.options[saved],/已保存/);
const unavailable=pendingFlomoNotebookChoices(saved,"error");
assert.equal(Object.hasOwn(unavailable.options,saved),true);
assert.match(unavailable.notice,/失败/);
assert.match(buildFlomoNotebookChoices([],"").options[""],/暂无可用/);
assert(!Object.values(available.options).some(label=>label.includes("fudq3wk")),
  "Notebook IDs must not appear in visible choices");

const schema = await importBundled("src/setting-schema.ts");
const setting={
  type:"select",key:"dailnoteNotebook",title:"DailyNote 笔记本",
  value:"",visibleWhen:{key:"locationMode",equals:"0"},
};
assert.equal(schema.coerceSettingValue(setting,saved),saved,
  "Schema hydration must preserve the old selected ID before fetching notebooks");
const normalized=schema.normalizeSettingsData([setting],{dailnoteNotebook:saved});
assert.equal(normalized.dailnoteNotebook,saved);
const hydrated=schema.hydrateSettingItems([setting],{dailnoteNotebook:saved});
assert.equal(hydrated[0].value,saved);
assert.equal(hydrated[0].key,"dailnoteNotebook");
console.log("PASS: Flomo DailyNote native select, notebook IDs preserved, open/closed/missing options, loading/error and settings-schema migration");