import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const { TimelineTransformerService } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/timeline-transformer.ts");
  const { TimelineTableProvider } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/table-provider.ts");
  const { TIMELINE_FIELD_DEFINITIONS, materializeTimelineFieldMapping, resolveTimelineColumns } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/field-mapping.ts");
  const { fieldSelectOptions } = await server.ssrLoadModule("/src/shared/av/field-binding.ts");
  const id = (value) => `20261018120000-${value}`;
  const labels = ["标题", "开始时间", "结束时间", "说明", "分组", "显示日期", "媒体", "媒体说明", "媒体来源", "媒体缩略图", "背景颜色", "背景图片"];
  const fieldTypes = ["block", "date", "date", "text", "select", "text", "mAsset", "text", "text", "mAsset", "text", "url"];
  const ids = labels.map((_, index) => id(String(index).padStart(7,"a")));
  const mapping = Object.fromEntries(TIMELINE_FIELD_DEFINITIONS.map(field => [field.key, ids[labels.indexOf(field.label)]]));
  const table = {
    headers: labels, columnNames: labels, columnIds: ids, fieldTypes, hasHeader: true,
    rows: [["发布", "2026-10-18", "2026-10-20", "说明正文", "项目", "活动期间", "![主图](assets/hero.jpg)", "海报说明", "照片来源", "![缩略](assets/thumb.jpg)", "#334455", "https://example.com/bg.jpg"]],
  };
  const retiredMapping = { ...mapping, mediaCredit: ids[8], mediaThumbnail: ids[9] };
  const result = TimelineTransformerService.transform(table, {sourceType:"database",sourceBlockId:id("zzzzzzz"),fieldMapping:retiredMapping});
  const event = result.events[0];
  assert.equal(event.text.headline, "发布");
  assert.equal(event.text.text, "说明正文");
  assert.equal(event.group, "项目");
  assert.equal(event.display_date,"活动期间");
  assert.deepEqual(event.media, {url:"/assets/hero.jpg", thumbnail:"/assets/hero.jpg", thumb:"/assets/hero.jpg", caption:"海报说明"},
    "Retired credit/thumbnail bindings must be ignored; the main image remains its own thumbnail and caption is retained");
  assert.deepEqual(TIMELINE_FIELD_DEFINITIONS.filter(field => field.key.startsWith("media")).map(field => field.key),
    ["media", "mediaCaption"], "Timeline settings should expose only Media and Media Caption");
  const initializedMapping = materializeTimelineFieldMapping(table, {});
  assert.equal("mediaCredit" in initializedMapping.mapping, false);
  assert.equal("mediaThumbnail" in initializedMapping.mapping, false);
  const restored = TimelineTransformerService.transform(table, {sourceType:"database",sourceBlockId:id("zzzzzzz"),fieldMapping:mapping});
  assert.deepEqual(restored.events[0].media, event.media,
    "Legacy persisted credit/thumbnail mappings must not change how media is rendered");
  assert.deepEqual(event.background, {color:"#334455",url:"https://example.com/bg.jpg"});
  assert.deepEqual(Object.keys(event.start_date), ["year","month","day"]);
  const required = TIMELINE_FIELD_DEFINITIONS.filter(field => field.required).map(field => field.key);
  assert.deepEqual(required, ["title","startDate"]);
  assert.deepEqual(TIMELINE_FIELD_DEFINITIONS.slice(1,4).map(field => field.key),
    ["startDate", "endDate", "displayDate"],
    "Timeline mapping UI should show Start -> End -> Display Date together in order");
  const displayDateDefinition = TIMELINE_FIELD_DEFINITIONS.find(field => field.key === "displayDate");
  assert.deepEqual(displayDateDefinition?.acceptedTypes,["text"],
    "Display Date is a text-only optional field, not a date source");
  const displayOptions = fieldSelectOptions(table, displayDateDefinition.acceptedTypes);
  assert.deepEqual(displayOptions.map(option => option.value),
    ids.filter((_, i) => fieldTypes[i] === "text"),
    "Display Date dropdown must offer only text columns, never Start/End date columns");
  const wrongDisplayDateMapping = {...mapping, displayDate: ids[2]};
  const withoutDisplayDate = {...mapping, displayDate: ""};
  assert.equal(resolveTimelineColumns(table.headers, wrongDisplayDateMapping, table.headers.length,
    table.columnIds, table.columnNames, table.fieldTypes).displayDate, null,
    "A previously bound date column is invalid for Display Date and must not be silently remapped");
  assert.equal(TimelineTransformerService.transform(table, { sourceType:"database", fieldMapping:wrongDisplayDateMapping })
    .events[0].display_date,
    TimelineTransformerService.transform(table, { sourceType:"database", fieldMapping:withoutDisplayDate })
    .events[0].display_date,
    "Invalid Display Date binding should fall back to generated Start/End date text");
  const initialized = materializeTimelineFieldMapping(table, {});
  assert.equal(initialized.mapping.displayDate, "",
    "Optional display date is not auto-bound on first creation");
  for (const definition of TIMELINE_FIELD_DEFINITIONS.filter(field => !field.required)) {
    assert.equal(initialized.mapping[definition.key], "",
      "All optional fields start unbound: " + definition.key);
  }
  assert.equal(materializeTimelineFieldMapping(table, wrongDisplayDateMapping).mapping.displayDate, ids[2],
    "Existing keyID must be preserved as invalid; user must manually select a text column");
  for (const key of ["description", "backgroundColor"]) {
    const def = TIMELINE_FIELD_DEFINITIONS.find(field => field.key === key);
    assert.deepEqual(def?.acceptedTypes, ["text"], key + " only supports text columns");
    assert.deepEqual(fieldSelectOptions(table, def.acceptedTypes).map(option=>option.value),
      ids.filter((_,i)=>fieldTypes[i] === "text"),
      key + " must not list block, template or select columns");
  }
  assert.deepEqual(TIMELINE_FIELD_DEFINITIONS.find(field=>field.key==="media")?.acceptedTypes,["mAsset","url","text"]);
  assert.deepEqual(TIMELINE_FIELD_DEFINITIONS.find(field=>field.key==="backgroundImage")?.acceptedTypes,["mAsset","url","text"]);
  assert.throws(() => TimelineTransformerService.transform({...table,fieldTypes:fieldTypes.map((type,i)=>i===1?"number":type)},
    {sourceType:"database",sourceBlockId:id("zzzzzzz"),fieldMapping:mapping}), /开始时间/);
  assert.throws(() => TimelineTransformerService.transform({...table,fieldTypes:fieldTypes.map((type,i)=>i===0?"number":type)},
    {sourceType:"database",sourceBlockId:id("zzzzzzz"),fieldMapping:mapping}), /标题/);
  // Plain Markdown tables are untyped and must retain header-only field mappings.
  assert.equal(TimelineTransformerService.transform({...table,columnIds:undefined,columnNames:undefined,fieldTypes:undefined},
    {sourceType:"table",sourceBlockId:id("zzzzzzz"),fieldMapping:Object.fromEntries(Object.entries(mapping).map(([key,v])=>[key,labels[ids.indexOf(v)]]))}).events.length,1);
  // Test the real renderAttributeView response schema: top-level name is the
  // database name; view.name is only the tab and must never replace the cover.
  const oldFetch = globalThis.fetch;
  let currentDatabaseName = "旅行记录数据库";
  const titleID = id("bbbbbbb");
  const dateID = id("ccccccc");
  try {
    globalThis.fetch = async (url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(payload.id, id("ddddddd"));
      if (url === "/api/av/getAttributeView") {
        return new Response(JSON.stringify({ code: 0, data: { av: { name: currentDatabaseName } } }),
          { status: 200, headers: { "Content-Type": "application/json" } });
      }
      assert.equal(url, "/api/av/renderAttributeView");
      return new Response(JSON.stringify({ code: 0, data: {
        view: { name: "时间线（当前视图名）",
          columns: [{ id: titleID, name: "事件", type: "block" }, { id: dateID, name: "日期", type: "date" }],
          rows: [{ cells: [
            { value: { keyID: titleID, block: { content: "开始旅行" } } },
            { value: { keyID: dateID, date: { isNotEmpty: true, content: Date.UTC(2026, 9, 18), isNotTime: true } } },
          ] }],
        },
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const dbConfig = { sourceType: "database", sourceAvID: id("ddddddd"),
      sourceBlockId: id("eeeeeee"), sourceViewID: id("fffffff"),
      fieldMapping: { title: titleID, startDate: dateID }, title: "时间线" };
    const loaded = await TimelineTableProvider.load(dbConfig.sourceBlockId, dbConfig);
    assert.equal(loaded.sourceName, currentDatabaseName);
    assert.equal(TimelineTransformerService.transform(loaded, dbConfig).title.text.headline, currentDatabaseName);
    assert.equal(TimelineTransformerService.transform(loaded, { ...dbConfig, title: "我的旅程" }).title.text.headline, currentDatabaseName,
      "Database timeline must always use the live database name, even when legacy custom title remains saved");
    assert.equal(TimelineTransformerService.transform(loaded, { ...dbConfig, sourceType: "table", title: "我的旅程" }).title.text.headline, "我的旅程",
      "Standalone Markdown time line keeps its manually set title");
    assert.equal(TimelineTransformerService.transform(loaded, { ...dbConfig, sourceType: "table" }).title.text.headline, "时间线",
      "Markdown table titles keep their old default");
    currentDatabaseName = "更新后的旅行数据库";
    const renamed = await TimelineTableProvider.load(dbConfig.sourceBlockId, dbConfig);
    assert.equal(TimelineTransformerService.transform(renamed, dbConfig).title.text.headline, currentDatabaseName,
      "Renaming the database updates its opening title on refresh");
    currentDatabaseName = "   ";
    const unnamed = await TimelineTableProvider.load(dbConfig.sourceBlockId, dbConfig);
    assert.equal(TimelineTransformerService.transform(unnamed, dbConfig).title.text.headline, "时间线",
      "A missing database name retains the generic fallback");
    currentDatabaseName = "旅行 & <记录>";
    const escaped = await TimelineTableProvider.load(dbConfig.sourceBlockId, dbConfig);
    assert.equal(TimelineTransformerService.transform(escaped, dbConfig).title.text.headline, "旅行 &amp; &lt;记录&gt;",
      "Database names must remain escaped for the TimelineJS headline HTML");
  } finally {
    globalThis.fetch = oldFetch;
  }
  console.log("PASS: timeline authoritative database name API, no title override, rename refresh, fallback and escaping");
  console.log("PASS: timeline required columns, typed mapping, media caption/automatic thumbnail/background, retired mappings ignored and Markdown legacy");
} finally {
  await server.close();
}
