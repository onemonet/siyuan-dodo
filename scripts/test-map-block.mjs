import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, transformWithEsbuild } from "vite";

const dataPath = resolve("src/lets-database-view/map/map-data.ts");
const bindingPath = resolve("src/shared/av/field-binding.ts");
const bindingCompiled = await transformWithEsbuild(await readFile(bindingPath, "utf8"), bindingPath, { loader: "ts", format: "esm" });
const bindingUri = "data:text/javascript;base64," + Buffer.from(bindingCompiled.code).toString("base64");
const transformed = await transformWithEsbuild(await readFile(dataPath, "utf8"), dataPath, { loader: "ts", format: "esm" });
const dataModuleCode = transformed.code.replace('from "../../shared/av/field-binding"', `from "${bindingUri}"`);
const data = await import("data:text/javascript;base64," + Buffer.from(dataModuleCode).toString("base64"));

// 海外/无高德名称仍可合法创建坐标标记；名称只是可选增强。
assert.equal(data.coordinatePointName(127.34456789, 37.12345678), "坐标 127.344568,37.123457");
assert.equal(data.coordinatePointName(-73.985748, 40.748438), "坐标 -73.985748,40.748438");
for (const [longitude, latitude] of [[181, 0], [0, -91], [NaN, 30], [Infinity, 35]]) {
  assert.throws(() => data.coordinatePointName(longitude, latitude), /无效经纬度/);
}
const noKey = await data.chooseMapPointName(127.3, 37.2);
assert.deepEqual(noKey, { name: "坐标 127.300000,37.200000", fallback: "no-key" });
const known = await data.chooseMapPointName(121.47, 31.23, async () => " 上海外滩 ");
assert.deepEqual(known, { name: "上海外滩", fallback: null });
const emptyName = await data.chooseMapPointName(127.3, 37.2, async () => "  ");
assert.deepEqual(emptyName, { name: noKey.name, fallback: "no-result" });
const overseasRestricted = await data.chooseMapPointName(127.3, 37.2, async () => {
  throw new Error("INSUFFICIENT_ABROAD_PRIVILEGES 20011");
});
assert.deepEqual(overseasRestricted, { name: noKey.name, fallback: "overseas" });
const networkFailed = await data.chooseMapPointName(127.3, 37.2, async () => {
  throw new Error("JSONP timeout");
});
assert.deepEqual(networkFailed, { name: noKey.name, fallback: "lookup-failed" });
console.log("PASS: map coordinates fall back after missing Key, no POI, overseas 20011 and network errors");

for (const [input, expected] of [
  ["121.4737,31.2304", [121.4737, 31.2304]],
  [" 121.4737，31.2304 ", [121.4737, 31.2304]],
  ["[-73.9857,40.7484]", [-73.9857, 40.7484]],
  ["（0；0）", [0, 0]],
  ["-180 -90", [-180, -90]],
  ["180,90", [180, 90]],
  ["`+0.5,-.5`", [0.5, -0.5]],
]) assert.deepEqual(data.parseCoordinate(input), expected, input);
for (const input of ["", ",", "121,", "121,91", "181,31", "31,121", "1,2,3", "NaN,0", "Infinity,1", "0x10,20", "[121,31)", "位置 121,31"]) {
  assert.equal(data.parseCoordinate(input), null, input);
}
const defaultConfig = { fieldMapping: { coordinate: "", image: "" } };
assert.deepEqual(data.parseMapConfig('{"height":720}'), { fieldMapping: { coordinate: "", image: "" }, height: 720 });
assert.deepEqual(data.parseMapConfig('{"height":2200}'), { fieldMapping: { coordinate: "", image: "" }, height: 1200 });
assert.deepEqual(data.parseMapConfig('{"height":"960"}'), defaultConfig, "Non-numeric height must be ignored");
assert.deepEqual(data.parseMapConfig("{broken"), defaultConfig);
assert.deepEqual(data.parseMapConfig('{"fieldMapping":{"coordinate":"坐标","title":"旧标题","image":"资源"}}'),
  { fieldMapping: { coordinate: "坐标", image: "资源" } }, "旧标题映射必须丢弃");
