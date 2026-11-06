import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function load(entry) {
  const bundled = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node" });
  const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
  return import("data:text/javascript;base64," + source);
}

const { browserEditorUrl } = await load("src/lets-excalidraw/browser-editor-url.ts");
const config = {
  lang: "zh-CN", dodoBuild: "test", enableAutoSave: true,
  autoSaveInterval: 0, fullSaveDelay: 5,
};
const url = new URL(browserEditorUrl(
  "assets/excalidraw-image-test.svg", "siyuan-dodo",
  "http://192.168.1.23:4177/standalone/", config,
));
assert.equal(url.origin, "http://192.168.1.23:6806");
assert.equal(url.pathname, "/plugins/siyuan-dodo/excalidraw/app/");
assert.equal(url.searchParams.get("imageURL"), "assets/excalidraw-image-test.svg");
assert.equal(url.searchParams.get("enableAutoSave"), "true");
assert.equal(url.searchParams.get("lang"), "zh-CN");
assert.doesNotMatch(url.href, /4177|standalone/);
const desktop = new URL(browserEditorUrl("assets/test.png", "siyuan-dodo", "file:///C:/SiYuan/index.html"));
assert.equal(desktop.origin, "http://127.0.0.1:6806");
for (const path of ["../assets/o.svg", "assets/../o.svg", "assets/evil.svg?abc", "assets/a.png#fragment", "https://other/a.svg", "assets/x.html", "assets/x\\y.svg"]) {
  assert.throws(() => browserEditorUrl(path, "siyuan-dodo", "http://127.0.0.1:6806/"), /无效/);
}

const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, value); },
};
globalThis.location = { pathname: "/plugins/siyuan-dodo/excalidraw/app/" };
let configReads = 0;
globalThis.fetch = async (path, options) => {
  assert.equal(path, "/api/file/getFile");
  assert.equal(JSON.parse(options.body).path, "/data/storage/petal/siyuan-dodo/dodo-config");
  configReads++;
  return Response.json({ excalidraw: { toolbarMode: "fixed", toolbarEnabled: false } });
};
const { BrowserPreferenceClient } = await load("src/lets-excalidraw/app/toolbar/browser-preference-client.ts");
let changed;
const client = new BrowserPreferenceClient(value => { changed = value; });
const first = await client.request();
assert.equal(first.toolbarMode, "fixed", "direct-browser editor should inherit SiYuan plugin preferences");
assert.equal(first.toolbarEnabled, false);
assert.equal(configReads, 1);
const next = await client.request({ toolbarEnabled: true, enabled: false });
assert.equal(next.toolbarEnabled, true);
assert.equal(next.enabled, undefined, "browser patch must not smuggle module enablement");
assert.equal(changed.toolbarEnabled, true);
assert.equal(configReads, 1);
const storedKey = [...store.keys()].find(key => key.startsWith("dodo-excalidraw-browser:"));
assert.ok(storedKey, "browser overrides must remain local");
assert.equal(JSON.parse(store.get(storedKey)).toolbarEnabled, true);
const second = new BrowserPreferenceClient(() => {});
assert.equal((await second.request()).toolbarEnabled, true, "browser overrides should survive reload");
assert.equal(configReads, 2);
assert.equal(readFileSync("vite.excalidraw.config.ts", "utf8").includes("standalone:"), false, "standalone entry must be removed");
assert.equal(readFileSync("src/lets-excalidraw/plugin.ts", "utf8").includes("enableLanCanvas"), false);
assert.equal(readFileSync("vite.config.ts", "utf8").includes("excalidraw-lan-server"), false);
console.log("PASS: 6806 browser URLs, route guard, direct toolbar preferences, retired 4177 service");
