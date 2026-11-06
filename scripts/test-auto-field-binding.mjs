import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const { materializeTimelineFieldMapping, resolveTimelineColumns, TIMELINE_FIELD_DEFINITIONS } =
    await server.ssrLoadModule("/src/lets-custom-block/timeline/services/field-mapping.ts");
  const { materializeChartFieldBindings } =
    await server.ssrLoadModule("/src/lets-custom-block/chart/chart-field-initializer.ts");
  const { EChartsGeneratorService } =
    await server.ssrLoadModule("/src/lets-custom-block/chart/echarts-generator.ts");
  const id = n => `20261018221000-${String(n).padStart(7,"a")}`;
  const table = { headers: ["项目", "开始时间", "分组", "得分", "说明"],
    columnIds: [id("b"), id("c"), id("d"), id("e"), id("f")],
    columnNames: ["项目", "开始时间", "分组", "得分", "说明"],
    fieldTypes: ["block", "date", "select", "number", "text"] };
  // Standalone Markdown timelines also bind required fields only at creation.
  const { TimelineBlockConfigService } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/block-config-service.ts");
  const markdown = TimelineBlockConfigService.buildDefaultConfig("new-table", ["标题", "开始时间", "结束时间", "说明"]);
  assert.equal(markdown.fieldMapping.title, "标题");
  assert.equal(markdown.fieldMapping.startDate, "开始时间");
  for (const field of TIMELINE_FIELD_DEFINITIONS.filter(definition => !definition.required)) {
    assert.equal(markdown.fieldMapping[field.key], "", "New Markdown timeline must not auto-bind " + field.key);
  }
  const emptySource = TimelineBlockConfigService.buildDefaultConfig("new-unbound", []);
  for (const field of TIMELINE_FIELD_DEFINITIONS.filter(definition => !definition.required)) {
    assert.equal(emptySource.fieldMapping[field.key], "", "Unbound new timeline must default to 不使用");
  }

  const once = materializeTimelineFieldMapping(table, {});
  assert.equal(once.changed,true);
  assert.equal(once.mapping.title,table.columnIds[0],"First pass auto-binds the primary key ID");
  assert.equal(once.mapping.startDate,table.columnIds[1],"Dates bind by keyID");
  for (const definition of TIMELINE_FIELD_DEFINITIONS.filter(field => !field.required)) {
    assert.equal(once.mapping[definition.key], "", "Optional " + definition.key + " must default to 不使用");
  }
  assert.ok(TIMELINE_FIELD_DEFINITIONS.every(def=>Object.hasOwn(once.mapping,def.key)),
    "All fields must be initialized, including empty/unused fields");
  assert.equal(resolveTimelineColumns(table.headers,once.mapping,5,table.columnIds,table.columnNames,table.fieldTypes).media,null,
    "Rendering must not auto-bind unused optional fields");
  const renamed = { ...table, headers: ["景点", "旅行开始日", "标签", "总分", "备注"],
    columnNames: ["景点", "旅行开始日", "标签", "总分", "备注"] };
  assert.equal(materializeTimelineFieldMapping(renamed,once.mapping).changed,false,
    "Renaming every column must not modify already persisted keyIDs");
  assert.equal(resolveTimelineColumns(renamed.headers,once.mapping,5,renamed.columnIds,renamed.columnNames,renamed.fieldTypes).title,0);
  const newMedia = { ...renamed,headers:[...renamed.headers,"媒体"],columnNames:[...renamed.columnNames,"媒体"],
    columnIds:[...renamed.columnIds,id("g")],fieldTypes:[...renamed.fieldTypes,"mAsset"] };
  assert.equal(materializeTimelineFieldMapping(newMedia,once.mapping).changed,false,
    "Adding an optional matching column later must not silently enable it");
  assert.equal(resolveTimelineColumns(newMedia.headers,once.mapping,6,newMedia.columnIds,newMedia.columnNames,newMedia.fieldTypes).media,null,
    "New asset cannot activate a previously unused optional field");
  const manuallyEnabled = { ...once.mapping, group: table.columnIds[2], description: table.columnIds[4] };
  assert.equal(materializeTimelineFieldMapping(table, manuallyEnabled).changed, false,
    "Existing manual optional bindings must stay untouched");
  const manualResolved = resolveTimelineColumns(table.headers, manuallyEnabled, 5,
    table.columnIds, table.columnNames, table.fieldTypes);
  assert.equal(manualResolved.group, 2);
  assert.equal(manualResolved.description, 4);
  const deleted = { ...table, columnIds:[id("z"),...table.columnIds.slice(1)],
    headers:["项目",...table.headers.slice(1)],columnNames:["项目",...table.columnNames.slice(1)] };
  assert.equal(materializeTimelineFieldMapping(deleted,once.mapping).mapping.title,table.columnIds[0],
    "Deleting/recreating a same-name primary field must NOT silently rebind its old ID");
  assert.equal(resolveTimelineColumns(deleted.headers,once.mapping,5,deleted.columnIds,deleted.columnNames,deleted.fieldTypes).title,null);
  const duplicated = { ...table,headers:["事件","事件","日期"],columnNames:["事件","事件","日期"],
    columnIds:[id("h"),id("i"),id("j")],fieldTypes:["text","text","date"] };
  assert.equal(materializeTimelineFieldMapping(duplicated,{title:"事件"}).mapping.title,"事件",
    "Ambiguous legacy names must be preserved as unresolved instead of guessing");
  assert.equal(materializeTimelineFieldMapping(table,{title:"项目"}).mapping.title,table.columnIds[0],
    "Unambiguous legacy name should migrate to stable keyID once");
  const explicitOff = materializeTimelineFieldMapping(newMedia,{...once.mapping,group:""});
  assert.equal(explicitOff.mapping.group,"");assert.equal(explicitOff.changed,false);
  const descriptionDefinition = TIMELINE_FIELD_DEFINITIONS.find(field => field.key === "description");
  const backgroundDefinition = TIMELINE_FIELD_DEFINITIONS.find(field => field.key === "backgroundColor");
  assert.deepEqual(descriptionDefinition.acceptedTypes, ["text"]);
  assert.deepEqual(backgroundDefinition.acceptedTypes, ["text"]);
  const { fieldSelectOptions } = await server.ssrLoadModule("/src/shared/av/field-binding.ts");
  for (const field of [descriptionDefinition, backgroundDefinition]) {
    assert.deepEqual(fieldSelectOptions(table, field.acceptedTypes).map(item=>item.value), [table.columnIds[4]],
      field.key + " picker must list only text columns");
    const wrongType = { ...once.mapping, [field.key]: table.columnIds[0] };
    assert.equal(resolveTimelineColumns(table.headers,wrongType,5,table.columnIds,table.columnNames,table.fieldTypes)[field.key],null,
      "Invalid old field type may not be silently used");
    assert.equal(materializeTimelineFieldMapping(table,wrongType).mapping[field.key],table.columnIds[0],
      "Old invalid keyID should remain saved for manual correction");
  }
  const minimalTable = { headers:["主键","日期"],columnIds:[id("k"),id("l")],
    columnNames:["主键","日期"],fieldTypes:["block","date"] };
  const minimalOnce=materializeTimelineFieldMapping(minimalTable,{});
  assert.equal(minimalOnce.mapping.media,"","First-time unmatched field gets a permanent explicit unused sentinel");
  const addAfter={ ...minimalTable,headers:[...minimalTable.headers,"附件"],columnIds:[...minimalTable.columnIds,id("m")],
    columnNames:[...minimalTable.columnNames,"附件"],fieldTypes:[...minimalTable.fieldTypes,"mAsset"] };
  assert.equal(materializeTimelineFieldMapping(addAfter,minimalOnce.mapping).mapping.media,"");
  assert.equal(resolveTimelineColumns(addAfter.headers,minimalOnce.mapping,3,addAfter.columnIds,addAfter.columnNames,addAfter.fieldTypes).media,null);
  assert.equal(resolveTimelineColumns(table.headers,{},5,table.columnIds,table.columnNames,table.fieldTypes).title,null,
    "A runtime without stored keyID must not perform automatic selection");
  assert.equal(resolveTimelineColumns(table.headers,{title:"项目"},5,table.columnIds,table.columnNames,table.fieldTypes).title,null,
    "Runtime refuses old column names until one-time migration persists a keyID");

  const chart = materializeChartFieldBindings(table,{type:"bar-basic"});
  assert.equal(chart.changed,true);
  assert.equal(chart.config.y.column,table.columnIds[3]);
  assert.equal(chart.config.x.column,table.columnIds[0]);
  assert.equal(materializeChartFieldBindings(renamed,chart.config).changed,false);
  const staleChart = {type:"bar-basic",x:{column:id("missing")},y:{column:table.columnIds[3]}};
  assert.equal(materializeChartFieldBindings(table,staleChart).config.x.column,id("missing"),
    "Deleting chart X may not silently switch to a new column");
  const grouped = materializeChartFieldBindings(table,{y:{column:table.columnIds[3],groupBy:"分组"},x:{column:table.columnIds[0]}});
  assert.equal(grouped.config.y.groupBy,table.columnIds[2],"Existing chart group name must migrate to keyID");
  assert.equal(materializeChartFieldBindings(table,{x:{column:""},y:{column:""}}).changed,false,
    "An explicit empty chart mapping is not permission to automatically rematch");
  const emptyChart = materializeChartFieldBindings({headers:["文本"],columnIds:[id("p")],fieldTypes:["text"]},{});
  assert.equal(emptyChart.config.y.column,"","No valid Y match should be stored as explicit empty sentinel");
  assert.equal(materializeChartFieldBindings({headers:["文本","数量"],columnIds:[id("p"),id("q")],fieldTypes:["text","number"]},emptyChart.config).config.y.column,"",
    "A metric appearing later must not silently change first-time no-match state");

  const nativeData = { ...table, hasHeader:true,rows:[["项目A","2026-10-18","单选A","12","说明"]],numericColumns:[3] };
  assert.throws(() => EChartsGeneratorService.generateOption(nativeData,"bar-basic",
    {x:{column:"项目"},y:{column:table.columnIds[3]}}), /keyID/,
    "Database rendering must reject legacy column names, even if names happen to match");
  assert.throws(() => EChartsGeneratorService.generateOption(nativeData,"bar-basic",
    {x:{column:""},y:{column:table.columnIds[3]}}), /keyID/,
    "An explicit empty database axis must not silently fall back to the first column");
  assert.doesNotThrow(() => EChartsGeneratorService.generateOption(nativeData,"bar-basic",chart.config),
    "A saved native chart keyID configuration must render normally");

  const ui=await readFile("src/components/ui/FieldMapping.svelte","utf8");
  const select=await readFile("src/components/ui/FieldSelect.svelte","utf8");
  assert.match(ui,/allowEmpty=\{!field\.required\}/);
  assert.match(ui,/field\.required \? "请选择字段" : "不使用"/);
  assert.doesNotMatch(ui,/（自动）|自动匹配/);
  assert.doesNotMatch(select,/（自动）|自动匹配/);
  const visual=await readFile("src/lets-database-view/visual/visual-view-service.ts","utf8");
  assert.match(visual,/materializeTimelineFieldMapping\(table, current\.timeline\?\.fieldMapping/);
  assert.match(visual,/materializeChartFieldBindings\(table, current\.chart/);
  assert.match(visual,/await setBlockAttrs\(blockId, \{ \[VISUAL_ATTR\]: JSON\.stringify\(configs\) \}\)/);
  const map=await readFile("src/lets-database-view/map/map-block-service.ts","utf8");
  assert.match(map,/coordinate: coord >= 0 \? table\.columnIds\[coord\]/);
  console.log("PASS: one-time keyIDs persisted; rename/reorder stable; deletion/no-match/ambiguity never rematch; UI has no Auto");
} finally { await server.close(); }