assert.deepEqual(data.parseMapConfig('{"coordinateColumn":3}'), defaultConfig);
assert.deepEqual(
  data.parseMapConfig('{"coordinateColumn":"坐标"}'),
  { fieldMapping: { coordinate: "坐标", image: "" } },
);
assert.deepEqual(
  data.parseMapConfig('{"coordinateColumn":"坐标","displayColumn":"地点"}'),
  { fieldMapping: { coordinate: "坐标", image: "" } },
);
assert.deepEqual(
  data.parseMapConfig('{"coordinateColumn":"坐标","displayColumn":"地点","imageColumn":"封面"}'),
  { fieldMapping: { coordinate: "坐标", image: "封面" } },
);
assert.deepEqual(
  data.parseMapConfig('{"fieldMapping":{"coordinate":"经纬度","title":"名称","image":"照片"}}'),
  { fieldMapping: { coordinate: "经纬度", image: "照片" } },
);
assert.deepEqual(
  data.normalizeMapGlobalSettings({ mapSource: "amap", amapKey: " test-key ", useAmapApi2: true, searchEnabled: false }),
  { mapSource: "amap", amapKey: "test-key", googleKey: "", googleMapId: "", useAmapApi2: true, searchEnabled: false, markerBackgroundColor: "#ffffff", markerTextColor: "#202124" },
);
assert.deepEqual(data.normalizeMapGlobalSettings(), data.DEFAULT_MAP_GLOBAL_SETTINGS);
assert.deepEqual(data.normalizeMapGlobalSettings({ markerBackgroundColor: " #ABCDEF ", markerTextColor: "#f0123a" }), {
  ...data.DEFAULT_MAP_GLOBAL_SETTINGS, markerBackgroundColor: "#abcdef", markerTextColor: "#f0123a",
});
assert.deepEqual(data.normalizeMapGlobalSettings({ markerBackgroundColor: "red", markerTextColor: "url(javascript:evil)" }), data.DEFAULT_MAP_GLOBAL_SETTINGS);

assert.deepEqual(data.normalizeMapGlobalSettings({ mapSource: "google", googleKey: "  dev-key ", googleMapId: " DEMO_MAP_ID " }), {
  mapSource: "google", amapKey: "", googleKey: "dev-key", googleMapId: "DEMO_MAP_ID", useAmapApi2: false, searchEnabled: true, markerBackgroundColor: "#ffffff", markerTextColor: "#202124",
});

