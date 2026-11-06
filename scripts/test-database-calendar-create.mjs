import assert from "node:assert/strict";
import { build } from "esbuild";

process.env.TZ = "Asia/Shanghai";
const code = await build({
  entryPoints: ["src/lets-database-view/calendar/calendar-create.ts"],
  bundle: true, platform: "node", format: "esm",
  target: "es2022", write: false, logLevel: "silent",
});
const mod = await import("data:text/javascript;base64," +
  Buffer.from(code.outputFiles[0].contents).toString("base64"));
const make = mod.makeCalendarCreatePayload;
const create = mod.createCalendarItem;
const id = char => "20261021123456-" + char.repeat(7);
const ids = { av: id("a"), block: id("b"), view: id("c"), primary: id("d"),
  text: id("e"), start: id("f"), end: id("g") };
const raw = { view: { columns: [
  { id: ids.primary, name: "名称", type: "block" },
  { id: ids.text, name: "标题", type: "text" },
  { id: ids.start, name: "日期", type: "date" },
  { id: ids.end, name: "截止", type: "date" },
] } };
const singleMap = { title: ids.primary, start: ids.start, end: "" };
const separateMap = { title: ids.text, start: ids.start, end: ids.end };
const local = stamp => new Date(stamp).getTime();
const day = make(raw, singleMap, { title: "  全天任务 ", start: "2026-10-21",
  end: "2026-10-24", allDay: true }).blocksValues[0];
assert.equal(day.length, 2);
assert.deepEqual(day[0], { keyID: ids.primary, block: { content: "全天任务" } });
assert.equal(day[1].keyID, ids.start);
assert.equal(day[1].date.content, local("2026-10-21T00:00:00"));
assert.equal(day[1].date.content2, local("2026-10-23T00:00:00"));
assert.equal(day[1].date.hasEndDate, true);

const oneDay = make(raw, singleMap, { title: "单天", start: "2026-10-21",
  end: "2026-10-22", allDay: true }).blocksValues[0][1];
assert.equal(oneDay.date.isNotTime, true);
assert.equal(oneDay.date.hasEndDate, false);

const timed = make(raw, separateMap, { title: "晨会",
  start: "2026-10-21 09:15", end: "2026-10-21 10:45", allDay: false }).blocksValues[0];
assert.equal(timed.length, 4);
assert.equal(timed[0].block.content, "晨会");
assert.equal(timed[1].text.content, "晨会");
assert.equal(timed[2].date.content, local("2026-10-21T09:15:00"));
assert.equal(timed[2].date.isNotTime, false);
assert.equal(timed[3].date.content, local("2026-10-21T10:45:00"));
assert.equal(timed[3].date.isNotTime, false);
assert.equal(timed[2].date.hasEndDate, undefined);

const invalid = [
  { title: "", start: "2026-10-21", end: "2026-10-22", allDay: true },
  { title: "BAD", start: "2026-10-21", end: "2026-10-21", allDay: true },
  { title: "BAD", start: "2026-10-31 19:00", end: "2026-10-31 18:00", allDay: false },
  { title: "BAD", start: "2026-10-21", end: "2026-10-22", allDay: false },
  { title: "BAD", start: "2026-10-21 11:00", end: "2026-10-21 13:00", allDay: true },
  { title: "BAD", start: "2026-02-30", end: "2026-03-02", allDay: true },
];
for (const item of invalid) assert.throws(() => make(raw, singleMap, item));
assert.throws(() => make(raw, { title: ids.primary, start: id("z") },
  { title: "BAD", start: "2026-10-21", end: "2026-10-22", allDay: true }));

let calls = [];
await create({ avID: ids.av, blockId: ids.block, viewID: ids.view },
  singleMap, { title: "写回原生数据库", start: "2026-10-21",
    end: "2026-10-22", allDay: true },
  async args => { calls.push(["read", args]); return raw; },
  async (path, payload) => calls.push(["write", path, payload]));
assert.equal(calls.length, 2);
assert.equal(calls[0][1].viewID, ids.view);
assert.equal(calls[1][1], "/api/av/appendAttributeViewDetachedBlocksWithValues");
assert.equal(calls[1][2].avID, ids.av);
assert.equal(calls[1][2].blocksValues.length, 1);
assert.deepEqual(calls[1][2].blocksValues[0][0], {
  keyID: ids.primary, block: { content: "写回原生数据库" },
});
console.log("PASS: calendar create native AV one-transaction payload, all-day exclusive end, minute precision, binding and invalid writes");
