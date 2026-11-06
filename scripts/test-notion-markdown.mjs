import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { rm, readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const out = resolve("scripts/.notion-md-test.cjs");
const source = await readFile(resolve("src/lets-notion-share/markdown-zip.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
await writeFile(out, js);
try {
  const { extractAssetRefs, exportDocumentMarkdownZip } = require(out);
  const input = "# Exported\n\nNormal ![Pic](assets/photo.png) word\n\n![second](assets/photo.png)\n\n[report](assets/report.pdf)\n\n```md\n![literal](assets/nonexistent.png)\n```\n";
  const result = extractAssetRefs(input);
  assert.equal(result.refs.length, 3);
  assert.equal(result.refs[0].path, "assets/photo.png");
  assert.equal(result.refs[2].kind, "file");
  assert.match(result.markdown, /DODO_ASSET_MARKER_1_/);
  assert.match(result.markdown, /!\[literal\]\(assets\/nonexistent\.png\)/);
  const zip = new JSZip();
  zip.file("Article.md", input);
  zip.file("assets/photo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  zip.file("assets/report.pdf", Buffer.from("%PDF-1.5"));
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const previousFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      if (url === "/api/export/exportMd") {
        assert.equal(options.method, "POST");
        const args = JSON.parse(options.body);
        assert.equal(args.includeSubDocs, false);
        return new Response(JSON.stringify({ code: 0, data: { zip: "/export/test.zip" } }), { status: 200 });
      }
      if (url === "/export/test.zip") return new Response(bytes, { status: 200 });
      throw Error(`Unexpected request ${url}`);
    };
    const packed = await exportDocumentMarkdownZip("20261016214257-qcrf82n");
    assert.equal(calls, 2);
    assert.equal(packed.assets.length, 3);
    assert.equal(packed.assets[0].mime, "image/png");
    assert.equal(packed.assets[0].blob.size, 4);
    assert.match(packed.markdown, /Normal/);
    zip.remove("assets/photo.png");
    const missing = await zip.generateAsync({ type: "nodebuffer" });
    globalThis.fetch = async url => url === "/api/export/exportMd"
      ? new Response(JSON.stringify({ code: 0, data: { zip: "/export/test.zip" } }))
      : new Response(missing);
    await assert.rejects(exportDocumentMarkdownZip("20261016214257-qcrf82n"), /缺少正文引用的附件/);
    console.log("PASS: SiYuan Markdown ZIP images, attachments, code fences, missing-asset fail-safe");
  } finally { globalThis.fetch = previousFetch; }
} finally { await rm(out, { force: true }); }