const adapterPath = resolve("src/shared/av/av-data-adapter.ts");
const transformedAdapter = await transformWithEsbuild(await readFile(adapterPath, "utf8"), adapterPath, { loader: "ts", format: "esm" });
const adapter = await import("data:text/javascript;base64," + Buffer.from(transformedAdapter.code).toString("base64"));
const avFixture = { view: {
  columns: [{ id: "name", name: "地点", type: "block" }, { id: "coord", name: "位置", type: "location" }, { id: "plain", name: "普通文本", type: "text" }],
  rows: [
    { cells: [{ value: { keyID: "name", blockID: "20260917120000-xxxxxxx", id: "20260917120000-1111111", block: { id: "20260917120000-zzzzzzz", content: "上海" } } }, { value: { keyID: "coord", location: { name: "外滩", longitude: 121.4737, latitude: 31.2304, originalInput: "任意原始输入" } } }] },
    { id: "20260917120000-yyyyyyy", cells: [{ value: { keyID: "name", id: "20260917120000-2222222", isDetached: true, block: { content: "零点" } } }, { value: { keyID: "coord", location: { longitude: 0, latitude: 0 } } }] },
    { cells: [{ value: { keyID: "coord", location: { name: "仅地址" } } }] },
    { cells: [{ value: { keyID: "coord", location: { longitude: 121, latitude: 91 } } }] },
  ],
} };
const adapted = adapter.adaptAttributeViewRender(avFixture);
assert.deepEqual(adapted.fieldTypes, ["block", "location", "text"]);
assert.deepEqual(adapted.rowBlockIds, ["20260917120000-xxxxxxx", "20260917120000-yyyyyyy", "", ""]);
assert.deepEqual(adapted.rowBoundBlockIds, ["20260917120000-zzzzzzz", "", "", ""]);
assert.deepEqual(adapted.rowValueIds, ["20260917120000-1111111", "20260917120000-2222222", "", ""]);
assert.deepEqual(adapted.rows.map((row) => row[1]), ["121.4737,31.2304", "0,0", "", ""]);
assert.deepEqual(data.getMapLocationColumns(adapted), ["位置"]);
const adaptedPoints = data.buildMapPreviewData(adapted, { coordinate: "位置", image: "" }).points;
assert.equal(adaptedPoints.length, 2);
assert.equal(adaptedPoints[0].itemId, "20260917120000-xxxxxxx");
assert.equal(adaptedPoints[0].blockId, "20260917120000-zzzzzzz");
assert.equal(adaptedPoints[0].valueId, "20260917120000-1111111");
assert.equal(adaptedPoints[1].itemId, "20260917120000-yyyyyyy");
assert.equal(adaptedPoints[1].blockId, "");
assert.equal(adaptedPoints[1].valueId, "20260917120000-2222222");
const wrongTypePreview = data.buildMapPreviewData(adapted, { coordinate: "普通文本", image: "" });
assert.deepEqual(wrongTypePreview.points, []);
assert.match(wrongTypePreview.message, /不是位置类型/);
assert.deepEqual(data.getMapLocationColumns({ headers: ["文本"], fieldTypes: ["text"] }), []);
assert.match(data.buildMapPreviewData({ headers: ["文本"], fieldTypes: ["text"], rows: [] }, { coordinate: "", image: "" }).message, /新增位置列/);
const table = {
  headers: ["地点", "坐标"],
  fieldTypes: ["block", "location"],
  rowBlockIds: ["20260917120000-aaaaaaa", "", "", "20260917120000-bbbbbbb"],
  rowBoundBlockIds: ["20260917120000-ddddddd", "", "", ""],
  rowValueIds: ["20260917120000-eeeeeee", "", "", "20260917120000-fffffff"],
  avID: "20260917120000-ggggggg",
  databaseBlockID: "20260917120000-hhhhhhh",
  rows: [["上海", "121.4737,31.2304"], ["无效", "121,95"], ["空值", ""], ["原点", "0,0"]],
};
const preview = data.buildMapPreviewData(table, { coordinate: "坐标", image: "" });
assert.equal(preview.points.length, 2);
assert.equal(preview.points[0].title, "上海");
assert.equal(preview.points[0].itemId, "20260917120000-aaaaaaa");
assert.equal(preview.points[0].blockId, "20260917120000-ddddddd");
assert.equal(preview.points[0].valueId, "20260917120000-eeeeeee");
assert.equal(preview.points[0].avID, "20260917120000-ggggggg");
assert.equal(preview.points[0].databaseBlockID, "20260917120000-hhhhhhh");
assert.equal(preview.points[1].itemId, "20260917120000-bbbbbbb");
assert.equal(preview.points[1].blockId, "");
assert.equal(preview.points[1].valueId, "20260917120000-fffffff");
assert.equal(data.truncateMapHoverTitle("上海外滩"), "上海外滩");
assert.equal(data.truncateMapHoverTitle("12345678901234567890"), "12345678901234567890");
assert.equal(data.truncateMapHoverTitle("123456789012345678901"), "1234567890123456789…");
assert.equal(Array.from(data.truncateMapHoverTitle("你好".repeat(13))).length, 20);
assert.equal(preview.points[0].displayText, "上海");
assert.equal(preview.points[0].longitude, 121.4737);
assert.equal(preview.points[0].latitude, 31.2304);
assert.equal(data.truncateMapDisplayText("1234567890"), "1234567890");
assert.equal(data.truncateMapDisplayText("12345678901"), "1234567890...");
assert.equal(data.truncateMapDisplayText("  上海   外滩  "), "上海 外滩");
assert.match(preview.message, /跳过 2 行/);

