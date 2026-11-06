import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";

const archivePath = process.argv[2] || "package-marketplace.zip";
const zip = await JSZip.loadAsync(readFileSync(archivePath));
const files = Object.keys(zip.files);
const required = ["plugin.json", "README.md", "LICENSE", "index.js", "index.css", "icon.png", "preview.png"];
for (const file of required) {
  assert(zip.file(file), "Marketplace ZIP is missing " + file);
}

const json = JSON.parse(await zip.file("plugin.json").async("string"));
assert.equal(json.name, "siyuan-dodo");
assert.equal(json.url, "https://github.com/onemonet/siyuan-dodo");
assert.match(json.version, /^\d+\.\d+\.\d+$/);
if (process.env.GITHUB_REF?.startsWith("refs/tags/v")) {
  assert.equal(process.env.GITHUB_REF.slice("refs/tags/v".length), json.version,
    "Release tag and plugin.json version must match");
}
for (const prop of ["displayName", "description", "readme"]) {
  assert.equal(typeof json[prop]?.default, "string", prop + ".default must exist");
  for (const key of Object.keys(json[prop])) {
    assert(!key.includes("_"), prop + " contains legacy locale key: " + key);
  }
}
assert.deepEqual(json.frontends, ["desktop"]);
assert.equal(json.readme.default, "README.md");
assert(!json.description.default.includes("Excalidraw"), "Unpublished module in description");
assert(!json.keywords.some(word => word.toLowerCase() === "excalidraw"));

const icon = await zip.file(json.icon).async("nodebuffer");
const preview = await zip.file(json.preview).async("nodebuffer");
assert(icon.length <= 64 * 1024, "Marketplace icon exceeds 64 KiB");
assert(preview.length <= 512 * 1024, "Marketplace preview exceeds 512 KiB");
assert(files.some(file => file.startsWith("preview/gantt/")), "Missing required Gantt assets");

for (const name of files) {
  assert(!name.startsWith("excalidraw/"), "Unpublished Excalidraw asset: " + name);
  assert(!name.startsWith("skills/dodo-toolbox-excalidraw/"),
    "Unpublished Excalidraw skill: " + name);
}

const readme = await zip.file(json.readme.default).async("string");
const js = await zip.file("index.js").async("string");
for (const [module, label] of [
  ["home", "主页"],
  ["excalidraw", "Excalidraw"],
  ["notion-share", "分享到 Notion"],
]) {
  assert(!js.includes("./lets-" + module + "/index.ts"),
    "Unpublished module still registered: " + module);
  assert(!readme.includes("- **[" + label + "]("),
    "Unpublished module still listed as a feature: " + label);
}
for (const name of ["database-view", "file-manager"]) {
  assert(js.includes("./lets-" + name + "/index.ts"), "Required module missing: " + name);
}
assert(readme.includes("AI 辅助开发说明"), "Missing AI contribution disclosure");
assert(readme.includes("集市版暂不包含"), "Missing marketplace edition note");
assert(!/\]\((src\/|docs\/)/.test(readme), "README has broken relative source links");

console.log("Marketplace package verified: " + archivePath + ", " + files.length +
  " entries, version " + json.version);
