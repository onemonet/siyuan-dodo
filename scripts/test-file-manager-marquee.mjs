import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ts=createRequire(import.meta.url)("typescript");
const js=ts.transpileModule(
  readFileSync("src/lets-file-manager/selection-marquee.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}},
).outputText;
const marquee={};
vm.runInNewContext(js,{exports:marquee,Math,Set,Array});

const plain=a=>JSON.parse(JSON.stringify(a));
const drag=marquee.marqueeBounds({x:310,y:260},{x:120,y:90});
assert.deepEqual(plain(drag),{x:120,y:90,width:190,height:170},
  "upward/leftward drags use the same normalized marquee as rightward drags");
const forward=marquee.marqueeBounds({x:120,y:90},{x:310,y:260});
assert.deepEqual(plain(forward),plain(drag));
const cells=[
  {name:"a.jpg",x:115,y:85,width:70,height:80},
  {name:"b.png",x:188,y:100,width:80,height:80},
  {name:"c.webp",x:290,y:230,width:55,height:40},
  {name:"d.mp4",x:400,y:400,width:80,height:80},
];
const hit=cells.filter(cell=>marquee.intersectsMarquee(drag,cell)).map(x=>x.name);
assert.deepEqual(hit,["a.jpg","b.png","c.webp"]);
assert.equal(marquee.intersectsMarquee(drag,{x:500,y:300,width:20,height:20}),false);
assert.equal(marquee.intersectsMarquee(drag,{x:310,y:90,width:5,height:15}),false,
  "touching the rectangle edge alone must not select a file");
assert.deepEqual(plain(marquee.applyMarqueeChoice(["old.mp4"],hit,"replace")),hit,
  "ordinary drag replaces the selection");
assert.deepEqual(plain(marquee.applyMarqueeChoice(["old.mp4","a.jpg"],hit,"add")),
  ["old.mp4","a.jpg","b.png","c.webp"],"Shift adds, without duplicates");
assert.deepEqual(plain(marquee.applyMarqueeChoice(["old.mp4","a.jpg","d.mp4"],hit,"toggle")),
  ["old.mp4","d.mp4","b.png","c.webp"],"Ctrl toggles intersected files");
assert.deepEqual(plain(marquee.applyMarqueeChoice(["a.jpg"],[], "toggle")),["a.jpg"]);
assert.deepEqual(plain(marquee.applyMarqueeChoice([],[], "replace")),[]);
assert.deepEqual(plain(marquee.applyMarqueeChoice(["old.mp4"],["a.jpg"],"toggle")),["old.mp4","a.jpg"]);
const large=Array.from({length:500},(_,i)=>"asset_"+i+".png");
assert.equal(marquee.applyMarqueeChoice([],large,"replace").length,500);

const ui=readFileSync("src/lets-file-manager/FileManagerPage.svelte","utf8");
const css=readFileSync("src/lets-file-manager/file-manager.css","utf8");
assert.ok(ui.includes('on:pointerdown={beginMarqueeCandidate}'),"pointer-down captures selection start");
assert.ok(ui.includes('on:pointermove={moveMarqueePointer}'),"pointer motion updates selection");
assert.ok(ui.includes('on:pointerup={endMarqueePointer}'),"pointer release finalizes selection");
assert.ok(ui.includes('on:pointercancel={(event) => { if (marqueeCandidate?.pointerId === event.pointerId) cancelMarquee(true); }}'),
  "pointer cancel restores selection only for the captured pointer");
assert.ok(ui.includes('on:scroll={computeMarqueeSelection}'),"scroll refreshes visible marquee");
assert.ok(ui.includes('on:click|capture={suppressMarqueeClick}'),"a drag must not cause file click");
assert.ok(ui.includes('on:dragstart|preventDefault'),"native image drag is blocked");
assert.ok(ui.includes('on:dblclick={() => openPreview(item)}'),"existing doubleclick preview preserved");
assert.ok(ui.includes('on:click={(event) => handleFileClick(item, event)}'),
  "Ctrl and Shift click selection remains");
assert.ok((ui.match(/data-fm-file-name=\{item.name\}/g)||[]).length===2,
  "both gallery and list rows can be marquee-selected");
assert.ok(ui.includes('requestAnimationFrame(marqueeAutoScroll)'),"auto-scroll at pane edges");
assert.ok(ui.includes('compressionSources = chosen.map'),"marquee-selected images feed batch compression");
assert.ok(css.includes(".fm-root .fm-marquee-selection"),"visible theme-aware rectangle");
assert.ok(css.includes("pointer-events: none"),"rectangle never eats pointer events");
console.log("PASS: reversed rectangle geometry, hit testing, Ctrl toggle/Shift add, pointer lifecycle, grid/list markers, batch compression integration");
