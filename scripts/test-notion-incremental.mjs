import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import ts from "typescript";

const require = createRequire(import.meta.url);
const paths = ["scripts/.notion-incremental-plan.cjs", "scripts/.notion-incremental-client.cjs"].map(path => resolve(path));
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
const code = file => ts.transpileModule(file, { compilerOptions: options }).outputText;
const planJs = code(await readFile(resolve("src/lets-notion-share/incremental-plan.ts"), "utf8"));
const clientJs = code(await readFile(resolve("src/lets-notion-share/notion-markdown-client.ts"), "utf8"))
  .replace(/require\("\.\/incremental-plan"\)/g, 'require("./.notion-incremental-plan.cjs")');
await writeFile(paths[0], planJs);
await writeFile(paths[1], clientJs);
const originalFetch = globalThis.fetch;
try {
  const { publishMarkdownZip } = require(paths[1]);
  const { planIncremental, safeTextEdit } = require(paths[0]);
  const db = "4001f428-4fb4-835f-8b15-811f3b2fee9d";
  const ds = "0851f428-4fb4-83a6-84a0-07f0457616c2";
  const page = "11111111-2222-3333-4444-555555555555";
  const pageUrl = `https://www.notion.so/${page.replaceAll("-", "")}`;
  const marker = "DODO_ASSET_MARKER_1_1Z_END";
  const mkZip = (text, bytes = [1, 2, 3]) => ({
    markdown: `# My article\n\n${text}\n\n${marker}\n`,
    assets: [{ marker, path: "assets/photo.png", name: "photo.png", mime: "image/png", kind: "image",
      blob: new Blob([Uint8Array.from(bytes)], { type: "image/png" }) }],
    embeds: [],
  });
  const calls = [];
  let uploadNum = 0;
  let insertNum = 0;
  let remoteText = "";
  let edited = "2026-10-17T00:00:00.000Z";
  let fileReusable = true;
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method || "GET";
    const body = init.body instanceof FormData ? "FORM" : init.body ? JSON.parse(init.body) : null;
    calls.push({ pathname, method, body });
    let obj;
    if (method === "GET" && pathname === `/v1/databases/${db}`) obj = { data_sources: [{ id: ds }] };
    else if (method === "GET" && pathname === `/v1/data_sources/${ds}`) obj = { properties: { title: { type: "title" } } };
    else if (method === "GET" && pathname === `/v1/pages/${page}`) obj = {
      id: page, url: pageUrl, last_edited_time: edited, parent: { data_source_id: ds },
    };
    else if (method === "GET" && pathname === `/v1/pages/${page}/markdown`) obj = { markdown: remoteText, truncated: false, unknown_block_ids: [] };
    else if (method === "PATCH" && pathname === `/v1/pages/${page}/markdown`) {
      if (body.type === "update_content") {
        for (const change of body.update_content.content_updates) {
          assert.equal(remoteText.split(change.old_str).length, 2);
          remoteText = remoteText.replace(change.old_str, change.new_str);
        }
      } else if (body.type === "replace_content") remoteText = body.replace_content.new_str;
      else throw Error("Unknown Markdown update");
      obj = { markdown: remoteText };
    } else if (method === "PATCH" && pathname === `/v1/pages/${page}`) obj = {};
    else if (method === "POST" && pathname === "/v1/pages") {
      remoteText = body.markdown;
      obj = { id: page, url: pageUrl };
    } else if (method === "POST" && pathname === "/v1/file_uploads") {
      uploadNum++;
      obj = { id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(uploadNum).padStart(12, "0")}` };
    } else if (method === "POST" && /^\/v1\/file_uploads\/[^/]+\/send$/.test(pathname)) obj = { status: "uploaded" };
    else if (method === "GET" && /^\/v1\/file_uploads\/[^/]+$/.test(pathname)) obj = { status: fileReusable ? "uploaded" : "expired", in_trash: false, expiry_time: null };
    else if (method === "GET" && pathname === `/v1/blocks/${page}/children`) obj = {
      has_more: false, results: [...remoteText.matchAll(/DODO_ASSET_MARKER_\d+_[A-Z0-9]+_END/g)].map((match, i) => ({
        id: `bbbbbbbb-bbbb-bbbb-bbbb-${String(i+1).padStart(12,"0")}`,
        type: "paragraph", paragraph: { rich_text: [{ plain_text: match[0] }] },
      })),
    };
    else if (method === "PATCH" && /^\/v1\/blocks\/.*\/children$/.test(pathname)) {
      insertNum++;
      assert.equal(body.position.type, "after_block");
      obj = { results: [{ id: `cccccccc-cccc-cccc-cccc-${String(insertNum).padStart(12, "0")}` }] };
    } else if (method === "DELETE" && /^\/v1\/blocks\//.test(pathname)) obj = {};
    else throw Error(`Mock unsupported ${method} ${pathname}`);
    return new Response(JSON.stringify(obj), { status: 200 });
  };
  const base = mkZip("Original paragraph.");
  const opts = { token: "test-only", databaseId: db, title: "Article", exportZip: base,
    existingPageUrl: "", expectedEditedTime: "", allowOverwrite: false };
  const initial = await publishMarkdownZip(opts);
  assert.equal(initial.mode, "full");
  assert.equal(initial.uploaded, 1);
  assert.equal(initial.manifest.assets.length, 1);
  assert.match(initial.manifest.assets[0].digest, /^[a-f0-9]{64}$/);
  assert.match(initial.manifest.assets[0].blockId, /^cccc/);
  console.log("PASS: initial share stores SHA-256, upload ID, block ID, complete Markdown baseline");

  calls.length = 0;
  const unchanged = await publishMarkdownZip({ ...opts, existingPageUrl: pageUrl,
    expectedEditedTime: edited, previousManifest: initial.manifest });
  assert.equal(unchanged.mode, "skipped");
  assert.equal(unchanged.uploaded, 0);
  assert.equal(calls.filter(c => c.method !== "GET").length, 0);
  console.log("PASS: identical article skips uploads, markdown writes and block writes");

  calls.length = 0;
  const textChanged = await publishMarkdownZip({ ...opts, exportZip: mkZip("Revised paragraph."),
    existingPageUrl: pageUrl, expectedEditedTime: edited, previousManifest: unchanged.manifest });
  assert.equal(textChanged.mode, "incremental");
  assert.equal(textChanged.uploaded, 0);
  assert.ok(calls.some(c => c.method === "PATCH" && c.pathname.endsWith("/markdown") && c.body.type === "update_content"));
  assert.ok(!calls.some(c => c.pathname === "/v1/file_uploads"));
  assert.ok(!calls.some(c => c.method === "PATCH" && c.pathname.includes("/blocks/")));
  assert.equal(textChanged.manifest.assets[0].blockId, initial.manifest.assets[0].blockId);
  console.log("PASS: single text edit uses Notion update_content; original media block ID preserved");

  calls.length = 0;
  const mediaChanged = await publishMarkdownZip({ ...opts, exportZip: mkZip("Revised paragraph.", [7, 7, 7]),
    existingPageUrl: pageUrl, expectedEditedTime: edited, previousManifest: textChanged.manifest });
  assert.equal(mediaChanged.mode, "incremental");
  assert.equal(mediaChanged.uploaded, 1);
  assert.equal(calls.filter(c => c.pathname === "/v1/file_uploads" && c.method === "POST").length, 1);
  assert.equal(calls.filter(c => c.method === "PATCH" && c.pathname.endsWith("/markdown")).length, 0);
  assert.notEqual(mediaChanged.manifest.assets[0].blockId, textChanged.manifest.assets[0].blockId);
  console.log("PASS: replacing one image uploads only that image and preserves all other content");

  const structurallyChanged = mkZip("Revised paragraph.", [7, 7, 7]);
  structurallyChanged.assets.push({ ...structurallyChanged.assets[0], marker: "DODO_ASSET_MARKER_2_20_END", path: "assets/other.png", name: "other.png" });
  structurallyChanged.markdown += "\nDODO_ASSET_MARKER_2_20_END\n";
  calls.length = 0;
  await assert.rejects(publishMarkdownZip({ ...opts, exportZip: structurallyChanged,
    existingPageUrl: pageUrl, expectedEditedTime: edited, previousManifest: mediaChanged.manifest }), /NEEDS_FULL_SYNC/);
  assert.equal(calls.filter(c => c.method !== "GET").length, 0);
  console.log("PASS: structural changes require explicit full rebuild; no silent destructive writes");

  calls.length = 0;
  const rebuild = await publishMarkdownZip({ ...opts, exportZip: structurallyChanged,
    existingPageUrl: pageUrl, expectedEditedTime: edited,
    previousManifest: mediaChanged.manifest, forceFull: true });
  assert.equal(rebuild.mode, "full");
  assert.equal(rebuild.uploaded, 0);
  assert.equal(rebuild.reused, 2);
  assert.equal(calls.filter(c => c.pathname === "/v1/file_uploads" && c.method === "POST").length, 0);
  assert.ok(calls.some(c => c.pathname === `/v1/file_uploads/${mediaChanged.manifest.assets[0].uploadId}` && c.method === "GET"));
  console.log("PASS: confirmed full rebuild reuses unchanged file by SHA-256 even when repeated at a new path");
  calls.length = 0;
  fileReusable = false;
  const expired = await publishMarkdownZip({ ...opts, exportZip: structurallyChanged,
    existingPageUrl: pageUrl, expectedEditedTime: edited, previousManifest: rebuild.manifest, forceFull: true });
  assert.equal(expired.mode, "full");
  assert.equal(expired.uploaded, 1);
  assert.equal(calls.filter(c => c.pathname === "/v1/file_uploads" && c.method === "POST").length, 1);
  console.log("PASS: expired Notion upload ID correctly triggers new upload, with in-run duplicate deduplication");

  assert.equal(safeTextEdit("# T\n\nOld sentence.\n", "# T\n\nNew sentence.\n")?.new_str, "New sentence.");
  assert.equal(safeTextEdit("# T\n\nOne\n", "# T\n\n- One\n"), null);
  console.log("PASS: structural text diffs safely excluded from targeted Markdown updates");
} finally {
  globalThis.fetch = originalFetch;
  await Promise.all(paths.map(path => rm(path, { force: true })));
}