const imageTable = {
  headers: ["地点", "坐标", "其它图片", "封面"],
  fieldTypes: ["block", "location", "mAsset", "mAsset"],
  rows: [["上海", "121.4737,31.2304", "![其它](assets/other.png)", "![封面](assets/cover.png)"]],
};
const imagePreview = data.buildMapPreviewData(imageTable, { coordinate: "坐标", image: "封面" });
assert.equal(imagePreview.points[0].image, "/assets/cover.png");
assert.equal(imagePreview.points[0].displayText, undefined);
assert.deepEqual(data.getMapAssetColumns(imageTable), ["其它图片", "封面"]);
assert.deepEqual(data.getMapAssetColumns(adapted), []);
const wrongImageTable = {
  headers: ["普通文本", "位置", "主键", "链接"],
  fieldTypes: ["text", "location", "block", "text"],
  rows: [["不应作为标题", "121.4737,31.2304", "主键标题", "![照片](assets/other.png)"]],
};
const wrongImagePreview = data.buildMapPreviewData(wrongImageTable, { coordinate: "位置", image: "链接" });
assert.equal(wrongImagePreview.points[0].title, "主键标题", "标题必须从 block 主键列提取，不能取首列普通文本");
assert.equal(wrongImagePreview.points[0].image, undefined, "普通文本列即便有图片 Markdown 也不可作为图片映射");
assert.equal(wrongImagePreview.points[0].displayText, "主键标题");
const missingPrimary = data.buildMapPreviewData({ headers: ["其他", "位置"], fieldTypes: ["text", "location"], rows: [["普通文本", "121,31"]] }, { coordinate: "位置", image: "" });
assert.equal(missingPrimary.points[0].title, "第 1 行", "无主键不能用普通文本替代主键");
const documentResource = data.buildMapPreviewData({ headers: ["主键", "位置", "资源"], fieldTypes: ["block", "location", "mAsset"], rows: [["文档", "121,31", "![文件](assets/report.pdf)"]] }, { coordinate: "位置", image: "资源" });
assert.equal(documentResource.points[0].image, undefined, "非图片资源不应显示为破损图片");
const noImageMappingPreview = data.buildMapPreviewData(imageTable, { coordinate: "坐标", image: "" });
assert.equal(noImageMappingPreview.points[0].image, undefined);
assert.equal(noImageMappingPreview.points[0].displayText, "上海");
const emptyImagePreview = data.buildMapPreviewData(
  { headers: ["地点", "坐标", "封面"], fieldTypes: ["block", "location", "mAsset"], rows: [["上海", "121.4737,31.2304", ""]] },
  { coordinate: "坐标", image: "封面" },
);
assert.equal(emptyImagePreview.points[0].image, undefined);
assert.equal(emptyImagePreview.points[0].displayText, "上海");
assert.deepEqual(data.buildMapPreviewData(table, { coordinate: "删除的字段", image: "" }).points, []);
assert.match(
  data.buildMapPreviewData({ headers: ["坐标"], fieldTypes: ["location"], rows: [] }, { coordinate: "坐标", image: "" }).message,
  /暂无数据/,
);
assert.match(data.buildMapPreviewData(table, { coordinate: "", image: "" }).message, /映射位置类型的坐标字段/);

