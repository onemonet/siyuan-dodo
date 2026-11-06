import assert from "node:assert/strict";
import ts from "typescript";
import { createRequire } from "node:module";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const coreOutput = resolve("scripts/.test-field-core.cjs");
const timelineOutput = resolve("scripts/.test-field-timeline.cjs");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
try {
  await writeFile(coreOutput, compile(await readFile(resolve("src/shared/av/field-binding.ts"), "utf8")));
  const timeline = compile(await readFile(resolve("src/lets-custom-block/timeline/services/field-mapping.ts"), "utf8"))
    .replace('require("../../../shared/av/field-binding")', 'require("./.test-field-core.cjs")');
  await writeFile(timelineOutput, timeline);
  const { resolveFieldBinding, fieldSelectOptions, migrateFieldMapping } = require(coreOutput);
  const { resolveTimelineColumns } = require(timelineOutput);
  const coordA = "20261017120000-aaaaaaa";
  const coordB = "20261017120000-bbbbbbb";
  const imageId = "20261017120000-ccccccc";
  const table = { headers: ["位置", "位置·2", "封面"], columnNames: ["位置", "位置", "封面"],
    columnIds: [coordA, coordB, imageId], fieldTypes: ["location", "location", "mAsset"] };
  assert.equal(resolveFieldBinding(table, "位置").status, "ambiguous", "legacy duplicate names must not auto-bind");
  assert.deepEqual(fieldSelectOptions(table, ["location"]), [
    { value: coordA, label: "位置" }, { value: coordB, label: "位置·2" },
  ]);
  const migration = migrateFieldMapping({ coordinate: "位置", image: "封面" }, table,
    { coordinate: ["location"], image: ["mAsset"] });
  assert.equal(migration.mapping.coordinate, "位置");
  assert.equal(migration.mapping.image, imageId);
  assert.ok(migration.unresolved.some(x => x.includes("ambiguous")));
  console.log("PASS: duplicated database fields get unique keyID options; ambiguous legacy names are not guessed");

  const renamed = { headers: ["照片", "新坐标", "另一位置"], columnNames: ["照片", "新坐标", "另一位置"],
    columnIds: [imageId, coordB, coordA], fieldTypes: ["mAsset", "location", "location"] };
  assert.equal(resolveFieldBinding(renamed, coordB, ["location"]).index, 1);
  assert.equal(resolveFieldBinding(renamed, coordA, ["location"]).index, 2);
  assert.equal(resolveFieldBinding(renamed, imageId, ["location"]).status, "invalid-type");
  assert.equal(resolveFieldBinding(renamed, coordB, ["mAsset"]).status, "invalid-type");
  const newSameName = { ...renamed, columnIds: [imageId, "20261017120000-ddddddd", coordA] };
  assert.equal(resolveFieldBinding(newSameName, coordB).status, "missing");
  assert.equal(migrateFieldMapping({ coordinate: coordB }, newSameName).changed, false);
  console.log("PASS: rename/reorder retain correct fields; delete/recreate does not silently rebind a stale ID");

  const dateId = "20261017120000-eeeeeee";
  const timelineTable = { headers: ["结束时间", "开始时间", "标题"],
    columnNames: ["结束时间", "开始时间", "标题"], columnIds: [`${dateId}:end`, dateId, coordA] };
  const columns = resolveTimelineColumns(timelineTable.headers, { startDate: dateId, endDate: `${dateId}:end`, title: coordA },
    timelineTable.headers.length, timelineTable.columnIds, timelineTable.columnNames);
  assert.equal(columns.startDate, 1);
  assert.equal(columns.endDate, 0);
  assert.equal(columns.title, 2);
  const renamedTimeline = { headers: ["标题", "自定义日期", "自定义日期·结束"],
    columnNames: ["标题", "自定义日期", "自定义日期·结束"], columnIds: [coordA, dateId, `${dateId}:end`] };
  const changedTimeline = resolveTimelineColumns(renamedTimeline.headers, { startDate: dateId, endDate: `${dateId}:end` },
    3, renamedTimeline.columnIds, renamedTimeline.columnNames);
  assert.equal(changedTimeline.startDate, 1);
  assert.equal(changedTimeline.endDate, 2);
  assert.equal(resolveTimelineColumns(renamedTimeline.headers, { startDate: "20261017120000-fffffff" }, 3,
    renamedTimeline.columnIds, renamedTimeline.columnNames).startDate, null);
  const typedIDs = [coordA, dateId, imageId, coordB];
  const typed = { headers: ["标题", "开始时间", "媒体", "分组"], columnNames: ["标题", "开始时间", "媒体", "分组"],
    columnIds: typedIDs, fieldTypes: ["block", "date", "mAsset", "select"] };
  const mappingByType = resolveTimelineColumns(typed.headers, { title: coordA, startDate: dateId, media: imageId, group: coordB },
    4, typed.columnIds, typed.columnNames, typed.fieldTypes);
  assert.equal(mappingByType.title, 0);
  assert.equal(mappingByType.startDate, 1);
  assert.equal(mappingByType.media, 2);
  assert.equal(mappingByType.group, 3);
  assert.equal(resolveTimelineColumns(typed.headers, { startDate: imageId }, 4, typed.columnIds, typed.columnNames, typed.fieldTypes).startDate, null,
    "A media column must never bind to the required date mapping");
  assert.equal(resolveTimelineColumns(typed.headers, { media: coordB }, 4, typed.columnIds, typed.columnNames, typed.fieldTypes).media, null,
    "Select categories are not valid media URLs");
  assert.equal(resolveTimelineColumns(typed.headers, { title: imageId }, 4, typed.columnIds, typed.columnNames, typed.fieldTypes).title, null,
    "An attachment cannot be a title");
  const reordered = { headers: ["数值", "日期", "主键"], columnIds: [imageId, dateId, coordA],
    columnNames: ["数值", "日期", "主键"], fieldTypes: ["number", "date", "block"] };
  const automatic = resolveTimelineColumns(reordered.headers, {}, 3, reordered.columnIds, reordered.columnNames, reordered.fieldTypes);
  assert.equal(automatic.title, null, "Runtime never auto-detects missing title keyID");
  assert.equal(automatic.startDate, null, "Runtime never auto-detects missing date keyID");
  const wrongStart = { ...reordered, fieldTypes: ["number", "text", "block"] };
  assert.equal(resolveTimelineColumns(wrongStart.headers, {}, 3, wrongStart.columnIds, wrongStart.columnNames, wrongStart.fieldTypes).startDate, null);

  const plainTable = resolveTimelineColumns(["标题", "开始日期", "说明"], { title: "标题", startDate: "开始日期" }, 3);
  assert.equal(plainTable.startDate, 1);
  console.log("PASS: timeline required date/title AV type enforcement, optional media/group filters, ID stability and Markdown compatibility");
} finally {
  await Promise.all([coreOutput, timelineOutput].map(path => rm(path, { force: true })));
}
