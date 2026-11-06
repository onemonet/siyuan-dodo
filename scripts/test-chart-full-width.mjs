import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const css = await readFile("src/lets-database-view/database-view.css", "utf8");
const host = await readFile("src/lets-database-view/visual/visual-view-service.ts", "utf8");
const iframeJs = await readFile("src/lets-database-view/visual/chart-iframe.js", "utf8");
const iframeHtml = await readFile("src/lets-database-view/visual/chart-iframe.html", "utf8");
assert.match(css, /dodo-av-visual--active\.dodo-av-visual--chart/);
assert.match(css, /width:\s*100%\s*!important/);
assert.match(host, /classList\.toggle\("dodo-av-visual--chart", kind === "chart"\)/);
assert.match(host, /classList\.remove\(ACTIVE, "dodo-av-visual--chart"/);
assert.match(iframeJs, /new ResizeObserver\(\(\) => \{ if \(chart\) chart\.resize\(\); \}\)/);
assert.match(iframeHtml, /chart-iframe\.js\?v=20261019-open-color-soft/);

let chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
try { await access(chrome); } catch { chrome = ""; }
if (chrome) {
  const tmp = await mkdtemp(join(tmpdir(), "dodo-chart-width-"));
  const path = join(tmp, "test.html");
  const stylesheet = pathToFileURL(process.cwd() + "/src/lets-database-view/database-view.css").href;
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="' + stylesheet + '">',
    '<style>body{margin:0}.protyle-wysiwyg{width:1120px}.av__container{display:block}</style></head><body>',
    '<main class="protyle-wysiwyg">',
    '<section class="av dodo-av-visual--active dodo-av-visual--chart" style="width:460px">',
    '<div class="av__container" style="width:460px"><div class="av__scroll" style="display:none"></div>',
    '<div class="dodo-av-visual-host" style="width:460px">',
    '<iframe class="dodo-av-visual-frame" style="width:460px"></iframe></div></div></section>',
    '<section class="av native-table" style="width:460px"></section></main>',
    '<script>window.addEventListener("load",()=>{',
    'const nodes=[".dodo-av-visual--chart",".av__container",".dodo-av-visual-host",".dodo-av-visual-frame",".native-table"];',
    'document.body.dataset.widths=JSON.stringify(nodes.map(sel=>Math.round(document.querySelector(sel).getBoundingClientRect().width)));',
    '});</script></body></html>',
  ].join("\n");
  try {
    await writeFile(path, html);
    const dump = execFileSync(chrome, [
      "--headless=new", "--no-first-run", "--disable-gpu", "--disable-extensions",
      "--disable-background-networking", "--virtual-time-budget=1000",
      "--dump-dom", pathToFileURL(path).href,
    ], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
    const match = dump.match(/data-widths="([^"]+)"/);
    assert.ok(match, "Chrome should report computed layout widths");
    const actual = JSON.parse(match[1].replaceAll("&quot;", '"'));
    assert.deepEqual(actual, [1120,1120,1120,1120,460],
      "Chart fills editor, but native table remains unchanged");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
console.log("PASS: full-width chart AV host/iframe and ResizeObserver; native table unchanged");