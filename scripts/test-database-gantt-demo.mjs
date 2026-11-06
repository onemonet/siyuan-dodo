import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=(path)=>readFileSync(path,"utf8");
const schemaPath="src/lets-database-view/view-config-schema.ts";
const schemaSource=read(schemaPath);
const schemaJs=await transformWithEsbuild(schemaSource,schemaPath,{loader:"ts",format:"esm"});
const schema=await import("data:text/javascript;base64,"+Buffer.from(schemaJs.code).toString("base64"));
const viewId="20261020180000-abcdefg";
const chartId="20261020180000-abcdefh";
const stored={
  schemaVersion:1,
  views:{
    [viewId]:{mode:"gantt",configs:{gantt:{height:620,demo:true}}},
    [chartId]:{mode:"chart",configs:{chart:{type:"bar-basic"}}},
  },
};
const decoded=schema.readDatabaseViewDocument(JSON.stringify(stored));
assert.equal(decoded.views[viewId].mode,"gantt");
assert.equal(decoded.views[viewId].configs.gantt.demo,true);
assert.equal(decoded.views[chartId].mode,"chart");
assert.equal(schema.activeVisualConfigs(decoded)[viewId].kind,"gantt");
assert.equal(schema.activeVisualConfigs(decoded)[chartId].kind,"chart");

const meta=read("src/lets-database-view/plugin.ts");
const svc=read("src/lets-database-view/visual/visual-view-service.ts");
const controller=read("src/lets-database-view/index.ts");
const vite=read("vite.config.ts");
const main=read("src/lets-database-view/gantt/iframe/main.js");
const html=read("src/lets-database-view/gantt/iframe/gantt-iframe.html");
const css=read("src/lets-database-view/gantt/iframe/app.css");
const license=read("src/lets-database-view/gantt/iframe/FRAPPE-GANTT-LICENSE.txt");
assert.match(license,/The MIT License/);
assert.ok(existsSync("src/lets-database-view/gantt/iframe/frappe-gantt.umd.js"));
assert.ok(existsSync("src/lets-database-view/gantt/iframe/frappe-gantt.css"));
assert.ok(!Object.hasOwn(JSON.parse(read("package.json")).dependencies,"dhtmlx-gantt"),
  "DHTMLX runtime must not remain as project dependency");
const manifest=JSON.parse(read("plugin.json"));
assert.ok(manifest.publish.resources.includes("preview/gantt/"),
  "SiYuan must expose Gantt iframe resources without broad publication permissions");
assert.match(meta,/key: "gantt-view-enabled"/);
assert.match(controller,/gantt-view-enabled/);
assert.match(controller,/map \|\| chart \|\| timeline \|\| gantt/);
const registry=read("src/lets-database-view/view-registry.ts");
const policies=read("src/lets-database-view/visual/visual-mount-policies.ts");
const initializers=read("src/lets-database-view/visual/visual-initializers.ts");
const settings=read("src/lets-database-view/visual/visual-settings.ts");
const render=read("src/lets-database-view/gantt/gantt-renderer.ts");
const interactions=read("src/lets-database-view/visual/visual-interactions.ts");
assert.match(registry,/id: "gantt", label: "甘特"/);
assert.match(initializers,/name: "甘特"/);
assert.match(registry,/preview\/gantt\/gantt-iframe\.html/);
assert.match(settings,/openGanttPreviewSettings/);
assert.match(settings,/GanttSettingsPanel/);
assert.match(render,/renderGanttView/);
assert.match(render,/saveGanttEditView/);
assert.match(render,/mounted\.ganttMapping/);
assert.match(interactions,/createGanttMessageHandler/);
assert.match(svc,/dodo-av-visual--active/);
assert.match(svc,/const SETTINGS = "dodo-av-view-settings"/);
assert.match(svc,/this\.ensureSettingsButton\(av, header, blockId, active\)/);
assert.match(svc,/if\(button\.previousElementSibling!==picker\)picker\.after\(button\)/);
assert.match(svc,/host\.append\(frame\)/);
assert.doesNotMatch(svc,/dodo-av-visual-actions/,
  "Do not overlay view settings above the Gantt timeline");
