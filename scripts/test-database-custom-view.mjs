import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFileSync, readFileSync } from "node:fs";

await build({
  entryPoints: ["src/lets-database-view/custom/storage.ts",
    "src/lets-database-view/custom/runtime.ts",
    "src/lets-database-view/view-config-schema.ts"],
  outdir: "tmp/custom-view-test", bundle: true, format: "esm", platform: "node",
  outExtension: { ".js": ".mjs" }, logLevel: "silent",
});
const storage = await import("../tmp/custom-view-test/custom/storage.mjs");
const runtime = await import("../tmp/custom-view-test/custom/runtime.mjs");
const schema = await import("../tmp/custom-view-test/view-config-schema.mjs");

const files = new Map();
const dirs = new Set();
globalThis.fetch = async (url, request) => {
  if (url === "/api/file/putFile") {
    const path = request.body.get("path");
    if (request.body.get("isDir") === "true") dirs.add(path);
    else {
      const file = request.body.get("file");
      assert(file);
      files.set(path, await file.text());
    }
    return new Response(JSON.stringify({code:0}), {status:200});
  }
  if (url === "/api/file/getFile") {
    const {path} = JSON.parse(request.body);
    return files.has(path) ? new Response(files.get(path), {status:200}) :
      new Response(JSON.stringify({code:404,msg:"not found"}), {status:404});
  }
  if (url === "/api/file/readDir") {
    const {path} = JSON.parse(request.body);
    const names = [...files.keys()].filter(name => name.startsWith(path + "/"))
      .map(name => name.slice(path.length + 1)).filter(name => !name.includes("/"));
    return new Response(JSON.stringify({code:0,data:names.map(name => ({name}))}),{status:200});
  }
  throw new Error("Unexpected endpoint " + url);
};

const {html,manifest} = await storage.createCustomApp();
assert.match(manifest.id, /^app-/);
assert.match(html, /window.dodoDB\.createPaginator\(\)/);
assert.match(html, /IntersectionObserver/);
assert.match(html, /dodoDBRefresh/);
assert.doesNotMatch(html, /pageSize\s*:\s*100/);
assert.match(html, /style=thumb/);
assert.match(html, /loading='lazy'/);
assert.doesNotMatch(html, /getAssetPreview|base64|previewQueue/);
assert(dirs.has(storage.CUSTOM_VIEW_ROOT));
const path = storage.appPath(manifest.id,"index.html");
assert(path.startsWith("/data/storage/petal/siyuan-dodo/"));
assert.equal((await storage.getCustomApp(manifest.id)).html, html);
await assert.rejects(() => storage.getCustomApp("../outside"), /非法/);
assert.throws(() => storage.appPath(manifest.id, "../secret.txt"), /不允许/);
const updated = html.replace("我的数据库", "我的页面");
const saved = await storage.saveCustomApp(manifest.id,updated,1);
assert.equal(saved.version,2);
assert.equal((await storage.getCustomApp(manifest.id)).html,updated);
await assert.rejects(() => storage.saveCustomApp(manifest.id,updated+"!",1),/其他编辑器/);
const versions = await storage.listCustomVersions(manifest.id);
assert.equal(versions.length,1);
assert.match(versions[0], /^v1-/);
const restored = await storage.restoreCustomVersion(manifest.id,versions[0],2);
assert.equal(restored.version,3);
assert.equal((await storage.getCustomApp(manifest.id)).html,html);
assert.equal((await storage.listCustomVersions(manifest.id)).length,2);

const srcdoc = runtime.customViewSrcdoc(html);
writeFileSync("tmp/custom-view-test/srcdoc.html", srcdoc);
writeFileSync("tmp/custom-view-test/srcdoc-paginator.html",
  runtime.customViewSrcdoc("<!doctype html><html><head><title>Pager test</title></head><body>Pager test</body></html>"));
assert.match(srcdoc, /<base href="\/">/);
assert.match(srcdoc, /<style id="dodo-custom-scrollbar">/);
assert.match(srcdoc, /scrollbar-width: thin/);
assert.match(srcdoc, /width: 6px/);
assert.match(srcdoc, /scrollbar-color: rgba\(127, 127, 127, 0\.58\) transparent/);
assert.match(srcdoc, /::-webkit-scrollbar-button/);
assert(srcdoc.indexOf('id="dodo-custom-scrollbar"') < srcdoc.indexOf('<style>'),
  "App CSS should appear after low-specificity plugin scrollbar defaults");
const customScrollbar = runtime.customViewSrcdoc('<html><head><style>html{scrollbar-width:auto}</style></head><body>Custom</body></html>');
assert(customScrollbar.indexOf('dodo-custom-scrollbar') < customScrollbar.indexOf('scrollbar-width:auto'),
  "User-defined scrollbars must override plugin defaults");
assert.doesNotMatch(srcdoc,/Content-Security-Policy|default-src|connect-src|form-action|getAssetPreview/);
assert.match(srcdoc,/window\.parent\.postMessage/);
assert.match(srcdoc, /createPaginator/);
assert.match(srcdoc, /const getPaginator/);
assert(srcdoc.indexOf('dodoDBReady') < srcdoc.indexOf("<title>"));
assert(!srcdoc.includes('src="/stage/protyle/js/echarts/echarts.min.js"'),
  "Non-chart HTML should not load the ECharts bundle");
assert.equal(runtime.needsECharts("echarts.init(document.querySelector('#chart'))"),true);
assert.equal(runtime.needsECharts("window.echarts.getInstanceByDom(node)"),true);
assert.equal(runtime.needsECharts('<meta name="dodo-echarts" content="enabled">'),true);
assert.equal(runtime.needsECharts("const n = 'hello';"),false);
const chartSrcdoc = runtime.customViewSrcdoc('<html><head><title>Chart</title></head><body>' +
  '<div id="chart"></div><script>echarts.init(document.querySelector("#chart"));</script></body></html>');
assert.match(chartSrcdoc,/<script src="\/stage\/protyle\/js\/echarts\/echarts\.min\.js"><\/script>/);
assert(chartSrcdoc.indexOf('/echarts.min.js')<chartSrcdoc.lastIndexOf('echarts.init('),
  "Built-in ECharts should load before user chart initialization");
assert.doesNotMatch(chartSrcdoc, /Content-Security-Policy/);
const mountSource = readFileSync("src/lets-database-view/visual/visual-view-service.ts","utf8");
assert.doesNotMatch(mountSource, /frame\.(?:setAttribute\s*\(\s*["']sandbox|sandbox\s*=|sandbox\.add)/);
const conf = schema.readDatabaseViewDocument(JSON.stringify({schemaVersion:1,
  views:{"20261104120000-abcdeff":{mode:"custom",
  configs:{custom:{appId:manifest.id,allowWrites:false}}}}}));
assert.equal(conf.views["20261104120000-abcdeff"].mode,"custom");

console.log("PASS: custom app storage, version snapshots, rollback, direct assets default HTML, no iframe sandbox/CSP, ECharts bootstrap and schema");
