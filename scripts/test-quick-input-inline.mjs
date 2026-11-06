import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { transformWithEsbuild } from "vite";

const source = await readFile("src/lets-quick-input/index.ts", "utf8");
const between = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, "Missing quick-input method: " + start);
  return source.slice(from, to);
};
const contextMethods = between("  private getTriggerContext():", "  private buildItems(");
const applyMethod = between("  private applyItem(", "  private normalizeSelectedIndex(");
const onKeyDown = between("  private onKeyDown(", "  private consumeKeyboardEvent(");
const harness = [
  'const TRIGGER = "@"; const MAX_QUERY_LENGTH = 80;',
  "class Harness {",
  "session = null; isComposing = false;",
  onKeyDown,
  contextMethods,
  applyMethod,
  "close() { this.session = null; }",
  "}",
  "this.Harness = Harness;",
].join("\n");
const built = (await transformWithEsbuild(harness, "quick-input-inline-test.ts", { loader: "ts" })).code;

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let hasChrome = true;
try { await access(chrome); } catch { hasChrome = false; }
assert.ok(hasChrome, "Chrome is needed for contenteditable DOM regression");

const dir = await mkdtemp(join(tmpdir(), "dodo-quick-input-inline-"));
try {
  const tests = [
    'const assert=(test,msg)=>{if(!test)throw Error(msg)};',
    'const cases=[',
    ' {html:"@明天再说",before:"@明天",query:"明天",expected:"2026-10-21再说"},',
    ' {html:"今天计划@明天继续写作",before:"今天计划@明天",query:"明天",expected:"今天计划2026-10-21继续写作"},',
    ' {html:"hello@明天 later",before:"hello@明天",query:"明天",expected:"hello2026-10-21 later"},',
    ' {html:"欢迎<span data-type=\\"text\\">使用</span>@明天继续",before:"欢迎使用@明天",query:"明天",expected:"欢迎使用2026-10-21继续",keepSpan:true},',
    ' {html:"前文@旧内容 现在@明天结束",before:"前文@旧内容 现在@明天",query:"明天",expected:"前文@旧内容 现在2026-10-21结束"},',
    '];',
    'function run(){',
    'for(const [i,c] of cases.entries()){',
    ' const host=document.createElement("div");host.className="protyle-wysiwyg";',
    ' const editor=document.createElement("div");editor.contentEditable="true";editor.innerHTML=c.html;host.append(editor);document.body.append(host);',
    ' const input=new Harness();const where=input.findTextPosition(editor,c.before.length);',
    ' assert(!!where,"Missing text position "+i);',
    ' const cursor=document.createRange();cursor.setStart(where.node,where.offset);cursor.collapse(true);',
    ' editor.focus();const selection=getSelection();selection.removeAllRanges();selection.addRange(cursor);',
    ' const ctx=input.getTriggerContext();',
    ' assert(ctx && ctx.query===c.query,"Inline @ not found at "+i);',
    ' assert(ctx.range.toString()==="@"+c.query,"Wrong replacement range at "+i+": "+ctx.range.toString());',
    ' input.session={editable:ctx.editable,range:ctx.range,query:ctx.query,items:[{id:"time",value:"2026-10-21"}],selectedIndex:0};',
    ' input.applyItem(0);',
    ' assert(editor.textContent===c.expected,"Wrong text after apply "+i+": "+editor.textContent);',
    ' if(c.keepSpan) assert(editor.querySelector("span")?.textContent==="使用","Inline formatting lost");',
    ' host.remove();',
    '}',
    'const guard=new Harness(); guard.session={items:[{id:"time",value:"hi"}],selectedIndex:0};',
    'for(const flags of [{key:"Enter",isComposing:false,keyCode:13,active:true},{key:"Enter",isComposing:true,keyCode:13},{key:"Enter",isComposing:false,keyCode:229}]){',
    ' guard.isComposing=!!flags.active;let handled=false;',
    ' guard.onKeyDown({...flags,preventDefault:()=>handled=true,stopPropagation:()=>{},stopImmediatePropagation:()=>{}});',
    ' assert(!handled && guard.session!==null,"IME confirmation key was intercepted");',
    '}',
    'document.body.dataset.result="PASS";',
    '}',
    'try{run()}catch(error){document.body.dataset.result="FAIL";document.body.dataset.error=error.message};',
  ].join("\n");
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    built + tests + '</script></body></html>';
  const file = join(dir, "index.html");
  await writeFile(file, html);
  const output = execFileSync(chrome, [
    "--headless=new", "--no-first-run", "--disable-gpu", "--disable-extensions",
    "--disable-background-networking", "--virtual-time-budget=1500",
    "--dump-dom", pathToFileURL(file).href,
  ], { encoding: "utf8", timeout: 18000, stdio: ["ignore", "pipe", "ignore"] });
  assert.match(output, /data-result="PASS"/,
    "Quick-input inline regression failed: " + (output.match(/data-error="([^"]+)/)?.[1] || "unknown"));
  console.log("PASS: mid-paragraph @ triggers and replaces only its query, including text spanning inline markup");
} finally {
  await rm(dir, { recursive: true, force: true });
}