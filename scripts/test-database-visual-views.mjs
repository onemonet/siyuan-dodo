import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";
const read = async name => readFile(name, "utf8");
const base = "src/lets-database-view/visual";
const source = await read(`${base}/visual-types.ts`);
const { code } = await transformWithEsbuild(source, `${base}/visual-types.ts`, { loader: "ts", format: "esm" });
const visual = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const id = "20261018120000-abcdefg";
const other = "20261018130000-abcdefg";
assert.deepEqual(visual.parseVisualConfigs("{}"), {});
assert.deepEqual(visual.parseVisualConfigs("malformed"), {});
assert.deepEqual(visual.parseVisualConfigs("[]"), {});
assert.deepEqual(visual.parseVisualConfigs(JSON.stringify({
  [id]: { kind: "chart", chart: { type: "pie-basic", x: { column: "column-3" } }, enabled: false },
  [other]: { kind: "timeline", timeline: { fieldMapping: { startDate: "date-id" } } },
  malformed: { kind: "chart" }, ["20261018120000-notvalid"]: { kind: "foo" },
})), {
  [id]: { kind: "chart", enabled: false, chart: { type: "pie-basic", x: { column: "column-3" } }, timeline: {} },
  [other]: { kind: "timeline", enabled: true, chart: { type: "bar-basic" }, timeline: { fieldMapping: { startDate: "date-id" } } },
});
const [controller, module, styles, timeline, chartHtml, chartJs, config, map] = await Promise.all([
  read(`${base}/visual-view-service.ts`), read("src/lets-database-view/index.ts"),
  read("src/lets-database-view/database-view.css"), read("src/lets-custom-block/timeline/iframe/main.ts"),
  read(`${base}/chart-iframe.html`), read(`${base}/chart-iframe.js`),
  read("src/lets-database-view/map/map-view-service.ts"), read("src/lets-database-view/map/view-appearance.ts"),
]);
assert.match(controller, /this\.cached\.set\(blockId, next\)/);
assert.match(controller, /enabled: false.*Preserve mapped fields/);
assert.match(controller, /EChartsGeneratorService\.generateOption/);
assert.match(controller, /viewID: mounted\.viewId/);
assert.match(controller, /timeline\/iframe\/index\.html/);
assert.match(controller, /VISUAL_INITIALIZED_ATTR/);
assert.match(controller, /ensureNativeLucideIcon/);
assert.match(controller, /writeNativeViewAppearance/);
assert.match(controller, /\[VISUAL_ATTR\]: JSON\.stringify\(latest\)/);
assert.match(controller, /classList\.remove\(ACTIVE, "dodo-av-visual--chart"\)/);
assert.match(module, /new DatabaseVisualViews\(/);
assert.match(module, /this\.visualViews\.stop\(\)/);
assert.match(styles, /\.av__views > \.dodo-av-view-picker/);
assert.doesNotMatch(styles, /\.dodo-av-map-toggle/);
assert.doesNotMatch(styles, /\.dodo-av-visual-toggle/);
assert.match(controller, /querySelector<HTMLElement>\(':scope > \[data-type="av-filter"\]'\)/,
  "Unified picker must find the native Filter button on the right toolbar");
assert.match(controller, /tools\.insertBefore\(button, filterButton\)/,
  "Unified picker must sit immediately before Filter");
assert.match(controller, /existing\.nextElementSibling !== filterButton/,
  "An existing picker should be moved back next to Filter after native header rerenders");
assert.match(controller, /class="b3-menu__icon dodo-db-view-menu-icon"/,
  "Custom menu icons must use SiYuan's native menu sizing class");
assert.match(styles, /svg\.dodo-db-view-menu-icon\s*\{/,
  "Outline CSS must target custom menu SVGs");
assert.match(styles, /fill: none !important/,
  "Menu SVG outlines must beat SiYuan's fill theme styles");
assert.match(styles, /svg\.dodo-db-view-menu-icon :is\(path, rect, circle, line, polyline\)/,
  "Menu child shapes must stay unfilled");
for (const name of ["table", "map", "chart", "timeline"]) {
  assert.match(controller, new RegExp(`id: "${name}", label:`), `Missing ${name} custom view option`);
}
assert.match(controller, /<circle cx="12" cy="8" r="2"\/>/,
  "Map icon should use the Lucide map-pinned marker, not an approximate filled shape");
assert.match(controller, /new Menu\("dodo-db-view-picker"\)/);
assert.match(controller, /await this\.mapViews\.toggleView/);
assert.match(controller, /await this\.toggleView/);
assert.match(config, /async toggleView\(/);
assert.doesNotMatch(controller, /private ensureButtons\(/);
assert.doesNotMatch(config, /private ensureButtons\(/);
const chartPanel = await read("src/lets-custom-block/chart/ChartSettingsPanel.svelte");
assert.match(chartPanel, /export let databaseView:/);
assert.match(chartPanel, /PANEL_TYPES/);
assert.match(chartPanel, /MORE_TYPES/);
assert.match(chartPanel, /setRangeBound/);
assert.match(chartPanel, /addMarkLine/);
assert.match(chartPanel, /setPalette/);
assert.match(chartPanel, /setShowBarValues/);
assert.match(chartPanel, /checked=\{showBarValues\}/,
  "Bar value display must be a user-configurable toggle");

assert.match(chartPanel, /databaseView\.apply\(chartType, config\)/);
assert.match(controller, /columns\.find\(col => col\.type === "number"\)/,
  "New database charts must prefer a numeric Y column");
assert.match(controller, /columns\.find\(col => col\.type === "mSelect"\)/,
  "New charts may use multi-select Y when there is no numeric column");
assert.match(controller, /Y 轴只支持数字或多选列/,
  "New views without supported Y fields should fail clearly rather than auto-select invalid columns");
assert.match(chartPanel, /type !== "number" && \(type !== "mSelect"/,
  "Database Y dropdown must exclude all fields except number and mSelect");
assert.doesNotMatch(chartPanel, /value: CHART_RECORD_COUNT, label: "记录数量"/,
  "Do not offer record-count virtual metric as a selectable Y field");
assert.match(chartPanel, /chartAggregationIsFixed\(kind\)/,
  "Multi-select must be bound to fixed count rather than numeric submenus");
assert.match(chartPanel, /<FieldSelect options=\{iconFieldOptions\} value=\{xColumn\} allowEmpty=\{false\}/,
  "Chart X field must use the shared SiYuan icon dropdown, without an empty option");
assert.match(chartPanel, /<FieldSelect options=\{iconFieldOptions\} value=\{groupBy === GROUP_NONE \? "" : groupBy\}/,
  "Chart group field must use the same native-icon dropdown and preserve None mapping");
assert.match(chartPanel, /type: type \|\| "number"/,
  "Y-axis submenu options must retain the actual native SiYuan AV type");
assert.match(chartPanel, /<NestedSelectMenu options=\{yMenuOptions\} value=\{yColumn\} subValue=\{agg\}/,
  "Primary Y field must use the shared hierarchical menu");
assert.match(chartPanel, /on:select=\{\(event\) => setYColumn\(event\.detail\.value, event\.detail\.subValue\)\}/,
  "Y picker selection must save both keyID and common aggregation");
assert.doesNotMatch(chartPanel, /<span class="row-label">统计方式<\/span>/,
  "Aggregation must be inside the field submenu, not a separate selector");
assert.match(chartPanel, /children: type === "mSelect" \? undefined : availableAggOptions/,
  "Numeric options own the submenu; multi-select is a direct fixed-count item");
assert.match(chartPanel, /supportsMultiY =/,
  "Only Cartesian charts may offer multiple Y fields");
assert.match(chartPanel, /extraYColumns as extra, index/,
  "Extra Y columns must render as individual native dropdowns");
assert.match(chartPanel, /<NestedSelectMenu compact options=\{extraYMenuOptions\[index\]\} value=\{extra\} subValue=\{agg\}/,
  "Additional Y metrics must reuse the same hierarchical menu");
assert.match(chartPanel, /setExtraYColumn\(index, event\.detail\.value, event\.detail\.subValue\)/,
  "An extra Y metric's submenu must update shared aggregation");
assert.match(chartPanel, /fieldTypes\[i\] === "number"/,
  "Extra metrics must be restricted to numerical AV columns");
assert.match(chartPanel, /on:click=\{addYColumn\}/);
assert.match(chartPanel, /on:click=\{\(\) => removeExtraYColumn\(index\)\}/);
const generator = await read("src/lets-custom-block/chart/echarts-generator.ts");
assert.match(generator, /multiYIndexes\.length/,
  "Cartesian renderer must emit multiple independent numeric series");
assert.match(generator, /extraYColumns = config\?\.y\?\.columns/);
const schema = await read("src/lets-custom-block/chart/types.ts");
assert.match(schema, /columns\?: string\[\]/,
  "Extra column bindings must be serializable and backward-compatible");
assert.equal(JSON.parse(await read("package.json")).dependencies["bits-ui"], "0.22.0",
  "Shared submenu requires a pinned Svelte-4-compatible Bits UI version");
const sharedMenu = await read("src/components/ui/NestedSelectMenu.svelte");
assert.match(sharedMenu, /siyuanAvIcon\(option\.type \|\| "number"\)/,
  "Chart Y submenus must show original native SiYuan numeric icons");
assert.match(sharedMenu, /import \{ DropdownMenu \} from "bits-ui"/,
  "Shared menu must use Bits UI, not ad-hoc hover behavior");
for (const component of ["Root", "Trigger", "Content", "Sub", "SubTrigger", "SubContent", "Item"]) {
  assert.ok(sharedMenu.includes(`<DropdownMenu.${component}`), `Missing accessible Bits UI ${component}`);
}
assert.match(sharedMenu, /on:click=\{\(\) => choose\(option\.value, child\.value\)\}/,
  "Bits UI forwards m-click as a public click event; submenu choice must listen on:click");
assert.match(sharedMenu, /on:click=\{\(\) => choose\(option\.value\)\}/,
  "Direct multi-select item must select and close the menu");
assert.match(sharedMenu, /bind:open portal closeOnOutsideClick closeOnEscape/,
  "Popover must portal out of SiYuan's clipped modal and dismiss on Escape/outside click");
assert.match(sharedMenu, /selected\?\.type === "mSelect" \? "计数"/,
  "Multi-select is an immediate fixed count item");
assert.match(sharedMenu, /:global\(\.dodo-ui-nested-content\)/,
  "Public menu defines reusable SiYuan theme styles");
assert.match(sharedMenu, /overflow: visible;[^]*?:global\(\.dodo-ui-nested-sub\)/,
  "Parent menu must not clip an absolutely positioned right-side submenu");
assert.match(sharedMenu, /:global\(\.dodo-ui-nested-sub\) \{[^]*?overflow-y: auto;/,
  "Only the leaf submenu may scroll its statistical options");
assert.doesNotMatch(sharedMenu.match(/:global\(\.dodo-ui-nested-content\) \{([^]*?)\n  \}/)?.[1] || "", /overflow-y: auto/,
  "Root-level overflow-y:auto implicitly adds overflow-x:auto and clips submenus");
assert.match(controller, /new TimelineSettingsPanel\(/,
  "Native database timeline must reuse the standalone Svelte timeline settings UI");
const timelinePanel = await read("src/lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte");
assert.match(timelinePanel, /<FieldMapping definitions=\{TIMELINE_FIELD_DEFINITIONS\} table=\{mappingTable\} \{mapping\}/,
  "Both timeline settings modes must reuse the common mapping UI");
const fieldMappingUI = await read("src/components/ui/FieldMapping.svelte");
const fieldSelectUI = await read("src/components/ui/FieldSelect.svelte");
const fieldTypeIcons = await read("src/components/ui/av-column-icons.ts");
assert.match(fieldMappingUI, /fieldColumns\(columns, typed \? field\.acceptedTypes : undefined\)/,
  "Shared mapping component must enforce field type restrictions");
assert.match(fieldMappingUI, /resolveFieldBinding\(columns, stored,/,
  "Shared mapping must preserve keyID bindings when columns change names");
assert.match(fieldMappingUI, /\{#if field\.required\}/,
  "Required mappings must show asterisks");
assert.match(fieldMappingUI, /<FieldSelect options=\{optionsFor\(field, table, restrictTypes\)\}/,
  "The common mapping rows must use the icon-aware field dropdown");
assert.match(fieldMappingUI, /value=\{selectedValue\(field, mapping\?\.\[field\.key\] \|\| "", table, restrictTypes\)\}/,
  "Selecting 不使用 must react to changed mapping property, not silently keep showing old column");
assert.match(fieldMappingUI, /invalidLabel=\{invalidLabel\(field, mapping\?\.\[field\.key\] \|\| "", table, restrictTypes\)\}/,
  "Field validity must update when an old field is changed/deleted");
assert.match(fieldMappingUI, /allowEmpty=\{!field\.required\}/,
  "Optional fields support 不使用, required ones must not support clearing");
assert.match(fieldSelectUI, /on:click=\{\(\) => choose\(""\)\}/,
  "Selecting 不使用 must emit a persistent empty string");
assert.match(timelinePanel, /mapping\[field\] = value/,
  "Timeline setting must persist explicit empty fields instead of deleting the key");
assert.match(fieldSelectUI, /import \{ DropdownMenu \} from "bits-ui"/,
  "Native selects cannot show icons; reuse the accessible Bits UI dropdown");
assert.match(fieldSelectUI, /<DropdownMenu\.Item.*on:click=/,
  "Bits UI selection needs its public click event rather than m-click");
assert.match(fieldSelectUI, /siyuanAvIcon\(option\.type\)/,
  "Dropdown options must render real SiYuan AV type SVG icons");
assert.match(fieldSelectUI, /href=\{`#\$\{siyuanAvIcon\(option\.type\)\}`\}/,
  "Icon href must refer to the host SiYuan sprite instead of bundled icon assets");
assert.match(fieldTypeIcons, /date: "iconCalendar"/);
assert.match(fieldTypeIcons, /number: "iconNumber"/);
assert.match(fieldTypeIcons, /block: "iconKey"/);
assert.match(fieldTypeIcons, /mSelect: "iconList"/);
assert.match(fieldTypeIcons, /select: "iconListItem"/);
assert.match(fieldTypeIcons, /return type === "select"/,
  "SiYuan iconListItem is a solid path and must not be rendered with fill:none");
assert.match(fieldSelectUI, /class:is-solid=\{siyuanAvIconIsSolid\(option\.type\)\}/,
  "Every select-type option must render its native glyph with solid fill");
assert.match(fieldSelectUI, /fill: currentColor !important; stroke: none !important;/,
  "Solid SiYuan select icon must override global chart SVG fill:none rules");
const mapPanel = await read("src/lets-database-view/map/MapSettingsPanel.svelte");
const mapView = await read("src/lets-database-view/map/map-view-service.ts");
assert.match(mapView, /draftMapping = \{ \.\.\.draftMapping, \[event\.detail\.field\]: event\.detail\.value \}/,
  "Native database map should update draft mapping when selecting 不使用");
const mapSchema = await read("src/lets-database-view/map/map-field-schema.ts");
assert.match(mapPanel, /<FieldMapping definitions=\{MAP_FIELD_DEFINITIONS\}/,
  "Standalone map settings must reuse left-label, right-icon dropdown component");
assert.match(mapView, /mappingPanel = new FieldMapping\(/,
  "Native map view must also reuse the same shared mapping UI");
assert.match(mapView, /mappingPanel\?\.\$destroy\(\)/,
  "Native map view must destroy its shared Svelte component when dialog closes");
assert.match(mapSchema, /acceptedTypes: \["location"\]/);
assert.match(mapSchema, /acceptedTypes: \["mAsset"\]/);
assert.match(timelinePanel, /时间线占比（%）/);
assert.match(timelinePanel, /高度<FieldHelp/);
assert.match(timelinePanel, /PREVIEW_HEIGHT_PRESETS/);
assert.doesNotMatch(timelinePanel, /预览高度（px）|setPreviewHeight/);
assert.match(mapPanel, /<option value=\{option.value\}>\{option.label\}<\/option>/);
assert.match(mapPanel, /MapBlockService\.setHeight\(mapBlockId, next\)/);
assert.match(mapView, /heightText\.textContent = "高度"/);
assert.match(mapView, /heightSelect\.addEventListener\("change"/);
assert.match(mapView, /attachment\.iframe\.style\.height = String\(nextHeight\) \+ "px"/);
assert.match(mapView, /this\.configs\.get\(blockId\)\?\.\[viewId\]\?\.height/);
assert.match(timelinePanel, /开始位置/);
assert.match(timelinePanel, /row-readonly/,
  "Database title must be displayed as read-only, not manually edited");
assert.match(timelinePanel, /\{#if !databaseView\}/,
  "Standalone source binding must not appear in database view settings");
assert.match(controller, /timelinePreviewHeight\(config\.height\)/,
  "Database timeline preview height must use saved appearance settings");
assert.match(controller, /const matched = resolveTimelineColumns\(/,
  "Timeline settings must validate required typed columns before persistence");
assert.match(controller, /new ChartSettingsPanel\(/);
assert.match(controller, /\[VISUAL_ATTR\]: JSON\.stringify\(latest\)/,
  "View-chart adapter should persist the full chart config by view ID");
assert.match(timeline, /sourceType: "database", sourceBlockId: blockId, sourceAvID: avID, sourceViewID: viewId/);
assert.match(timeline, /dodoVisualRefresh/);
assert.match(timeline, /const unbound = config\.sourceType !== "database"/, "Database timelines must not offer legacy sample table creation");
assert.match(timeline, /const savedConfig = await waitForSavedConfig\(blockId\)/,
  "Existing standalone timeline blocks must remain supported");
assert.match(chartHtml, /stage\/protyle\/js\/echarts\/echarts\.min\.js/);
assert.match(chartJs, /dodoVisualChartOption/);
assert.match(map, /DODO_MAP_ICON_FILE/);
assert.match(config, /MAP_VIEWS_ATTR/);
console.log("PASS: unified view menu directly left of Filter, chart settings, persistence and compatibility");
