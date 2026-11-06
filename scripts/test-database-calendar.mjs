import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

process.env.TZ = "Asia/Shanghai";
const bundled = await build({
  entryPoints: ["src/lets-database-view/calendar/calendar-model.ts",
    "src/lets-database-view/view-config-schema.ts"],
  bundle: true, platform: "node", format: "esm", splitting: true,
  outdir: "test-calendar", write: false, target: "es2022", logLevel: "silent",
});
const decode = async name => {
  const file = bundled.outputFiles.find(file => file.path.endsWith(name));
  assert.ok(file, name + " must be bundled");
  // The isolated test uses independent entry points to avoid filesystem imports.
  const single = await build({
    entryPoints: [name.includes("calendar-model") ?
      "src/lets-database-view/calendar/calendar-model.ts" :
      "src/lets-database-view/view-config-schema.ts"],
    bundle: true, platform: "node", format: "esm", write: false,
    target: "es2022", logLevel: "silent",
  });
  return import("data:text/javascript;base64,"+
    Buffer.from(single.outputFiles[0].contents).toString("base64"));
};
const model = await decode("calendar-model.js");
const schema = await decode("view-config-schema.js");
const id = value => "20261021123456-" + value.repeat(7);
const ids = { view: id("a"), start: id("b"), title: id("c"), color: id("d"),
  allDay: id("e"), timed: id("f"), empty: id("g"), block: id("h"), value: id("i") };
const timestamp = value => Date.parse(value + "+08:00");
const mapping = {
  title: ids.title, start: ids.start, end: "", progress: "", group: "", color: ids.color,
};
const primary = (title, block) => ({
  value: { type: "block", keyID: ids.title, id: ids.value,
    block: { id: block, content: title } },
});
const date = (first, second, isNotTime) => ({
  value: { type: "date", keyID: ids.start,
    date: { isNotEmpty: true, content: timestamp(first),
      isNotTime, ...(second ? {
        hasEndDate: true, isNotEmpty2: true, content2: timestamp(second),
      } : {}) } },
});
const columns = [
  { id: ids.title, name: "名称", type: "block" },
  { id: ids.start, name: "日期", type: "date" },
  { id: ids.color, name: "颜色", type: "select" },
];
const raw = { view: { columns, rows: [
  { id: ids.allDay, cells: [
    primary("全天日程", ids.block),
    date("2026-10-20T00:00:00", "2026-10-22T00:00:00", true),
    { value: { keyID: ids.color, type: "select", select: { content: "蓝色", color: "blue" } } },
  ] },
  { id: ids.timed, cells: [
    primary("会议", ids.block),
    date("2026-10-21T10:15:00", "2026-10-21T12:30:00", false),
  ] },
  { id: ids.empty, cells: [ primary("无日期", ids.block) ] },
]}};
const data = model.makeCalendarResult(raw, { fieldMapping: mapping });
assert.equal(data.events.length, 2, "undated item omitted");
const day = data.events.find(item => item.id === ids.allDay);
const timed = data.events.find(item => item.id === ids.timed);
assert.equal(day.allDay, true);
assert.equal(day.start, "2026-10-20");
assert.equal(day.end, "2026-10-23", "inclusive SiYuan range becomes exclusive Calendar end");
assert.deepEqual([day.before.start_date,day.before.end_date],["2026-10-20","2026-10-23"]);
assert.equal(day.blockId, ids.block);
assert.equal(day.valueId, ids.value);
assert.ok(day.backgroundColor);
assert.equal(timed.allDay, false);
assert.equal(timed.start,"2026-10-21T10:15");
assert.equal(timed.end,"2026-10-21T12:30");
assert.equal(timed.before.start_date,"2026-10-21 10:15");
assert.equal(timed.before.end_date,"2026-10-21 12:30");
assert.match(data.warning,/1 条记录/);
assert.equal(model.makeCalendarResult(raw,{fieldMapping:{...mapping,start:id("z")}}).events.length,0,
  "stale native field keys must not rebind unrelated columns");
const saved = JSON.stringify({schemaVersion:1,views:{[ids.view]:{
  mode:"calendar",configs:{calendar:{defaultView:"timeGridWeek",fieldMapping:mapping}},
}}});
const parsed = schema.readDatabaseViewDocument(saved);
assert.equal(schema.activeVisualConfigs(parsed)[ids.view].kind,"calendar");
assert.equal(schema.activeVisualConfigs(parsed)[ids.view].calendar.defaultView,"timeGridWeek");
for (const name of ["index.html","main.js","main.css","FULLCALENDAR-LICENSE.md"]) {
  assert.ok(readFileSync("dist/preview/calendar/"+name).byteLength > 200,
    "local FullCalendar bundle must contain " + name);
}
const renderer = readFileSync("src/lets-database-view/visual/visual-view-service.ts","utf8") +
  readFileSync("src/lets-database-view/gantt/gantt-renderer.ts","utf8") +
  readFileSync("src/lets-database-view/calendar/calendar-interaction.ts","utf8");
assert.match(renderer,/dodoCalendarSaveResult/);
assert.match(renderer,/saveGanttChange/);
assert.match(renderer,/calendarRevision/);
assert.match(renderer,/dodoCalendarOpenItem/);
assert.match(renderer,/new Menu\("dodo-calendar-view-picker"\)/,
  "calendar toolbar must open a native SiYuan Menu in the host");
const iframeSource = readFileSync("src/lets-database-view/calendar/iframe/main.ts", "utf8");
assert.match(iframeSource,/dodoCalendarOpenViewMenu/);
assert.match(iframeSource,/dodoCalendarChangeView/);
assert.doesNotMatch(iframeSource,/dodo-calendar-view-picker/,
  "iframe toolbar should not create a duplicate HTML select");
console.log("PASS: FullCalendar native mapping, timezone, range ends, open IDs, saved view config and bundled assets");