assert.match(read("src/lets-database-view/database-view.css"),/\.av__views > \.dodo-av-view-settings/);
assert.match(vite,/function emitGanttPreviewAssets\(/);
assert.match(vite,/emitGanttPreviewAssets\(\)/);
assert.match(main,/window\.Gantt/);
assert.match(main,/new Frappe\(timeline/);
assert.match(main,/on_date_change\(task,start,end\)/);
assert.match(main,/on_progress_change\(task,value\)/);
assert.match(main,/chart\.update_task\(/);
assert.match(main,/dodoGanttReady/);
assert.match(main,/dodoGanttEdit/);
assert.match(main,/dodoGanttSaveResult/);
assert.match(main,/dodoGanttSetTimeStep/);
assert.match(main,/snap_at:minuteStep===15\?"900s":minuteStep===30\?"1800s":"1d"/);
assert.match(main,/flushDateChanges/);
assert.match(main,/toggleGroup/);
assert.match(main,/openEditor/);
assert.match(html,/script src="\.\/frappe-gantt\.umd\.js"/);
assert.match(html,/href="\.\/frappe-gantt\.css"/);
assert.match(html,/<button type="button" id="dodo-gantt-zoom"/);
assert.match(html,/aria-haspopup="menu"/);
assert.doesNotMatch(html,/<select id="dodo-gantt-zoom"/);
for(const label of ["小时","日","周","月"])
  assert.ok(main.includes(label));
assert.match(main,/dodoGanttOpenZoomMenu/);
assert.match(main,/dodoGanttChangeZoom/);
assert.match(read("src/lets-database-view/gantt/gantt-interaction.ts"),/new Menu\("dodo-gantt-native-zoom-menu"\)/);
assert.doesNotMatch(html,/dodo-gantt-segments|data-zoom=/);
assert.match(main,/function scrollToToday\(\)/);
assert.match(main,/function syncNowMarker\(now=new Date\(\)\)/);
assert.match(css,/\.dodo-gantt-header\{position:absolute;top:0;left:260px/);
assert.doesNotMatch(html,/dodo-gantt-footer|Frappe Gantt · MIT/,
  "Remove the visible Gantt footer and license label");
assert.match(html,/id="dodo-gantt-status" class="dodo-gantt-screen-reader-status" role="status"/,
  "Keep status announcements available without a visible footer");
assert.match(css,/\.dodo-gantt-screen-reader-status\{[^}]*clip-path:inset\(50%\)/,
  "Status announcements must not take up layout space");
assert.doesNotMatch(html,/dodo-gantt-title|dodo-gantt-demo-tag|Frappe Gantt · 项目排期/,
  "Gantt header must not display the demo title or database name");
assert.doesNotMatch(main,/\.dodo-gantt-title|\.dodo-gantt-demo-tag|data\.sourceName/,
  "Native updates must not try to write a removed heading");
assert.match(css,/\.dodo-gantt-header\{[^}]*justify-content:flex-end/,
  "Keep zoom and action controls right-aligned without a title");
assert.match(css,/dodo-frappe-grid/);
const vendorBar=read("src/lets-database-view/gantt/vendor/frappe-1.2.2/src/bar.js");
assert.match(vendorBar,/const handle_width = 8/);
assert.match(vendorBar,/cy: bar_progress\.getY\(\) \+ 1/);
assert.match(css,/\.bar-wrapper:hover \.handle\.progress\{opacity:\.85\}/);
assert.match(vendorBar,/this\.\$date_highlight\?\.remove\(\)/);
assert.match(vendorBar,/label\.setAttribute\('x', x \+ \(img \? this\.image_size \+ 14 : 12\)\)/);
assert.match(css,/\.bar-label\{[^}]*--dodo-av-font-size,14px[^}]*--dodo-av-color,#222[^}]*text-anchor:start/);
assert.match(css,/\.dodo-frappe-name\{[^}]*--dodo-av-font-size,14px[^}]*--dodo-av-color,#222/);
assert.match(render,/typography:bridge\.typography\(av\)/);
assert.match(main,/applyNativeTypography\(data\.typography\)/);
assert.doesNotMatch(main,/\/api\/|setBlockAttrs|updateView\(|renderAttributeView|fetch\(/,
  "iframe must never directly call SiYuan native database API");
for(const name of ["gantt-iframe.html","main.js","app.css",
  "frappe-gantt.umd.js","frappe-gantt.css","FRAPPE-GANTT-LICENSE.txt"]) {
  assert.ok(existsSync("dist/preview/gantt/"+name),"Missing Frappe asset: "+name);
}
assert.equal(read("dist/preview/gantt/main.js"),main,
  "iframe renderer must not be modified during packaging");
assert.equal(read("dist/preview/gantt/FRAPPE-GANTT-LICENSE.txt"),license);
assert.match(read("dist/preview/gantt/gantt-iframe.html"),
  /src="\.\/main\.js\?v=[0-9a-f]{12}"/);
assert.match(read("dist/preview/gantt/gantt-iframe.html"),
  /href="\.\/app\.css\?v=[0-9a-f]{12}"/);
assert.match(read("dist/preview/gantt/gantt-iframe.html"),
  /src="\.\/frappe-gantt\.umd\.js\?v=[0-9a-f]{12}"/);
assert.match(read("dist/preview/gantt/gantt-iframe.html"),
  /href="\.\/frappe-gantt\.css\?v=[0-9a-f]{12}"/);
assert.doesNotMatch(read("dist/preview/gantt/gantt-iframe.html"),/DHTMLX|dhtmlx/i);
console.log("PASS: Frappe Gantt MIT, native SiYuan AV fifth view, offline assets, grouping, snap, write bridge and cache busting");
