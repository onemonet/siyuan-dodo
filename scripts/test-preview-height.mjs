import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const path = "src/components/ui/preview-height.ts";
const source = readFileSync(path, "utf8");
const result = await transformWithEsbuild(source, path, { loader: "ts", format: "esm" });
const heights = await import("data:text/javascript;base64," + Buffer.from(result.code).toString("base64"));
assert.deepEqual(heights.PREVIEW_HEIGHT_PRESETS.map(({ label, value }) => [label, value]),
  [["小", 320], ["中", 520], ["大", 720], ["特大", 960]]);
assert.equal(heights.normalizePreviewHeight(undefined), 520);
assert.equal(heights.normalizePreviewHeight(600), 600, "Keep old custom heights");
assert.equal(heights.normalizePreviewHeight(1800), 1200);
assert.equal(heights.heightPresetValue(600), 520);
assert.equal(heights.heightPresetValue(850), 960);
for (const option of heights.PREVIEW_HEIGHT_PRESETS) assert.equal(heights.isPreviewHeightPreset(option.value), true);
assert.equal(heights.isPreviewHeightPreset(600), false);
const timeline = readFileSync("src/lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte", "utf8");
assert.match(timeline, /setHeightPreset\(event\.currentTarget\.value\)/);
assert.doesNotMatch(timeline, /预览高度（px）/);
const map = readFileSync("src/lets-database-view/map/map-view-service.ts", "utf8");
assert.match(map, /heightSelect\.addEventListener\("change"/);
assert.match(map, /JSON\.stringify\(current\)/);
const standalone = readFileSync("src/lets-database-view/map/MapSettingsPanel.svelte", "utf8");
assert.match(standalone, /MapBlockService\.setHeight\(mapBlockId, next\)/);
const mapHtml = readFileSync("dist/preview/map/index.html", "utf8");
assert.match(mapHtml, /main\.js\?v=20261019-height4/);
const iframe = readFileSync("dist/preview/map/main.js", "utf8");
assert.match(iframe, /frame\.style\.height = String\(config\.height \?\? 520\) \+ "px"/);
assert.match(iframe, /!isDatabaseMapView && config\.height !== (?:undefined|void 0)/,
  "Original standalone iframe height must remain unchanged if no setting was saved");
const mapBlock = readFileSync("src/lets-database-view/map/map-block-service.ts","utf8");
assert.match(mapBlock, /JSON\.stringify\(\{ \.\.\.existing, fieldMapping \}\)/,
  "Changing the map source must retain the saved height");
console.log("PASS: map/timeline 4 shared height presets, legacy heights, instant resize and iframe persistence");