const [uiCode, uiCss, hostCode] = await Promise.all([
  readFile(resolve("src/lets-database-view/map/iframe/main.ts"), "utf8"),
  readFile(resolve("src/lets-database-view/map/iframe/app.css"), "utf8"),
  readFile(resolve("src/lets-custom-block/index.ts"), "utf8"),
]);
const creationService = await readFile(resolve("src/lets-database-view/map/map-block-service.ts"), "utf8");
const navigationService = await readFile(resolve("src/lets-database-view/map/open-map-item.ts"), "utf8");
assert.match(uiCode, /iconAnchor: \[Math\.round\(dimensions\.width \/ 2\), dimensions\.height\]/, "Leaflet 锚点须对准三角尖端");
assert.match(uiCode, /-dimensions\.height/, "高德标记偏移须对准三角尖端");
assert.match(uiCode, /displayCoordinate\(cluster\.representative\)/, "聚合坐标必须使用实际点而非平均坐标");
assert.match(uiCode, /handleMarkerClick/, "单点点击须跳转并复用聚合点列表");
assert.match(uiCode, /viewportStorageKey\(\)/, "每张地图需保存独立视角");
assert.match(uiCode, /dodo-map-viewport-v1:\$\{blockId\}/, "中心与缩放存储按地图块 ID 隔离");
assert.match(uiCode, /sessionStorage\.setItem\(key/, "拖动缩放后应持久化当前视角");
assert.match(uiCode, /sessionStorage\.getItem\(key/, "iframe 重载时应恢复视角");
assert.match(uiCode, /gcj02ToWgs84\(longitude, latitude\)/, "高德视角需要转换成统一的 WGS84 坐标后保存");
assert.match(uiCode, /firstRenderForEngine && !restored\) fitAll\(\)/, "只允许首次没有保存的视角时自动适配标记范围");
assert.doesNotMatch(uiCode, /drawMarkers\(true\)/, "地图数据刷新不允许再次自动缩放到所有标记范围");
assert.match(uiCode, /leafletMap\.on\("moveend", saveMapViewport\)/, "Leaflet 拖动后保存视角");
assert.match(uiCode, /amapMap\.on\?\.\("moveend", saveMapViewport\)/, "高德拖动后保存视角");
assert.match(uiCode, /if \(addMode \|\| correctionPoint \|\| cluster\.points\.length > 1\) return;/, "聚合点及矫正模式 hover 必须不显示任何悬浮详情");
assert.match(uiCode, /showPointPreview\(cluster, element, true\)/, "聚合点 click 保留列表");
assert.match(uiCode, /function attachPointContextMenu\(element: HTMLElement \| null, cluster: PointCluster\)/, "右键菜单应只挂在单点标记");
assert.match(uiCode, /cluster\.points\.length !== 1\) return;/, "聚合标记禁止直接删除或矫正");
assert.match(uiCode, /addEventListener\("contextmenu"/, "右键事件应阻止浏览器默认菜单");
assert.match(uiCode, /data-action="correct"/, "右键菜单必须具有矫正位置操作");
assert.match(uiCode, /data-action="delete"/, "右键菜单必须具有删除操作");
assert.match(uiCode, /window\.confirm\(/, "删除条目必须二次确认");
assert.match(uiCode, /function activatePointCorrection\(/, "矫正应进入重新选点模式");
assert.match(uiCode, /event\.key !== "Escape"/, "Esc 应能取消矫正");
assert.match(uiCode, /type: "dodoMapMutatePoint", action: "correct"/, "选定新位置后应提交矫正请求");
assert.match(uiCode, /type: "dodoMapMutatePoint", action: "delete"/, "确认删除后应向宿主请求移除数据库条目");
assert.match(uiCode, /dodoMapMutatePointResult/, "写入成功应关闭矫正状态并刷新地图");
assert.match(hostCode, /MapBlockService\.correctPoint\(/, "宿主应调用原生位置列的矫正 API");
assert.match(hostCode, /MapBlockService\.deletePoint\(/, "宿主应调用原生数据库条目删除 API");
assert.match(creationService, /verifyMapItemTarget\(/, "矫正删除需验证当前地图来源与实际条目 ID");
assert.match(creationService, /table\.rowBlockIds\?\.indexOf\(point\.itemId\)/, "严格使用 itemID 核验来源中的数据库行");
assert.match(creationService, /\/api\/av\/setAttributeViewBlockAttr/, "矫正只写入原生位置列");
assert.match(creationService, /\/api\/av\/removeAttributeViewBlocks/, "删除必须通过思源原生移除数据库行接口");
assert.match(creationService, /srcIDs: \[point\.itemId\]/, "删除使用条目 ID，不误传绑定的文档 ID");
assert.match(uiCss, /\.map-point-context-menu\s*\{/, "新增独立右键菜单样式");
assert.match(uiCss, /body\.map-correct-mode #map/, "矫正时地图光标必须是十字准星");
assert.match(uiCode, /count === 1 \? ` title=/, "多点文字聚合不显示原生 hover title");
assert.match(uiCode, /mapAddHint\.textContent = "标记模式"/, "标记模式左下角提示只保留简短文案");
assert.match(uiCss, /body\.map-add-mode #map \*/, "标记模式需要覆盖地图图层默认鼠标样式");
assert.match(uiCss, /cursor: crosshair !important/, "标记模式鼠标必须为十字准星");
assert.match(uiCode, /data-map-item-index/, "聚合列表的每项都应关联自己的条目对象");
assert.match(uiCss, /border-top: 10px solid/, "文字和图片标记须有倒三角");
assert.match(uiCss, /max-height: 288px/, "聚合列表最多容纳 8 行，每行 36px");
assert.match(hostCode, /dodoMapOpenItem/);
assert.match(navigationService, /siyuan-database-row/, "无绑定文档的条目使用思源原生详情页签");
assert.match(navigationService, /getBlockInfo/, "原生数据库详情需要来源数据库块所在笔记本 ID");
assert.match(navigationService, /openNewTab: true/, "主键页面必须在新标签页打开");
// 反向选点：模式可切换、拖动缩放不会触发创建、逆地理编码和原生数据库更新。

const iframeHtml = await readFile(resolve("src/lets-database-view/map/iframe/index.html"), "utf8");
assert.match(hostCode, /injectMapAddButton\(block\)/, "添加地点按钮应注入地图顶栏");
assert.match(hostCode, /querySelectorAll<HTMLElement>\('\[custom-dodo-block="map"\]'\)\.forEach\(\(block\) =>/, "添加地点按钮必须查询正确的地图块属性选择器");
assert.doesNotMatch(hostCode, /querySelectorAll<HTMLElement>\('custom-dodo-block="map"'\)/, "不允许漏写属性选择器方括号");
assert.match(hostCode, /settings\.before\(button\)/, "添加地点必须位于设置按钮左侧");
assert.match(hostCode, /dodoMapSetAddMode/, "再次点击添加地点应取消标记模式");
assert.match(hostCode, /dodoMapCreatePoint/, "地图单击事件必须交由宿主的受验证消息桥处理");
assert.match(uiCode, /leafletMap\.on\("click"/, "Leaflet 地图单击触发地点选取");
assert.match(uiCode, /amapMap\.on\?\.\("click"/, "高德地图单击触发地点选取");
assert.match(uiCode, /addModeSequence/, "取消模式后不得等待逆地理编码再意外创建");
assert.match(uiCode, /gcj02ToWgs84/, "写入思源坐标前应转换 GCJ02 至 WGS84");
assert.match(uiCode, /AMAP_REVERSE_GEOCODE_URL/, "标记地点须使用高德逆地理编码");
assert.match(uiCode, /async function initGoogleMap/, "Google Maps 必须有独立地图引擎");
assert.match(uiCode, /AdvancedMarkerElement/, "Google Maps 应使用高级图文标记");
assert.match(uiCode, /searchGooglePlaces/, "Google Maps 使用 Places New 搜索");
assert.match(uiCode, /selectGooglePlace/, "Google Places 点击详情应定位到地图");
assert.ok(uiCode.includes("new maps.Geocoder()"), "Google Maps 应有独立逆地理编码");
assert.ok(uiCode.includes("initLeaflet(\"osm\")"), "Google 无 Key 或 SDK 出错应回退 OSM");
assert.match(uiCode, /activeEngine === "google"/, "Google 下选点应直接使用 WGS84");
assert.match(uiCode, /chooseMapPointName\(/, "新增标记必须对高德名称查询执行可选降级");
assert.match(uiCode, /activeConfig\.mapSource === "amap" && activeConfig\.amapKey/, "只有高德引擎使用高德反查地址");
assert.doesNotMatch(uiCode, /高德未返回该坐标的地点名称，请选择其他位置/, "无地点名称不能拒绝有效坐标");
assert.doesNotMatch(uiCode, /请先在地图全局设置中填写高德 Key（用于识别地点名称）/, "无 Key 也必须允许坐标标记");
assert.match(uiCode, /pendingPointNameFallback/, "高德境外权限错误需要提供非阻断式状态反馈");

assert.match(uiCode, /dodoMapAddModeState/, "iframe 的标记模式状态须回传到顶栏按钮");
assert.match(iframeHtml, /id="map-add-hint"/, "标记模式有状态提示，地图可继续平移和缩放");
assert.match(creationService, /\/api\/av\/addAttributeViewBlocks/, "使用原生数据库条目新增接口");
assert.match(creationService, /isDetached: true/, "新地点应为独立条目，不强制创建文档");
assert.match(creationService, /\/api\/av\/setAttributeViewBlockAttr/, "使用位置字段原生 API 写入经纬度与名称");
assert.match(creationService, /location: \{ name, latitude, longitude/, "写入原生位置字段包含名称和 WGS84 经纬度");
assert.match(creationService, /\/api\/av\/getAttributeViewKeys/, "创建成功后获取主键 valueID 才能打开详情");
const bundle = await build({
  configFile: false, publicDir: false, logLevel: "silent",
  build: { write: false, minify: false, lib: { entry: resolve("src/lets-database-view/map/map-source.ts"), formats: ["es"] } },
});
const sourceCode = (Array.isArray(bundle) ? bundle[0] : bundle).output.find((item) => item.type === "chunk").code;
const source = await import("data:text/javascript;base64," + Buffer.from(sourceCode).toString("base64"));
const sourceId = "20260917120000-aaaaaaa";
const mapId = "20260917120000-bbbbbbb";
assert.throws(() => source.validateMapSource("bad"));
assert.throws(() => source.validateMapSource(mapId, mapId));

let mode = "table";
let attrs = { [data.MAP_SOURCE_ATTR]: sourceId, [data.MAP_CONFIG_ATTR]: '{"coordinateColumn":"坐标"}' };
const previousFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const payload = JSON.parse(options.body);
  let response;
  if (url === "/api/attr/getBlockAttrs") response = attrs;
  else if (url === "/api/block/getBlockDOM") {
    if (mode === "deleted") return new Response(JSON.stringify({ code: -1, msg: "来源块已删除" }), { status: 200 });
    response = { dom: mode === "table" ? '<div data-type="NodeTable"></div>' : '<div data-type="NodeAttributeView" data-av-id="av-example"></div>' };
  } else if (url === "/api/block/getBlockKramdown") {
    response = { kramdown: "| 地点 | 坐标 |\n| --- | --- |\n| 上海 | 121.4737,31.2304 |" };
  } else if (url === "/api/av/renderAttributeView") {
    assert.equal(payload.id, "av-example");
    assert.equal(payload.blockID, sourceId);
    response = { view: {
      columns: [{ id: "name", name: "地点", type: "block" }, { id: "coord", name: "坐标", type: "location" }],
      rows: mode === "empty-database" ? [] : [{ cells: [
        { value: { keyID: "name", type: "block", blockID: "20260917120000-ccccccc", id: "20260917120000-iiiiiii", block: { id: "20260917120000-jjjjjjj", content: "上海" } } },
        { value: { keyID: "coord", type: "location", location: { name: "上海", longitude: 121.4737, latitude: 31.2304 } } },
      ] }],
    } };
  } else throw new Error("Unexpected request: " + url);
  return new Response(JSON.stringify({ code: 0, data: response }), { status: 200 });
};
try {
  await assert.rejects(() => source.loadMapSource(sourceId), /数据库块/);
  mode = "database";
  const fromDatabase = await source.loadMapSource(sourceId);
  assert.deepEqual(fromDatabase, { headers: ["地点", "坐标"], columnIds: ["name", "coord"], columnNames: ["地点", "坐标"], fieldTypes: ["block", "location"], rowBlockIds: ["20260917120000-ccccccc"], rowBoundBlockIds: ["20260917120000-jjjjjjj"], rowValueIds: ["20260917120000-iiiiiii"], avID: "av-example", databaseBlockID: sourceId, rows: [["上海", "121.4737,31.2304"]] });
  mode = "empty-database";
  assert.deepEqual(await source.loadMapSource(sourceId), { headers: ["地点", "坐标"], columnIds: ["name", "coord"], columnNames: ["地点", "坐标"], fieldTypes: ["block", "location"], rowBlockIds: [], rowBoundBlockIds: [], rowValueIds: [], avID: "av-example", databaseBlockID: sourceId, rows: [] });
  mode = "deleted";
  const broken = await source.getMapContext(mapId);
  assert.equal(broken.sourceId, sourceId);
  assert.equal(broken.config.fieldMapping.coordinate, "坐标");
  assert.equal(broken.table, null);
  assert.match(broken.message, /来源块已删除/);
  attrs = {};
  const unbound = await source.getMapContext(mapId);
  assert.equal(unbound.sourceId, "");
  assert.equal(unbound.table, null);
} finally {
  globalThis.fetch = previousFetch;
}
console.log("地图块验证通过：位置与资源字段限制、真实文档 ID、独立条目 ID / 主键值 ID、原生详情页签和数据库来源状态。");
