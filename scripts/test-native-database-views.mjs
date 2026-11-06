import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=path=>readFile(path,"utf8");
const [controller,visual,store,schema,frame,map,custom,settings,chart,chartSettings,timeline,css]=await Promise.all([
  read("src/lets-database-view/map/map-view-service.ts"),
  read("src/lets-database-view/visual/visual-view-service.ts"),
  read("src/lets-database-view/view-config-store.ts"),
  read("src/lets-database-view/view-config-schema.ts"),
  read("src/lets-database-view/map/iframe/main.ts"),
  read("src/lets-database-view/map/map-block-service.ts"),
  read("src/lets-custom-block/index.ts"),
  read("src/lets-custom-block/plugin.ts"),
  read("src/lets-custom-block/chart/echarts-generator.ts"),
  read("src/lets-custom-block/chart/ChartSettingsPanel.svelte"),
  read("src/lets-custom-block/timeline/iframe/main.ts"),
  read("src/lets-database-view/database-view.css"),
]);
assert.match(schema,/custom-dodo-views/);
assert.match(schema,/schemaVersion: 1/);
assert.match(store,/this\.pending\.set\(blockId, task\)/,"Same DB writes are queued");
assert.match(controller,/DatabaseViewConfigStore\.updateView\(blockId,viewId/);
assert.match(visual,/DatabaseViewConfigStore\.updateView\(blockId,viewId/);
assert.match(controller,/activeMapConfigs\(await DatabaseViewConfigStore\.load\(blockId\)\)/);
assert.match(visual,/activeVisualConfigs\(await DatabaseViewConfigStore\.load\(blockId\)\)/);
assert.match(visual,/configs:\{\.\.\.entry\.configs/,"Mode switching must preserve prior type settings");
assert.match(visual,/mode:entry\.mode===kind\?"table":kind/);
assert.match(controller,/mode:active\?"table":"map"/);
assert.match(controller,/this\.mapViews|refresh\(\)/);
assert.match(visual,/new Menu\("dodo-db-view-picker"\)/);
const registry = await read("src/lets-database-view/view-registry.ts");
for(const mode of ["table","map","chart","timeline","gantt","calendar","custom"])
  assert.match(registry,new RegExp('id: "'+mode+'", label:'),"Missing native view: "+mode);
assert.match(visual,/classList\.remove\(ACTIVE, "dodo-av-visual--chart", "dodo-av-visual--gantt", "dodo-av-visual--calendar", "dodo-av-visual--custom"\)/);
assert.match(await read("src/lets-database-view/visual/chart-renderer.ts"),/EChartsGeneratorService\.generateOption/);
for(const file of ["visual/chart-renderer.ts","gantt/gantt-renderer.ts","calendar/calendar-renderer.ts"])
  assert.match(await read("src/lets-database-view/" + file),/viewID:\s*mounted\.viewId/);
const visualSettings = await read("src/lets-database-view/visual/visual-settings.ts");
assert.match(visualSettings,/TimelineSettingsPanel/);
assert.match(visualSettings,/new ChartSettingsPanel/);
assert.match(chartSettings,/export let databaseView:/);
assert.match(chart,/generateOption/);
assert.match(frame,/readDatabaseViewDocument\(attrs\[DATABASE_VIEWS_ATTR\]\)/);
assert.match(timeline,/const VIEWS_ATTR = "custom-dodo-views"/);
assert.doesNotMatch(timeline,/custom-dodo-database-visual-views/);
assert.match(map,/DatabaseViewConfigStore\.load\(mapBlockId\)/);
assert.match(map,/DatabaseViewConfigStore\.load\(mapBlockId\)/);
assert.doesNotMatch(map,/static isMapBlock|createMapBlockAtCaret|static setMapSource|MAP_VIEWS_ATTR/);
assert.doesNotMatch(custom,/ChartBlockService|TimelineConverterService|openMapSettings|map-auto-refresh|chart-auto-refresh|timeline-auto-refresh/);
assert.doesNotMatch(settings,/"chart-enabled"|"map-enabled"|"timeline-enabled"/);
assert.match(css,/dodo-av-map--active/);
assert.match(css,/dodo-av-visual--active/);
console.log("PASS: seven database view modes share one viewID-keyed schema; existing renderers preserve configuration, with standalone entrypoints removed");