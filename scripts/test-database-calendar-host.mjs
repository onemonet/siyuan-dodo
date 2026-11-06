import { databaseViewTestRuntime } from "./database-view-test-runtime.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { build, transform } from "esbuild";

const { chromium } = createRequire(import.meta.url)("playwright");
// Optional real SiYuan theme.css paths (light, dark) exercise the native palette.
const nativeThemes = process.argv.slice(2, 4).map(path => readFileSync(path, "utf8"));
const source = readFileSync("src/lets-database-view/visual/visual-view-service.ts", "utf8");
const handlerSource = ["gantt/gantt-interaction.ts", "calendar/calendar-interaction.ts"]
  .map(file => readFileSync("src/lets-database-view/" + file, "utf8")
    .replace(/^import .*;\s*$/gm, "")
    .replace(/^export /gm, "")
    .replace(/^const ID = .*;\s*$/gm, "")).join("\n");
const renderSources = ["gantt/gantt-renderer.ts", "calendar/calendar-renderer.ts", "visual/chart-renderer.ts"]
  .map(file => readFileSync("src/lets-database-view/" + file, "utf8")
    .replace(/^import .*;\s*$/gm, "")
    .replace(/^export /gm, "")
    .replace(/^const ID = .*;\s*$/gm, "")).join("\n");
const rendererRegistrySource = readFileSync("src/lets-database-view/visual/visual-renderers.ts","utf8")
  .replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"");
const interactionRegistrySource = readFileSync("src/lets-database-view/visual/visual-interactions.ts","utf8")
  .replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"");
const host = (await transform(await databaseViewTestRuntime() +
  '\nclass DatabaseVisualSettings { constructor(_bridge) {} stop() {} openSettings() {} }' +
  '\nconst databaseViewWrites = { subscribe: () => () => {}, run: async (_ctx, work) => work() };' +
  '\nconst openMapItem = async () => {};' +
  `
class Menu {
  constructor(id) {
    this.id = id;
    this.isOpen = window.__activeNativeMenu?.id === id;
    window.__activeNativeMenu?.close();
    this.items = [];
    this.element = null;
  }
  addItem(item) { if (!this.isOpen) this.items.push(item); }
  close() {
    this.element?.remove(); this.element = null;
    if (window.__activeNativeMenu === this) window.__activeNativeMenu = null;
  }
  open({x, y}) {
    if (this.isOpen) return;
    window.__activeNativeMenu = this;
    const element = document.createElement("div");
    element.className = "dodo-calendar-test-menu";
    element.style.position = "fixed";
    element.style.left = x + "px";
    element.style.top = y + "px";
    element.dataset.x = String(x);
    element.dataset.y = String(y);
    for (const item of this.items) {
      const button = document.createElement("button");
      button.textContent = item.label;
      button.dataset.current = String(Boolean(item.current));
      if (typeof item.iconHTML !== "string") button.append(document.createElement("svg"));
      button.addEventListener("click", () => { this.close(); item.click(); });
      element.append(button);
    }
    document.body.append(element);
    this.element = element;
  }
}
` +
  '\nconst ID = /^\\d{14}-[a-z0-9]{7}$/;\n' + handlerSource + renderSources + rendererRegistrySource + interactionRegistrySource +
  source.slice(source.indexOf("const ACTIVE ="))
  .replace("export class DatabaseVisualViews", "class DatabaseVisualViews") + `
const viewID = "20261021123456-ccccccc";
const config = {kind:"calendar",calendar:{}};
const DatabaseViewConfigStore = {subscribe:()=>()=>{},load:async()=>({views:{[viewID]:{mode:"calendar",configs:{}}}})};
const CALENDAR_VIEWS = ["dayGridMonth"];
const renderAttributeView = async()=>({view:{columns:[{}]}});
const makeCalendarResult = ()=>({events:window.events,mapping:{}});
const createCalendarItem = async(_context,_mapping,item)=>{
  window.created = item;
  window.events.push({...item,id:"20261021123456-eeeeeee",
    start:item.start.replace(" ","T"),end:item.end.replace(" ","T"),editable:true});
};
const showMessage = ()=>{};
window.events = [{id:"20261021123456-ddddddd",title:"已有日程",
  start:new Date().toISOString().slice(0,7)+"-10",
  end:new Date().toISOString().slice(0,7)+"-11",allDay:true,editable:true}];
window.manager = new DatabaseVisualViews({},()=>false);
manager.read = async()=>({[viewID]:config});
manager.ensurePicker = manager.ensureSettingsButton = ()=>{};
manager.start();
`, { loader: "ts", format: "iife", target: "es2022" })).code;
const bundle = await build({
  entryPoints: ["src/lets-database-view/calendar/iframe/main.ts"],
  outdir: "calendar-test", bundle: true, write: false,
  platform: "browser", format: "iife", target: "es2022", logLevel: "silent",
});
const assets = new Map(bundle.outputFiles.map(file => [file.path.split(/[\\/]/).at(-1), file.contents]));
assets.set("index.html", readFileSync("src/lets-database-view/calendar/iframe/index.html"));
const markup = `<div class="av" data-av-id="20261021123456-aaaaaaa" data-node-id="20261021123456-bbbbbbb">
  <div class="av__container"><div class="av__header" data-current-view-id="20261021123456-ccccccc">
  <div class="layout-tab-bar"><div class="item" data-id="20261021123456-ccccccc" data-av-type="table"></div></div>
  </div><div class="av__scroll"></div></div></div>`;
