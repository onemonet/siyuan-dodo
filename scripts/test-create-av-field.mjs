import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const id = n => "20261019083000-" + String(n).padStart(7, "a");
let counter = 0;
const calls = [];
const realColumns = [
  { id: id(20), name: "主键" },
  { id: id(21), name: "日期" },
  { id: id(22), name: "末尾字段" },
  { id: id(23) + ":end", name: "日期范围虚拟列" },
];
const renderOk = () => ({ ok: true, json: async () =>
  ({ code: 0, data: { view: { columns: realColumns } } }) });
globalThis.window = { Lute: { NewNodeID: () => id(++counter) } };
globalThis.fetch = async (url, options) => {
  calls.push({ url, ...JSON.parse(options.body) });
  return url === "/api/av/renderAttributeView" ? renderOk()
    : { ok: true, json: async () => ({ code: 0, data: null }) };
};
try {
  const { createAvField, newFieldType, newFieldName } =
    await server.ssrLoadModule("/src/components/ui/av-create-field.ts");
  const { TIMELINE_FIELD_DEFINITIONS } =
    await server.ssrLoadModule("/src/lets-custom-block/timeline/services/field-mapping.ts");
  const { MAP_FIELD_DEFINITIONS } =
    await server.ssrLoadModule("/src/lets-database-view/map/map-field-schema.ts");
  const definitions = [...TIMELINE_FIELD_DEFINITIONS, ...MAP_FIELD_DEFINITIONS];
  for (const [key, type] of [["title", "text"], ["startDate", "date"], ["description", "text"],
    ["group", "select"], ["media", "mAsset"], ["backgroundColor", "text"],
    ["coordinate", "location"], ["image", "mAsset"]]) {
    const field = definitions.find(item => item.key === key);
    assert.ok(field, "Missing schema: " + key);
    assert.equal(newFieldType(field.acceptedTypes), type);
  }
  assert.equal(newFieldType(["block"]), null, "Primary field cannot be created");
  assert.equal(newFieldName("坐标", ["坐标","坐标 2"]), "坐标 3");
  assert.equal(newFieldName("说明", ["地图"]), "说明");
  const field = MAP_FIELD_DEFINITIONS.find(item => item.key === "coordinate");
  const result = await createAvField({ avID: id(50), blockID: id(51), field,
    existingNames: ["坐标","坐标 2"] });
  assert.deepEqual(result, { id: id(1), name: "坐标 3", type: "location" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { url: "/api/av/renderAttributeView",
    id: id(50), blockID: id(51), page: 1, pageSize: 1 });
  assert.deepEqual(calls[1], { url: "/api/av/addAttributeViewKey", avID: id(50),
    blockID: id(51), keyID: id(1), keyName: "坐标 3", keyType: "location",
    keyIcon: "", previousKeyID: id(22) });
  assert.deepEqual(await createAvField({ avID: id(50), blockID: id(51),
    viewID: id(52), field: TIMELINE_FIELD_DEFINITIONS.find(item => item.key === "startDate"),
    existingNames: [] }), { id: id(2), name: "开始时间", type: "date" });
  assert.equal(calls[2].viewID, id(52), "Read the selected database view");
  assert.equal(calls[3].previousKeyID, id(22), "Insert after the last REAL key, never the virtual :end key");
  globalThis.fetch = async (url) => url === "/api/av/renderAttributeView" ? renderOk()
    : { ok: true, json: async () => ({ code: -1, msg: "duplicate key" }) };
  await assert.rejects(createAvField({ avID: id(50), blockID: id(51), field, existingNames: [] }),
    /duplicate key/);
  globalThis.fetch = async (url) => url === "/api/av/renderAttributeView" ? renderOk()
    : { ok: false, status: 403 };
  await assert.rejects(createAvField({ avID: id(50), blockID: id(51), field, existingNames: [] }), /HTTP 403/);
  // Never create with an empty previousKeyID: SiYuan would prepend the field.
  let creationsAttempted = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/av/renderAttributeView")
      return { ok: true, json: async () => ({ code: 0, data: { view: { columns: [] } } }) };
    creationsAttempted++;
    return { ok: true, json: async () => ({ code: 0 }) };
  };
  await assert.rejects(createAvField({ avID: id(50), blockID: id(51), field, existingNames: [] }),
    /无法确定数据库末尾字段/);
  assert.equal(creationsAttempted, 0, "Missing real column IDs must not create at first position");
  globalThis.fetch = async (url) => url === "/api/av/renderAttributeView" ? renderOk()
    : new Promise(resolve => { globalThis.finishRequest = resolve; });
  const first = createAvField({ avID: id(50), blockID: id(51), field, existingNames: [] });
  await assert.rejects(createAvField({ avID: id(50), blockID: id(51), field, existingNames: [] }), /正在创建中/);
  // The async function reads columns before entering the add-key request.
  for (let i = 0; i < 8 && !globalThis.finishRequest; i++) await Promise.resolve();
  assert.equal(typeof globalThis.finishRequest, "function");
  globalThis.finishRequest({ ok: true, json: async () => ({ code: 0 }) });
  await first;
  const ui = await readFile("src/components/ui/FieldSelect.svelte", "utf8");
  const mapping = await readFile("src/components/ui/FieldMapping.svelte", "utf8");
  assert.match(ui, /添加字段/);
  assert.match(ui, /dispatch\("create"\)/);
  assert.match(mapping, /canCreate=\{canCreate && restrictTypes/);
  assert.match(mapping, /on:create=\{\(\) => dispatch\("create", field.key\)\}/);
  const timeline = await readFile("src/lets-custom-block/timeline/ui/TimelineSettingsPanel.svelte", "utf8");
  assert.match(timeline, /on:create=\{event => createMappingField\(event.detail\)\}/);
  assert.match(timeline, /setMappingField\(definition.key, created.id\)/);
  const map = await readFile("src/lets-database-view/map/MapSettingsPanel.svelte", "utf8");
  assert.match(map, /MapBlockService\.setFieldMapping\(mapBlockId, field.key, created.id\)/);
  const nativeMap = await readFile("src/lets-database-view/map/map-view-service.ts", "utf8");
  assert.match(nativeMap, /mappingPanel\.\$on\("create", event =>/);
  assert.match(nativeMap, /fieldMapping: \{ \.\.\.latest\[viewId\]\.fieldMapping, \[field.key\]: created.id \}/);
  console.log("PASS: add typed fields at the end of real database columns, bound keyID, selected view, error and duplicate protection");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  delete globalThis.finishRequest;
  await server.close();
}