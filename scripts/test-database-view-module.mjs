import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";
const read = async path => readFile(path, "utf8");
const root = "src/lets-database-view";
const [metadata, module, controller, legacy, global, mapData, iframe] = await Promise.all([
  read(`${root}/plugin.ts`), read(`${root}/index.ts`),
  read(`${root}/map/map-view-service.ts`), read("src/lets-custom-block/index.ts"),
  read(`${root}/global-settings.ts`), read(`${root}/map/map-data.ts`),
  read(`${root}/map/iframe/main.ts`),
]);
assert.match(metadata, /name: "database-view"/);
assert.match(metadata, /key: "map-view-enabled"/);
assert.match(metadata, /key: "map-provider"/);
assert.doesNotMatch(legacy, /new DatabaseMapViews\(/, "数据库地图必须由新模块独立接管");
assert.match(module, /new DatabaseMapViews\(/);
assert.match(module, /settings\.getBySpace\("custom-block", key\)/,
  "迁移时从原有设置命名空间保留已保存的底图参数");
assert.match(module, /this\.mapViews\.getFrameContext\(source\)/,
  "只接受已挂载的当前视图 iframe 消息");
assert.match(global, /settings\.getBySpace\("database-view", key\)/);
assert.match(global, /settings\.getBySpace\("custom-block", key\)/);
assert.match(controller, /MAP_VIEWS_ATTR/);
assert.match(mapData, /MAP_VIEWS_ATTR = "custom-dodo-map-views"/);
assert.match(mapData, /\/plugins\/siyuan-dodo\/preview\/map\/index\.html/,
  "已有 iframe 链接不得随源码移动而改变");
assert.match(iframe, /viewID: databaseViewId/);
assert.match(legacy, /this\.isMapFrameSource\(source\)/,
  "旧独立地图块仍由兼容控制器处理");
const appearance = await read(`${root}/map/view-appearance.ts`);
const svg = await read(`${root}/assets/lucide-map-pinned.svg`);
assert.match(appearance, /setAttrViewViewName/);
assert.match(appearance, /setAttrViewViewIcon/);
assert.match(appearance, /\/api\/transactions/);
assert.match(appearance, /\/api\/system\/addCustomEmoji/);
assert.doesNotMatch(appearance, /originalAppearanceToRestore/);
assert.doesNotMatch(controller, /originalAppearanceToRestore/);
assert.match(controller, /if \(firstConversion\)/);
assert.match(controller, /initialized\[viewId\] = true/);
assert.match(controller, /\[MAP_VIEW_INITIALIZED_ATTR\]: JSON\.stringify\(initialized\)/);
assert.match(controller, /const previousMap = updated\[viewId\]/);
assert.match(controller, /if \(previousMap\) \{\s*delete updated\[viewId\];/);
assert.match(controller, /const name = shouldUseDefaultMapName\(previous\.name\)/);
assert.match(controller, /if \(!icon\) \{/);
assert.match(controller, /originalView:\s*\{\s*name: previous\.name, icon: previous\.icon, appliedIcon: identity\.next\.icon/);
assert.match(controller, /\.\.\.latest\[viewId\], fieldMapping:/,
  "保存字段映射不得丢失原视图的名称与图标元数据");
assert.match(mapData, /originalView\?:/);
assert.match(mapData, /appliedIcon: original\.appliedIcon/);
assert.match(svg, /<svg[^>]+viewBox="0 0 24 24"/);
assert.doesNotMatch(svg, /<script|onload=/i);


// Execute the actual pure parser and the first-use default-name predicate.
const stateCode = await read(`${root}/map/view-appearance-state.ts`);
const { code: compiledState } = await transformWithEsbuild(stateCode, `${root}/map/view-appearance-state.ts`, { loader: "ts", format: "esm" });
const state = await import(`data:text/javascript;base64,${Buffer.from(compiledState).toString("base64")}`);
const testID = "20261018123456-abcdefg";
const otherID = "20261018123456-hijklmn";
assert.deepEqual(state.parseInitializedMapViews(), {});
assert.deepEqual(state.parseInitializedMapViews("invalid json"), {});
assert.deepEqual(state.parseInitializedMapViews("[]"), {});
assert.deepEqual(state.parseInitializedMapViews(JSON.stringify({
  [testID]: true, [otherID]: false, invalid: true, ["__proto__"]: false,
})), { [testID]: true });
const savedOnce = { ...state.parseInitializedMapViews(), [testID]: true };
const restoredAfterMapOff = state.parseInitializedMapViews(JSON.stringify(savedOnce));
assert.equal(restoredAfterMapOff[testID], true,
  "关闭地图后再次读取应记得该视图曾经设置过默认名称和图标");
assert.equal(restoredAfterMapOff[otherID], undefined,
  "其他视图仍应被识别为首次转换");
for (const value of ["表格", "表格 2", "Table", "Table 1", ""]) {
  assert.equal(state.shouldUseDefaultMapName(value), true, value);
}
for (const value of ["旅行足迹", "地点地图", "自定义 Table", "My table"]) {
  assert.equal(state.shouldUseDefaultMapName(value), false, value);
}

console.log("PASS: database-view is an independent sub-plugin; settings, iframe URL, viewID and legacy map compatibility retained");