assets.set("host.html", Buffer.from(`<!doctype html><meta charset="utf-8">
  <style id="native-theme">${nativeThemes[0] || ""}</style>
  <div class="protyle-wysiwyg" contenteditable="true">${markup}</div><script>${host}</script>`));
const server = createServer((req, res) => {
  const name = req.url.split("?")[0].split("/").at(-1);
  const data = assets.get(name);
  res.writeHead(data ? 200 : 404, { "Content-Type": name.endsWith(".js") ? "text/javascript" :
    name.endsWith(".css") ? "text/css" : "text/html" });
  res.end(data || "missing");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({viewport:{width:1200,height:1000}});
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/host.html`);
  const frame = page.frameLocator("iframe");
  const selectRange = async (date = 16) => {
    const day = new Date().toISOString().slice(0, 7) + "-" + date;
    const cell = frame.locator(`[data-date="${day}"]`).first();
    const bounds = await cell.boundingBox();
    assert.ok(bounds, "visible calendar day for range selection");
    await page.mouse.move(bounds.x + 18, bounds.y + 40);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 45, bounds.y + 40, { steps: 5 });
    await page.mouse.up();
    await frame.locator("#calendar-quick-name").waitFor();
  };
  await frame.getByText("已有日程", {exact:true}).waitFor();
  await frame.getByText("已有日程", {exact:true}).evaluate(el => el.dataset.themeStable = "yes");
  for (const [index, css] of nativeThemes.entries()) {
    await page.locator("#native-theme").evaluate((el, css) => el.textContent = css, css);
    await page.evaluate(index => document.documentElement.dataset.themeMode = index ? "dark" : "light", index);
    const expected = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      const color = name => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
      };
      probe.style.backgroundColor = "color-mix(in srgb,var(--b3-av-calendar-background,var(--b3-theme-primary-lightest)) 50%,var(--b3-theme-background))";
      const result = {event:getComputedStyle(probe).backgroundColor,eventInk:color("--b3-theme-on-background"),
        paper:color("--b3-theme-background"),ink:color("--b3-theme-on-background"),
        button:color("--b3-theme-surface"),border:color("--b3-border-color")};
      probe.remove();
      return result;
    });
    await page.waitForFunction(paper => {
      const frame = document.querySelector("iframe");
      return frame && getComputedStyle(frame.contentDocument.body).backgroundColor === paper;
    }, expected.paper, {timeout:3000});
    const actual = await frame.getByText("已有日程", {exact:true}).evaluate(el => {
      const event = getComputedStyle(el.closest('[style*="--fc-event-color"]'));
      const button = getComputedStyle(document.querySelector('#calendar button:not([aria-pressed="true"]):not(:disabled)'));
      const body = getComputedStyle(document.body);
      return {event:event.backgroundColor,eventInk:getComputedStyle(el).color,paper:body.backgroundColor,ink:body.color,
        button:button.backgroundColor,border:button.borderTopColor};
    });
    assert.deepEqual(actual, expected, "real SiYuan theme must supply event/ink, neutral surfaces and borders");
    assert.equal(await frame.locator('[data-theme-stable="yes"]').count(), 1, "theme switch must preserve event DOM");
    assert.equal(await frame.locator("html").evaluate(el => el.style.colorScheme), index ? "dark" : "light");
    await frame.locator(".dodo-calendar-preview").screenshot({path:`tmp/calendar-native-${index ? "dark" : "light"}.png`});
    await selectRange();
    await frame.locator("#calendar-quick-details").click();
    assert.equal(await frame.locator("#calendar-create-dialog").evaluate(el => getComputedStyle(el).backgroundColor), expected.paper);
    assert.equal(await frame.locator("#calendar-create-start").evaluate(el => getComputedStyle(el).colorScheme), index ? "dark" : "light");
    await frame.locator(".dodo-calendar-preview").screenshot({path:`tmp/calendar-native-${index ? "dark" : "light"}-dialog.png`});
    await frame.locator("#calendar-create-cancel").click();
  }
  if (nativeThemes.length) console.log("PASS: actual daylight/midnight event contrast, neutral toolbar, border colors and live theme switch");
  const today = await page.evaluate(() => {
    const now = new Date();
    return {date:[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"),day:String(now.getDate())};
  });
  const changeView = async (type, label) => {
    const button = frame.locator(".dodo-calendar-view-menu");
    const original = await button.innerText();
    await button.click();
    const popup = page.locator(".dodo-calendar-test-menu");
    await popup.waitFor();
    assert.deepEqual(await popup.locator("button").allTextContents(), ["月", "周", "日", "日程"]);
    assert.equal(await popup.locator("svg").count(), 0,
      "native menu items must not reserve a blank leading icon slot");
    assert.equal(await popup.locator("[data-current=true]").innerText(), original,
      "the native menu marks the active view");
    const anchor = await button.boundingBox();
    const position = await popup.evaluate(el => ({x:Number(el.dataset.x),y:Number(el.dataset.y)}));
    assert.ok(anchor && Math.abs(position.x - anchor.x) < 4 &&
      Math.abs(position.y - anchor.y - anchor.height - 4) < 4,
      "the native menu must open immediately below its iframe toolbar button");
    await popup.getByRole("button", {name:label,exact:true}).click();
    await page.waitForFunction(label =>
      document.querySelector("iframe")?.contentDocument?.querySelector(".dodo-calendar-view-menu")?.textContent === label,
    label, {timeout:3000});
    assert.equal(await button.getAttribute("aria-haspopup"), "menu");
    assert.equal(await button.evaluate(el => getComputedStyle(el, "::after").content), String.fromCharCode(34,34), "dropdown arrow should be visible");
    assert.equal(await button.getAttribute("aria-label"), "日历视图：" + label + "，点击切换");
  };
  const trigger = frame.locator(".dodo-calendar-view-menu");
  await trigger.click();
  await page.locator(".dodo-calendar-test-menu").waitFor();
  await trigger.click();
  await page.locator(".dodo-calendar-test-menu").waitFor({state:"detached"});
  await trigger.click();
  await page.locator(".dodo-calendar-test-menu").waitFor();
  await page.evaluate(() => window.__activeNativeMenu?.close());
  await trigger.click();
  await page.locator(".dodo-calendar-test-menu").waitFor();
  await page.evaluate(() => window.__activeNativeMenu?.close());
  console.log("PASS: calendar native Menu toggles closed on second click and reopens after outside dismissal");
  for (const [type, view, label] of [["dayGridMonth","month","月"],["timeGridWeek","week","周"],["timeGridDay","day","日"]]) {
    await changeView(type, label);
    const badge = frame.locator(".dodo-calendar-today-number");
    await badge.waitFor({timeout:3000});
    assert.equal(await badge.innerText(), today.day, view + " must highlight only today's day number");
    const bounds = await badge.boundingBox();
    assert.ok(bounds && bounds.width < 40, view + " must keep the date badge snug to the number");
    const backgrounds = await frame.locator(`[data-date="${today.date}"]`).evaluateAll(els =>
      els.map(el => getComputedStyle(el).backgroundColor));
    assert.ok(backgrounds.length && backgrounds.every(color => color === "rgba(0, 0, 0, 0)"),
      view + " must leave today's cells/columns without a special background: " + backgrounds);
    await frame.locator(".dodo-calendar-preview").screenshot({path:`tmp/calendar-today-${view}.png`});
  }
  await changeView("listWeek", "日程");
  assert.equal(await frame.locator("#calendar [data-date]").count(), 0,
    "agenda view must replace the month/week/day grid");
  assert.ok(await frame.locator("#calendar [role=status]").count() > 0 ||
    await frame.locator("#calendar table").count() > 0,
    "agenda view must render a list or an empty-state announcement");
  await changeView("dayGridMonth", "月");
  assert.equal(await frame.locator(".dodo-calendar-view-picker").count(), 0,
    "the iframe must no longer create its own native select menu");
  console.log("PASS: SiYuan native menu month/week/day/agenda switching and calendar date highlights");
  assert.equal(await page.locator(".dodo-av-visual-host").evaluate(el => el.isContentEditable), false,
    "calendar host must not inherit SiYuan's editable document");
  await selectRange();
    await frame.locator("#calendar-quick-details").click();
  const input = frame.locator("#calendar-create-name");
  await input.fill("中文日程");
  await input.evaluate(input => {
    input.dispatchEvent(new CompositionEvent("compositionstart", {bubbles:true}));
    const enter = new KeyboardEvent("keydown", {key:"Enter",bubbles:true,cancelable:true,isComposing:true});
    input.dispatchEvent(enter);
    if (enter.defaultPrevented) throw Error("IME candidate confirmation was blocked");
    input.dispatchEvent(new CompositionEvent("compositionend", {bubbles:true,data:input.value}));
  });
  await input.press("Enter");
  assert.equal(await page.evaluate(() => window.created), undefined, "candidate Enter must not save");
  assert.equal(await input.inputValue(), "中文日程");
  await page.evaluate(() => {
    window.originalFrame = document.querySelector("iframe");
    window.nativeHeader = document.querySelector(".av__header");
    window.nativeHeader.remove();
  });
  // Wait for the real MutationObserver -> animation-frame scan to finish.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.originalFrame === document.querySelector("iframe")), true,
    "temporary native header replacement must preserve the calendar and Chinese draft");
  assert.equal(await input.inputValue(), "中文日程");
  await page.evaluate(() => document.querySelector(".av__container").prepend(window.nativeHeader));
  await frame.locator("#calendar-create-save").click();
  await page.waitForFunction(() => window.created?.title === "中文日程");
  await frame.getByText("中文日程", {exact:true}).waitFor();
  console.log("PASS: Chinese composition + Enter commits no record; explicit create keeps both events visible");

  // SiYuan can remove injected siblings when it reconciles the editable DOM.
  await page.evaluate(() => document.querySelector(".dodo-av-visual-host").remove());
  await page.waitForFunction(() => document.querySelector("iframe")?.isConnected, null, {timeout:2000});
  await page.frameLocator("iframe").getByText("已有日程", {exact:true}).waitFor({timeout:3000});
  await frame.getByText("中文日程", {exact:true}).waitFor({timeout:3000});
  await selectRange(18);
  const quick = frame.locator("#calendar-quick-name");
  await quick.waitFor();
  // Drive Chromium's IME, so actual composition/input events update the input.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {text:"快速中文日程",selectionStart:6,selectionEnd:6});
  await quick.press("Enter");
  await cdp.send("Input.insertText", {text:"快速中文日程"});
  await quick.press("Enter");
  assert.equal(await quick.inputValue(), "快速中文日程");
  assert.equal(await frame.locator("#calendar-quick").isVisible(), true);
  assert.equal(await page.evaluate(() => window.created.title), "中文日程", "IME must not submit quick create");
  await quick.press("Control+Enter");
  await page.waitForFunction(() => window.created.title === "快速中文日程");
  await frame.getByText("快速中文日程", {exact:true}).waitFor();
  await cdp.detach();

  await page.evaluate(() => {
    document.querySelector(".av__header").dataset.currentViewId = "20261021123456-fffffff";
    manager.refresh();
  });
  await page.waitForFunction(() => !document.querySelector("iframe"), null, {timeout:2000});
  assert.equal(await page.locator(".av__scroll").evaluate(el => el.style.display), "");
  await page.evaluate(() => manager.stop());
  assert.deepEqual(errors, []);
  console.log("PASS: native editor removing the calendar host automatically remounts the calendar");
  console.log("PASS: Chromium IME quick create, Ctrl+Enter saves; real view switch restores native view");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
