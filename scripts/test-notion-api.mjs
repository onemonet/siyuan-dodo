import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(resolve("src/lets-notion-share/notion-markdown-client.ts"), "utf8");
const planSource = await readFile(resolve("src/lets-notion-share/incremental-plan.ts"), "utf8");
const planCompiled = ts.transpileModule(planSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const planOutput = resolve("scripts/.notion-plan-test.cjs");
await writeFile(planOutput, planCompiled);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/require\("\.\/incremental-plan"\)/g, `require("./.notion-plan-test.cjs")`);
const testModule = resolve("scripts/.notion-api-test.cjs");
await writeFile(testModule, compiled);
try {
  const { publishMarkdownZip } = createRequire(import.meta.url)(testModule);
  const dbId = "4001f428-4fb4-835f-8b15-811f3b2fee9d";
  const dsId = "0851f428-4fb4-83a6-84a0-07f0457616c2";
  const pageId = "11111111-2222-3333-4444-555555555555";
  const fileId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const placeholderId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const marker = "DODO_ASSET_MARKER_1_1Z_END";
  const url = `https://www.notion.so/${pageId.replaceAll("-", "")}`;
  const asset = { marker, path: "assets/a.png", name: "a.png", mime: "image/png", kind: "image", blob: new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" }) };
  const originalFetch = globalThis.fetch;
  const calls = [];
  let pagePresent = false;
  let pageEdited = "2026-10-16T09:00:00.000Z";
  let injectConflictingEditedTime = false;
  try {
    globalThis.fetch = async (rawUrl, init = {}) => {
      const loc = new URL(rawUrl);
      const path = loc.pathname;
      const method = init.method || "GET";
      const body = init.body instanceof FormData ? "FORM" : init.body ? JSON.parse(init.body) : undefined;
      calls.push({ path, method, body });
      let data;
      if (method === "GET" && path === `/v1/databases/${dbId}`) data = { data_sources: [{ id: dsId, name: "Feed" }] };
      else if (method === "GET" && path === `/v1/data_sources/${dsId}`) data = { properties: { "title": { type: "title" }, tags: { type: "multi_select" } } };
      else if (method === "POST" && path === "/v1/file_uploads") {
        assert.equal(body.mode, "single_part");
        data = { id: fileId };
      } else if (method === "POST" && path === `/v1/file_uploads/${fileId}/send`) {
        assert.equal(body, "FORM");
        data = { status: "uploaded", id: fileId };
      } else if (method === "POST" && path === "/v1/pages") {
        assert.equal(body.parent.type, "data_source_id");
        assert.equal(body.parent.data_source_id, dsId);
        assert.equal(body.markdown.includes(marker), true);
        pagePresent = true;
        data = { id: pageId, url };
      } else if (method === "GET" && path === `/v1/pages/${pageId}`) {
        data = { id: pageId, url, last_edited_time: injectConflictingEditedTime ? "2026-10-16T12:00:00.000Z" : pageEdited,
          parent: { type: "data_source_id", data_source_id: dsId } };
      } else if (method === "GET" && path === `/v1/blocks/${pageId}/children`) {
        data = { has_more: false, results: [{ id: placeholderId, type: "paragraph", paragraph: { rich_text: [{ plain_text: marker }] } }] };
      } else if (method === "PATCH" && path === `/v1/blocks/${pageId}/children`) {
        assert.deepEqual(body.position, { type: "after_block", after_block: { id: placeholderId } });
        assert.equal(body.children[0].image.file_upload.id, fileId);
        data = { results: [{ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }] };
      } else if (method === "DELETE" && path === `/v1/blocks/${placeholderId}`) data = {};
      else if (method === "PATCH" && path === `/v1/pages/${pageId}/markdown`) {
        assert.equal(body.type, "replace_content");
        assert.equal(body.replace_content.new_str.includes(marker), true);
        data = { object: "page_markdown", markdown: body.replace_content.new_str };
      } else if (method === "PATCH" && path === `/v1/pages/${pageId}`) data = { id: pageId };
      else throw new Error(`Unexpected Notion API request ${method} ${path}`);
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const exportZip = { markdown: `# Hello\n\n${marker}\n\nEnd`, assets: [asset] };
    let createdUrl = "";
    const created = await publishMarkdownZip({ token: "test-token", databaseId: dbId, title: "Hello", exportZip,
      existingPageUrl: "", expectedEditedTime: "", allowOverwrite: false,
      onCreated: async value => { createdUrl = value; } });
    assert.equal(created.url, url);
    assert.equal(createdUrl, url);
    assert.ok(calls.some(x => x.method === "PATCH" && x.path === `/v1/blocks/${pageId}/children`));
    assert.ok(calls.some(x => x.method === "DELETE" && x.path === `/v1/blocks/${placeholderId}`));
    assert.ok(!calls.some(x => x.method === "PATCH" && x.path.endsWith("/markdown")));
    console.log("PASS: Notion create markdown in database, upload local image, insert at placeholder, delete placeholder, store backlink");

    calls.length = 0;
    const updated = await publishMarkdownZip({ token: "test-token", databaseId: dbId, title: "Updated", exportZip,
      existingPageUrl: url, expectedEditedTime: pageEdited, allowOverwrite: false, forceFull: true });
    assert.equal(updated.url, url);
    assert.ok(calls.some(x => x.method === "PATCH" && x.path.endsWith("/markdown")));
    assert.ok(!calls.some(x => x.method === "POST" && x.path === "/v1/pages"));
    console.log("PASS: existing page reuses page ID and replaces markdown without duplicate page");

    calls.length = 0;
    injectConflictingEditedTime = true;
    await assert.rejects(publishMarkdownZip({ token: "test-token", databaseId: dbId, title: "Updated", exportZip,
      existingPageUrl: url, expectedEditedTime: pageEdited, allowOverwrite: false }), /需要先确认覆盖/);
    assert.equal(calls.some(x => x.method !== "GET"), false);
    console.log("PASS: manually edited Notion page is not mutated without confirmed override");
  } finally { globalThis.fetch = originalFetch; }
} finally { await rm(testModule, { force: true }); await rm(planOutput, { force: true }); }
