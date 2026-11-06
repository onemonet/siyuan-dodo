import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { transformWithEsbuild } from "vite";

const main = await readFile("src/lets-database-view/map/iframe/main.ts", "utf8");
const css = await readFile("src/lets-database-view/map/iframe/app.css", "utf8");
const html = await readFile("src/lets-database-view/map/iframe/index.html", "utf8");
assert.doesNotMatch(main, /if\s*\(\s*!?window\.confirm\(/, "Native browser confirmation call must be removed");
assert.match(main, /if \(!await mapDeleteDialog\.confirm\(point\.title\)\) return;/);
assert.ok(main.indexOf("mapDeleteDialog.confirm(point.title)") <
  main.indexOf('pendingMutationAction = "delete"'), "Cancel must not mutate the database");
assert.match(main, /void requestPointDeletion\(point\)/);
assert.match(main, /class MapDeleteDialog/);
assert.match(css, /\.map-delete-overlay\[hidden\] \{ display: none; \}/);
assert.match(css, /@media \(prefers-color-scheme: dark\)/);
assert.match(css, /\.map-delete-dialog-confirm/);
assert.match(html, /app\.css\?v=20261105-locate-existing/);
assert.match(html, /main\.js\?v=20261019-(?:delete-dialog|correction-overlay|unified-views)/);

const a = main.indexOf("class MapDeleteDialog {");
const b = main.indexOf("const mapDeleteDialog = new MapDeleteDialog();", a);
assert.ok(a >= 0 && b > a, "Find the reusable dialog component in the self-contained iframe");
const compiled = await transformWithEsbuild(main.slice(a, b), "map-delete-dialog.ts", {
  loader: "ts", format: "esm",
});
assert.doesNotMatch(compiled.code, /^(?:import|export)\s/m, "Iframe dialog must be self-contained");

const testCode = [
  'const assert = (value, message) => { if (!value) throw new Error(message); };',
  'async function run() {',
  ' const dialog = new MapDeleteDialog();',
  ' const title = \u0027<svg onload=alert(1)>\u0027;',
  ' const cancel = document.querySelector(".map-delete-dialog-cancel");',
  ' const deleteButton = document.querySelector(".map-delete-dialog-confirm");',
  ' const overlay = document.querySelector(".map-delete-overlay");',
  ' const name = document.querySelector(".map-delete-dialog-point");',
  ' const pending = dialog.confirm(title);',
  ' assert(overlay.hidden === false, "Must show custom dialog");',
  ' assert(name.textContent === title, "Display actual point title");',
  ' assert(!name.querySelector("svg"), "Never parse point title as HTML");',
  ' assert(document.activeElement === cancel, "Cancel gets initial focus");',
  ' assert(await dialog.confirm("Repeated") === false, "Reject duplicate dialog");',
  ' cancel.click();',
  ' assert(await pending === false && overlay.hidden, "Cancel closes without deleting");',
  ' const escapePending = dialog.confirm("Escape");',
  ' cancel.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape", bubbles:true}));',
  ' assert(await escapePending === false && overlay.hidden, "Escape cancels");',
  ' const overlayPending = dialog.confirm("Backdrop");',
  ' overlay.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));',
  ' assert(await overlayPending === false && overlay.hidden, "Backdrop cancels");',
  ' const confirmPending = dialog.confirm("Target point");',
  ' deleteButton.click();',
  ' assert(await confirmPending === true && overlay.hidden, "Explicit delete confirms");',
  ' assert(document.querySelectorAll(".map-delete-overlay").length === 1, "Reuse one dialog instance");',
  ' const dark=matchMedia("(prefers-color-scheme: dark)").matches;',
  ' const bg=getComputedStyle(document.querySelector(".map-delete-dialog")).backgroundColor;',
  ' assert(bg === (dark ? "rgb(33, 37, 41)" : "rgb(255, 255, 255)"), "Theme-aware dialog background");',
  ' document.body.dataset.testResult="PASS";',
  '}',
  'run().catch(error=>{document.body.dataset.testResult="FAIL"; document.body.dataset.testError=error.message;});',
].join("\n");
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let available = true;
try { await access(chrome); } catch { available = false; }
if (available) {
  const dir = await mkdtemp(join(tmpdir(), "dodo-map-delete-ui-"));
  const file = join(dir, "delete-test.html");
  try {
    await writeFile(file, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>' +
      css + '</style></head><body><button id="origin">Source</button><script>' +
      compiled.code + "\n" + testCode + '</script></body></html>');
    const dump = execFileSync(chrome, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
      "--disable-background-networking", "--virtual-time-budget=1800",
      "--dump-dom", pathToFileURL(file).href,
    ], { encoding: "utf8", timeout: 17000, stdio: ["ignore","pipe","ignore"] });
    assert.match(dump, /data-test-result="PASS"/,
      "Chrome dialog behavior failed: " + (dump.match(/data-test-error="([^"]+)/)?.[1] || "missing completion"));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
console.log("PASS: custom map deletion dialog cancel/escape/backdrop/confirm, focus, title safety and theme styles");