import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import ts from "typescript";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
async function loadModule(sourceFile, output) {
  const source = await readFile(resolve(sourceFile), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText.replace(/require\("\.\/incremental-plan"\)/g, `require("./.notion-plan-test.cjs")`);
  await writeFile(resolve(output), js);
  return require(resolve(output));
}
const zipTemp = "scripts/.notion-media-zip.cjs";
const apiTemp = "scripts/.notion-media-api.cjs";
const planTemp = "scripts/.notion-plan-test.cjs";
const savedFetch = globalThis.fetch;
try {
  const { extractAssetRefs, exportDocumentMarkdownZip } = await loadModule("src/lets-notion-share/markdown-zip.ts", zipTemp);
  await loadModule("src/lets-notion-share/incremental-plan.ts", planTemp);
  const { publishMarkdownZip } = await loadModule("src/lets-notion-share/notion-markdown-client.ts", apiTemp);
  const md = [
    "# 排版元素", "![picture](assets/img.png)",
    '<iframe src="https://player.bilibili.com/player.html?bvid=BV1ov41187qM&amp;page=1" data-src="//ignored.example"></iframe>',
    "## 16 视频",
    '<video controls="controls" src="assets/sample.mp4" data-src="assets/WRONG.mp4" style="width: 640px;"></video>',
    "## 17 音频", '<audio controls="controls" src="assets/sample.wav" data-src="assets/WRONG.wav"></audio>',
    '<u>下划线</u> <kbd>Alt</kbd> <sup>上标</sup>',
    "```html", '<video src="assets/in-code.mp4"></video>', "```",
  ].join("\n");
  const parsed = extractAssetRefs(md);
  assert.deepEqual(parsed.refs.map(r => r.kind), ["image", "video", "audio"]);
  assert.deepEqual(parsed.refs.map(r => r.path), ["assets/img.png", "assets/sample.mp4", "assets/sample.wav"]);
  assert.equal(parsed.embeds.length, 1);
  assert.match(parsed.embeds[0].url, /bvid=BV1ov41187qM&page=1/);
  assert.match(parsed.markdown, /<span underline="true">下划线<\/span>/);
  assert.doesNotMatch(parsed.markdown, /<kbd>|data-src=/);
  assert.match(parsed.markdown, /in-code.mp4/);
  assert.deepEqual([...parsed.refs, ...parsed.embeds].map(x => x.marker).sort(), [1, 2, 3, 4].map(i => `DODO_ASSET_MARKER_${i}_${(i + 70).toString(36).toUpperCase()}_END`).sort());

  const zip = new JSZip();
  zip.file("排版元素.md", md);
  zip.file("assets/img.png", Uint8Array.of(0x89, 0x50));
  zip.file("assets/sample.mp4", Uint8Array.of(0, 0, 0, 0x20));
  zip.file("assets/sample.wav", Uint8Array.of(0x52, 0x49, 0x46, 0x46));
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  globalThis.fetch = async url => url === "/api/export/exportMd"
    ? new Response(JSON.stringify({ code: 0, data: { zip: "/export/media-test.zip" } }))
    : new Response(bytes);
  const packed = await exportDocumentMarkdownZip("20200825162036-4dx365o");
  assert.deepEqual(packed.assets.map(a => [a.kind, a.mime]), [
    ["image", "image/png"], ["video", "video/mp4"], ["audio", "audio/wav"],
  ]);
  assert.equal(packed.embeds?.length, 1);
  console.log("PASS: SiYuan ZIP video/audio HTML + iframe extraction, MIME, underline, fenced HTML safety");

  const dbId = "4001f428-4fb4-835f-8b15-811f3b2fee9d";
  const dsId = "0851f428-4fb4-83a6-84a0-07f0457616c2";
  const pageId = "11111111-2222-3333-4444-555555555555";
  const markers = [...packed.assets, ...(packed.embeds || [])].map(x => x.marker);
  const blockIds = markers.map((_, i) => `bbbbbbbb-bbbb-bbbb-bbbb-${String(i + 1).padStart(12, "0")}`);
  const inserted = [];
  let uploads = 0;
  let requests = 0;
  globalThis.fetch = async (uri, init = {}) => {
    requests++;
    const url = new URL(uri);
    const path = url.pathname;
    const method = init.method || "GET";
    const body = init.body instanceof FormData ? "FORM" : init.body ? JSON.parse(init.body) : undefined;
    let result;
    if (method === "GET" && path === `/v1/databases/${dbId}`) result = { data_sources: [{ id: dsId }] };
    else if (method === "GET" && path === `/v1/data_sources/${dsId}`) result = { properties: { title: { type: "title" } } };
    else if (method === "POST" && path === "/v1/file_uploads") {
      const id = `aaaaaaaa-aaaa-aaaa-aaaa-${String(++uploads).padStart(12, "0")}`;
      result = { id };
    } else if (method === "POST" && path.includes("/file_uploads/") && path.endsWith("/send")) result = { status: "uploaded" };
    else if (method === "POST" && path === "/v1/pages") {
      assert.equal(body.markdown, packed.markdown);
      result = { id: pageId, url: `https://www.notion.so/${pageId.replaceAll("-", "")}` };
    } else if (method === "GET" && path === `/v1/blocks/${pageId}/children`) {
      result = { has_more: false, results: markers.map((marker, i) => ({
        id: blockIds[i], type: "paragraph", paragraph: { rich_text: [{ plain_text: marker }] },
      })) };
    } else if (method === "PATCH" && path === `/v1/blocks/${pageId}/children`) {
      assert.equal(body.position.type, "after_block");
      const orderedMarkers = [packed.assets[0].marker, packed.embeds[0].marker, packed.assets[1].marker, packed.assets[2].marker];
      assert.equal(body.position.after_block.id, blockIds[markers.indexOf(orderedMarkers[inserted.length])]);
      inserted.push(body.children[0]);
      result = { results: [{ id: `cccccccc-cccc-cccc-cccc-${String(inserted.length).padStart(12, "0")}` }] };
    } else if (method === "DELETE" && blockIds.some(id => path === `/v1/blocks/${id}`)) result = {};
    else if (method === "GET" && path === `/v1/pages/${pageId}`) result = {
      id: pageId, url: `https://www.notion.so/${pageId.replaceAll("-", "")}`,
      last_edited_time: "2026-10-16T00:00:00.000Z", parent: { data_source_id: dsId },
    };
    else throw Error(`${method} ${path} unexpected`);
    return new Response(JSON.stringify(result), { status: 200 });
  };
  await publishMarkdownZip({ token: "mock", databaseId: dbId, title: "排版元素", exportZip: packed,
    existingPageUrl: "", expectedEditedTime: "", allowOverwrite: false });
  assert.deepEqual(inserted.map(b => b.type), ["image", "embed", "video", "audio"]);
  assert.equal(inserted[1].embed.url.includes("bilibili.com"), true);
  assert.equal(inserted[2].video.file_upload.type, undefined);
  assert.equal(uploads, 3);
  console.log(`PASS: Notion native image/embed/video/audio blocks inserted in original order (${requests} mocked requests)`);
} finally {
  globalThis.fetch = savedFetch;
  await Promise.all([rm(resolve(zipTemp), { force: true }), rm(resolve(apiTemp), { force: true }), rm(resolve(planTemp), { force: true })]);
}
