import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
const context = { Date, Map, Set, Promise, Error, Number, Array, String, console };
const modules = {};

function compileModule(path, key, dependencies = {}) {
  const source = readFileSync(path,"utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  assert.equal((js.diagnostics ?? []).length, 0);
  const exports = {};
  vm.runInNewContext(js.outputText, {
    ...context,
    exports,
    require(name) {
      if (!(name in dependencies)) throw Error("Unexpected module dependency: " + name);
      return dependencies[name];
    },
  }, { filename: path });
  modules[key] = exports;
  return exports;
}

let calls = 0;
let shouldFail = false;
const svc = compileModule("src/lets-file-manager/file-service.ts","service", {
  "../request-utils": {
    postJsonWithTimeout: async (endpoint, args, init, opts) => {
      assert.equal(endpoint, "/api/asset/statAsset");
      assert.equal(opts.timeoutMs, 10000);
      assert.equal(args.path, "assets/pictures/example.jpg");
      calls++;
      if (shouldFail) return {code: 1, msg: "not found"};
      return {code: 0, data: {size: 9 * 1024 * 1024}};
    },
  },
});
const filter = compileModule("src/lets-file-manager/filter-utils.ts","filters", {"./file-service":svc});
assert.equal(await svc.getAssetSize("pictures/example.jpg", 1),9 * 1024 * 1024);
assert.equal(await svc.getAssetSize("pictures/example.jpg", 1),9 * 1024 * 1024);
assert.equal(calls,1,"stat result is cached");
const again = await Promise.all([svc.getAssetSize("pictures/example.jpg",2),svc.getAssetSize("pictures/example.jpg",2)]);
assert.equal(again.length,2);
assert.equal(calls,2,"simultaneous stat requests are deduplicated");
shouldFail = true;
await assert.rejects(svc.getAssetSize("pictures/example.jpg",3));
await assert.rejects(svc.getAssetSize("pictures/example.jpg",3));
assert.equal(calls,4,"failures are not cached as valid sizes");

const file = (name, size, updated = 0) => ({name, isDir:false,size,updated});
const data = [
  {name:"设计资源",isDir:true},
  file("tiny.png",100,3),
  file("medium.jpg",4 * 1048576,6),
  file("large.mp4",14 * 1048576,5),
  file("huge.zip",101 * 1048576,2),
  file("unknown.webp",undefined,4),
];
const options = (patch) => ({
  folder:"", keyword:"", extensions:[], size:"all", sort:"updated", sizes:{},...patch,
});
const names = o => Array.from(filter.filterAndSortFiles(data,options(o))).map(x=>x.name);
assert.deepEqual(names({}),["medium.jpg","large.mp4","unknown.webp","tiny.png","huge.zip"]);
assert.deepEqual(names({keyword:"LARGE"}),["large.mp4"],"case-insensitive search");
assert.deepEqual(names({extensions:["jpg"]}),["medium.jpg"],"filter exactly .jpg (not all images)");
assert.deepEqual(names({extensions:["png","webp"]}),["unknown.webp","tiny.png"],"select multiple concrete suffixes");
assert.deepEqual(names({extensions:["jpg","png"],keyword:"medium"}),["medium.jpg"],"keyword AND extension");
assert.deepEqual(names({extensions:["jpg","webp"],size:"1to10"}),["medium.jpg"],"size AND extension");
assert.deepEqual(names({extensions:["pdf"]}),[],"unknown suffix yields no matching files in grid; tree remains in sidebar");
assert.deepEqual(names({size:"under1"}),["tiny.png"],"unknown sizes are not silently assumed small");
assert.deepEqual(names({size:"1to10"}),["medium.jpg"]);
assert.deepEqual(names({size:"10to100"}),["large.mp4"]);
assert.deepEqual(names({size:"over100"}),["huge.zip"]);
assert.deepEqual(names({sort:"size"}),["huge.zip","large.mp4","medium.jpg","tiny.png","unknown.webp"]);
assert.deepEqual(names({keyword:"",extensions:["jpg","png"],size:"under1"}),["tiny.png"]);
assert.deepEqual(names({size:"under1",sizes:{"unknown.webp":300}}),["unknown.webp","tiny.png"]);

assert.equal(filter.getFileExtension("IMAGE.JPG"),"jpg","case-insensitive extensions");
assert.equal(filter.getFileExtension("multi.part.tar.GZ"),"gz","only final suffix is used");
assert.equal(filter.getFileExtension("no_extension"),filter.NO_EXTENSION);
assert.equal(filter.getFileExtension(".gitignore"),filter.NO_EXTENSION);
assert.equal(filter.getFileExtension("no_extension."),filter.NO_EXTENSION);
const sampleFormats = [
  {name:"jpg1.JPG",isDir:false},
  {name:"jpg2.jpg",isDir:false},
  {name:"png1.PNG",isDir:false},
  {name:"plain",isDir:false},
  {name:"nested",isDir:true},
];
const extensions = filter.collectFileExtensions(sampleFormats, ["pdf"]);
assert.deepEqual(Array.from(extensions, x=>[x.extension,x.count]),[
  ["jpg",2],["png",1],[filter.NO_EXTENSION,1],["pdf",0],
],"format counts come from current directory and preserve selected absent suffixes");
assert.deepEqual(
  Array.from(filter.filterAndSortFiles(sampleFormats,options({extensions:["jpg","png"]}))).map(x=>x.name),
  ["jpg1.JPG","jpg2.jpg","png1.PNG"],
  "OR across format selections and case-insensitive suffix matching",
);

const ui = readFileSync("src/lets-file-manager/FileManagerPage.svelte","utf8");
assert.ok(!ui.includes('class="fm-brand"'), "old branded global toolbar removed");
assert.ok(!ui.includes('class="fm-side-link"'), "left sidebar contains only tree");
assert.ok(ui.includes('class="fm-viewbar"') && ui.includes('class="fm-filterbar"'));
assert.equal((ui.match(/<Popover.Root/g)||[]).length,2,"format/size use popovers; keyword opens inline");
assert.ok(ui.includes('collectFileExtensions(entries, selectedExtensions)'),"dynamic format counts");

// List-only file-size column reuses the statAsset cache and fetches lazily,
// avoiding full-folder size queries just to display metadata.
const css = readFileSync("src/lets-file-manager/file-manager.css","utf8");
assert.ok(ui.includes('<span class="fm-list-size">文件大小</span>'),
  "list view header exposes a fourth file-size column");
assert.ok(ui.includes('use:observeListRowSize={item}'),
  "each list row loads size only as it enters the viewport");
assert.ok(ui.includes('root: scrollContainer, rootMargin: "220px 0px"'),
  "visible list rows are observed against the file scroller");
assert.ok(ui.includes('listSizeActive < 4'),
  "at most four new statAsset reads are concurrent");
assert.ok(ui.includes('sizeByPath[assetRelativePath(currentFolder, item.name)]'),
  "list cells use existing per-path size data");
assert.ok(ui.includes('formatSize(item.size)'),
  "directory listing sizes render instantly without API calls");
assert.ok(ui.includes('listSizeUnavailable[assetRelativePath(currentFolder, item.name)]'),
  "file size request errors display fallback instead of staying loading");
assert.ok(css.includes('grid-template-columns: minmax(140px, 1fr) 86px 130px 89px'),
  "four-column grid keeps name flexible and size right-aligned");
assert.ok(css.includes('font-variant-numeric: tabular-nums') &&
  css.includes('@media (max-width: 950px)'),"tabular sizes and narrow layouts");

assert.ok(ui.includes('role="checkbox" aria-checked='),"multi-selection is accessible");
assert.ok(ui.includes('格式 ·') && ui.includes('formatSearch'),"format filter label and search available");
assert.ok(!ui.includes('fileTypeOptions'),"old generic type menu removed");
assert.ok(ui.includes('getAssetSize(path, item.updated)'),"official stat API for size");
assert.ok(ui.includes('getReadableReferencePaths'),"reference lookup remains available");
assert.ok(ui.includes('on:click={openCompression}') && ui.includes('compressOpen') === false
  && ui.includes('compressionOpen'),"compression button and dialog available");
assert.ok(ui.includes('commitCompression(') && ui.includes('prepareCompressionBatch('),
  "batch image compression and native reference migration wired");
assert.ok(ui.includes('function handleFileClick(') && ui.includes('event.shiftKey')
  && ui.includes('event.ctrlKey'),"Ctrl/Shift multiple selection in gallery");
assert.ok(ui.includes('compressionStage === "review"')
  && ui.includes('selectCompressionChoices(')
  && ui.includes('selectedBatchRecords('),"checkbox approval before writing any images");
assert.ok(ui.includes('replaceImageAsset(source, file)'),"image replace migrates references/OCR");
assert.ok(ui.includes('result.oldRemoved ? "replaced" : "warning"'),
  "batch result distinguishes safe deletion from incomplete migration");


assert.ok(ui.includes('class="fm-keyword-inline"') && ui.includes('use:focusKeywordInput'),"keyword expands inline with focus");
assert.ok(!ui.includes('fm-keyword-popover'),"keyword no longer opens a popover");
assert.ok(ui.includes('style:width="{leftWidth}px"') && ui.includes('style:width="{rightWidth}px"'),"both sides are independently resizable");
assert.ok(ui.includes('toggleLeftPanel') && ui.includes('toggleRightPanel'),"left/right panel controls are independent");
const sidebarStart = ui.indexOf('<aside class="fm-sidebar"');
const mainStart = ui.indexOf('<main class="fm-main">');
const toolbarStart = ui.indexOf('<div class="fm-viewbar"');
const toolbarEnd = ui.indexOf('<div class="fm-filterbar"');
const inspectorStart = ui.indexOf('<div class="fm-inspector-heading">');
const inspectorEnd = ui.indexOf('{#if selected}',inspectorStart);
const sidebar = ui.slice(sidebarStart,mainStart);
const toolbar = ui.slice(toolbarStart,toolbarEnd);
const inspector = ui.slice(inspectorStart,inspectorEnd);
assert.ok(sidebar.includes('PanelLeftClose'),"left panel collapse is inside the sidebar");
assert.ok(toolbar.includes('{#if !leftOpen}') && toolbar.includes('PanelLeftOpen'),"center only shows left-open control when left is collapsed");
assert.ok(!toolbar.includes('PanelLeftClose'),"no redundant left-close button in center toolbar");
assert.equal((toolbar.match(/class="fm-icon-btn fm-panel-toggle fm-rightmost-toggle"/g)||[]).length,1,"one right panel toggle in toolbar");
assert.ok(toolbar.includes('{#if !inspectOpen}') && toolbar.includes('PanelRightOpen'),"center right panel button only appears when inspector is collapsed");
assert.ok(!toolbar.includes('PanelRightClose'),"center must never duplicate inspector collapse button");
assert.ok(toolbar.indexOf('class="fm-search"') < toolbar.indexOf('fm-rightmost-toggle'),"right toggle comes after search");
assert.ok(toolbar.indexOf('fm-rightmost-toggle') < toolbar.lastIndexOf('</div>'),"right toggle remains in toolbar");
assert.ok(inspector.indexOf('折叠检查器') < inspector.indexOf('<strong>检查器</strong>'),"inspector collapse appears to the left of the title");

assert.ok(ui.includes('aria-valuenow={Math.round(leftWidth)}') && ui.includes('aria-valuenow={Math.round(rightWidth)}'),"accessible resize separators");
assert.ok(ui.includes('restorePanelLayout()') && ui.includes('savePanelLayout()'),"panel layout persists between views");
assert.ok(ui.includes('on:pointermove={(event) => movePanelResize("left", event)}'),"pointer resize available");

console.log("PASS: folder-only sidebar, independent resizable panels, inline keyword, extension filters, lazy metadata and sorting");


