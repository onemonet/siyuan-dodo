import assert from "node:assert/strict";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/setting-search.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  logLevel: "silent",
});
const encoded = Buffer.from(compiled.outputFiles[0].text).toString("base64");
const { searchSettingsGroups, getSettingsSections } =
  await import("data:text/javascript;base64," + encoded);

const settings = {
  "开关": [
    { key:"database-view",type:"checkbox",title:"数据库视图",
      description:"开启后支持可视化数据表格",value:true },
    { key:"disabled",type:"checkbox",title:"Flomo 同步",
      description:"可以登录 Flomo 账户",value:false },
  ],
  "自定义块": [
    { key:"math-enabled",type:"checkbox",title:"计算块开关",
      section:"计算块",description:"内部启用标记",value:true },
    { key:"math-format",type:"select",title:"计算精度",
      section:"计算块",description:"设置小数位数",value:"2" },
    { key:"toggle-enabled",type:"checkbox",title:"折叠启用",
      section:"折叠块",value:true },
    { key:"toggle-mode",type:"select",title:"折叠样式",
      section:"折叠块",description:"折叠内容的默认方式",value:"normal" },
  ],
  "数据库视图": [
    { key:"map-view-enabled",type:"checkbox",title:"地图视图启用",
      section:"地图视图",value:true },
    { key:"map-provider",type:"select",title:"地图服务商",
      section:"地图视图",description:"选择地图服务来源",value:"amap" },
    { key:"map-search-enabled",type:"checkbox",title:"开启搜索",
      section:"地图视图",description:"启用后允许搜索地点",value:false },
    { key:"chart-view-enabled",type:"checkbox",title:"图表视图启用",
      section:"图表视图",value:true },
    { key:"chart-title",type:"textinput",title:"图表标题",
      section:"图表视图",description:"报表名称",value:"secret-private-data" },
    { key:"chart-select",type:"select",title:"图表筛选条件",
      section:"图表视图",value:"none",
      visibleWhen:{key:"chart-search-enabled",equals:true} },
  ],
};
const groups = ["开关", "自定义块", "数据库视图"];
const label = group => group;
const search = query => searchSettingsGroups(groups,settings,query,label);

assert.deepEqual(search(" "), [], "Blank query restores normal mode");
assert.deepEqual(search("not-found"), [], "Missing term returns empty state");

const byItem = search("地图服务商");
assert.equal(byItem.length,1);
assert.equal(byItem[0].group,"数据库视图");
assert.deepEqual(byItem[0].sections.map(s=>s.title),["地图视图"]);
assert.deepEqual(byItem[0].sections[0].items.map(i=>i.key),["map-provider"]);

const byHelp = search("允许搜索地点");
assert.deepEqual(byHelp[0].sections[0].items.map(i=>i.key),["map-search-enabled"]);
const combined = search("地图 服务商");
assert.deepEqual(combined[0].sections[0].items.map(i=>i.key),["map-provider"]);
const byCategory = search("数据库视图");
assert.equal(byCategory.length,2,
  "Global keyword may match an individual plugin toggle AND its category");
assert(byCategory.some(x=>x.group==="数据库视图"));
const bySection = search("计算块");
assert.equal(bySection[0].group,"自定义块");
assert.deepEqual(bySection[0].sections[0].items.map(i=>i.key),["math-format"]);
assert(!bySection[0].sections[0].items.some(i=>i.key==="math-enabled"),
  "Hidden section activation flags must never appear as search results");
assert.equal(search("折叠样式")[0].sections[0].title,"折叠块");
assert.equal(search("secret-private-data").length,0,
  "Never index saved user-entered text or credentials");
assert.equal(search("内部启用标记").length,0,
  "Hidden section flags and descriptions must not be searchable");
assert.equal(search("图表筛选条件").length,0,
  "Respect visibleWhen when searching");
assert.equal(search("flomo")[0].group,"开关",
  "Off modules remain discoverable through the plugin-enable switch");
assert.equal(search("搜索")[0].sections[0].title,"地图视图");
const dbSections = getSettingsSections("数据库视图",settings["数据库视图"]);
assert.deepEqual(dbSections.map(section => section.title), [
  "地图视图", "图表视图", "甘特视图", "日历视图", "时间线视图", "AI 自定义视图",
], "AI custom view must always be the last built-in database settings section");
assert(dbSections.at(-1).title==="AI 自定义视图" && dbSections.at(-1).items.length===0,
  "Database sections without global fields remain indexed by their heading");
const additionalDbSections = getSettingsSections("数据库视图",[
  ...settings["数据库视图"],
  {key:"other-option",type:"textinput",title:"其他设置",section:"其他选项",value:""},
]);
assert.deepEqual(additionalDbSections.slice(-2).map(section => section.title),
  ["其他选项", "AI 自定义视图"],
  "Even when later database setting groups are added, AI custom view stays last");
const searchSections = search("数据库视图").find(result => result.group==="数据库视图").sections;
assert.equal(searchSections.at(-1).title,"AI 自定义视图",
  "Global search must retain the same view section ordering");
const emptyView = search("AI 自定义视图");
assert.equal(emptyView[0].sections[0].title,"AI 自定义视图");

const translated = searchSettingsGroups(groups,settings,"custom blocks",
  group => group==="自定义块" ? "Custom Blocks" : group);
assert.equal(translated[0].group,"自定义块");
assert(translated[0].sections.some(section=>section.title==="计算块"),
  "A matching category shows its grouped settings, not just the title");

console.log("PASS: global search categories, sections, field titles/help, tokens, hidden fields, no values, empty views");