import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { transform } from "esbuild";

const { chromium } = createRequire(import.meta.url)("playwright");
const raw = readFileSync("src/lets-database-view/gantt/gantt-interaction.ts", "utf8")
  .replace(/^import .*;\s*$/gm, "")
  .replace(/^export /gm, "");
const handler = (await transform(`
const databaseViewHost = { fromSource: (source, kind) => kind === "gantt" && source === frame.contentWindow };
const openMapItem = async () => {};
const showMessage = () => {};
class Menu {
  constructor(id) {
    this.id = id;
    this.isOpen = window.__activeNativeMenu?.id === id;
    window.__activeNativeMenu?.close();
    this.items = [];
    this.root = null;
  }
  addItem(item) { if (!this.isOpen) this.items.push(item); }
  close() {
    this.root?.remove(); this.root = null;
    if (window.__activeNativeMenu === this) window.__activeNativeMenu = null;
  }
  open({x,y}) {
    if (this.isOpen) return;
    window.__activeNativeMenu = this;
    this.root = document.createElement("div");
    this.root.className = "test-gantt-native-menu";
    this.root.style.cssText = "position:fixed;z-index:99999;background:white";
    this.root.style.left = x + "px";
    this.root.style.top = y + "px";
    this.root.dataset.x = x;
    this.root.dataset.y = y;
    for(const item of this.items) {
      const button = document.createElement("button");
      button.textContent = item.label;
      button.dataset.current = String(Boolean(item.current));
      if (typeof item.iconHTML !== "string") button.append(document.createElement("svg"));
      button.addEventListener("click", () => { this.close(); item.click(); });
      this.root.append(button);
    }
    document.body.append(this.root);
  }
}
${raw}
const frame = document.getElementById("frame");
const av = document.querySelector(".av");
const mounted = { kind:"gantt", viewId:"gantt-view", frame, host: document.querySelector(".dodo-av-visual-host") };
const mounts = new Map([[av,mounted]]);
window.savedScales = [];
window.handler = createGanttMessageHandler({
  running: () => true,
  mounted: () => mounts,
  currentView: header => header.dataset.currentViewId,
  render: async () => send(),
  saveTimeStep: async (_av, _mounted, requestId, timeStep, zoom) => {
    window.savedScales.push({timeStep,zoom});
    frame.contentWindow.postMessage({type:"dodoGanttTimeStepSaved",requestId,success:true},location.origin);
    frame.contentWindow.postMessage({type:"dodoGanttData",data:[{
      id:"20261020101010-ddddddd",text:"原生菜单测试任务",type:"task",
      start_date:"2026-10-20 09:00",end_date:"2026-10-23 11:00",progress:.4,
    }],zoom,timeStep,editableDates:false,editableProgress:false,revision:window.savedScales.length+1},location.origin);
  },
  saveEdit: async () => {},
  saving: new Set(),
});
function send() {
  frame.contentWindow.postMessage({type:"dodoGanttData",data:[{
    id:"20261020101010-ddddddd",text:"原生菜单测试任务",type:"task",
    start_date:"2026-10-20",end_date:"2026-10-23",progress:.4,
  }],zoom:"week",timeStep:0,editableDates:false,editableProgress:false,revision:1},location.origin);
}
window.addEventListener("message", event => window.handler(event));
`, {loader:"ts",format:"iife",target:"es2022"})).code;
const host = `<!doctype html><html lang="zh-CN"><meta charset="utf-8" />
  <div class="av"><div class="av__container"><div class="av__header" data-current-view-id="gantt-view"></div></div></div>
  <div class="dodo-av-visual-host"><iframe id="frame" src="/gantt-iframe.html" style="width:1200px;height:600px;border:0"></iframe></div>
  <script src="/host.js"></script>`;
const staticDir = "src/lets-database-view/gantt/iframe/";
const types = {".html":"text/html", ".js":"text/javascript", ".css":"text/css"};
const server = createServer((request,response) => {
  const path = request.url?.split("?")[0] || "/";
  const name = path.slice(1);
  let bytes;
  if(path === "/host.html")bytes = host;
  else if(path === "/host.js")bytes = handler;
  else if(["gantt-iframe.html","main.js","app.css","frappe-gantt.umd.js","frappe-gantt.css"].includes(name))
    bytes = readFileSync(staticDir + name);
  if(!bytes){response.writeHead(404);response.end("Not found");return;}
  response.writeHead(200,{"Content-Type":types[path.slice(path.lastIndexOf("."))] || "text/plain"});
  response.end(bytes);
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
let browser;
try {
  browser = await chromium.launch({headless:true,channel:"chrome"});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/host.html`);
  const frame = page.frameLocator("#frame");
  const button = frame.locator("#dodo-gantt-zoom");
  await frame.getByText("原生菜单测试任务").first().waitFor();
  assert.equal(await button.evaluate(el=>el.tagName),"BUTTON");
  assert.equal(await frame.locator("select#dodo-gantt-zoom").count(),0);
  await button.click();
  await page.locator(".test-gantt-native-menu").waitFor();
  await button.click();
  await page.locator(".test-gantt-native-menu").waitFor({state:"detached"});
  await button.click();
  await page.locator(".test-gantt-native-menu").waitFor();
  await page.evaluate(() => window.__activeNativeMenu?.close());
  await button.click();
  await page.locator(".test-gantt-native-menu").waitFor();
  await page.evaluate(() => window.__activeNativeMenu?.close());
  for(const [zoom,label,step] of [["day","日",15],["hour","小时",15],["week","周",0],["month","月",0]]) {
    const original = await button.innerText();
    await button.click();
    const menu = page.locator(".test-gantt-native-menu");
    await menu.waitFor();
    assert.deepEqual(await menu.locator("button").allTextContents(),["小时","日","周","月"]);
    assert.equal(await menu.locator("svg").count(),0,
      "native menu should not render blank left-side icon placeholders");
    assert.equal(await menu.locator("[data-current=true]").innerText(), original);
    const rect = await button.boundingBox();
    const pos = await menu.evaluate(el=>({x:Number(el.dataset.x),y:Number(el.dataset.y)}));
    assert.ok(rect && Math.abs(pos.x-rect.x)<4 && Math.abs(pos.y-rect.y-rect.height-4)<4,
      "SiYuan Menu must appear below the iframe button");
    await menu.getByRole("button",{name:label,exact:true}).click();
    await page.waitForFunction(expected => window.savedScales?.at(-1)?.zoom === expected,zoom);
    await page.waitForFunction(expected => document.querySelector("iframe")?.contentDocument?.getElementById("dodo-gantt-zoom")?.textContent===expected,label);
    const saved = await page.evaluate(() => window.savedScales.at(-1));
    assert.deepEqual(saved,{zoom,timeStep:step});
    assert.equal(await button.getAttribute("aria-label"),"时间刻度："+label+"，点击切换");
    assert.equal(await button.getAttribute("aria-haspopup"),"menu");
    assert.equal(await button.evaluate(el=>getComputedStyle(el,"::after").content),'""');
  }
  assert.deepEqual(errors,[]);
  console.log("PASS: native SiYuan Menu trigger, positioning, selected state, four Frappe zoom modes and ACK persistence");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
