import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const memory=new Map();
const created=[];
class FakeTimeline {
  constructor(target,data,options){
    this.target=target;
    this.config=data;
    this.options=options;
    this.handlers=new Map();
    this.current_id=options.start_at_slide
      ? (data.events[options.start_at_slide-(data.title?1:0)]?.unique_id || "")
      : "title";
    created.push(this);
  }
  on(name,handler){this.handlers.set(name,handler);}
  goTo(id){this.current_id=id;this.handlers.get("change")?.({unique_id:id});}
  destroy(){this.destroyed=true;}
}
globalThis.window={
  TL:{Timeline:FakeTimeline},
  sessionStorage:{getItem:key=>memory.get(key) || null,setItem:(key,value)=>memory.set(key,value)},
  setTimeout:()=>0, dispatchEvent:()=>{},
};
const bundle=await build({entryPoints:["src/lets-custom-block/timeline/services/timeline-renderer.ts"],
  bundle:true,write:false,platform:"node",format:"esm",logLevel:"silent"});
const {TimelineRendererService}=await import("data:text/javascript;base64,"+
  Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const config={startPosition:"first"};
const data={title:{text:{headline:"时间线"}},
  events:["e-1","e-2","e-3"].map(unique_id=>({unique_id,start_date:{year:2026,month:10,day:10},
    text:{headline:unique_id}}))};
const container={id:"timeline",innerHTML:""};
const key="dodo-timeline-active:20261105000000-aaaaaaa:20261105000000-bbbbbbb";
const renderer=new TimelineRendererService();
renderer.render(container,data,config,{storageKey:key});
assert.equal(created[0].options.start_at_slide,undefined,"initial load respects user startPosition");
created[0].goTo("e-2");
assert.equal(memory.get(key),"e-2","TimelineJS change remembers selected record");
renderer.render(container,data,config,{storageKey:key,isDarkMode:true});
assert.equal(created[1].options.start_at_slide,2,
  "theme rerender must start on the second event, not the title");
assert.equal(created[1].options.default_bg_color,"#212529");
assert.equal(created[0].destroyed,true);
created[1].current_id="e-3";
renderer.rememberCurrentEvent();
assert.equal(memory.get(key),"e-3","record click saves latest active event before navigation");
const reopened=new TimelineRendererService();
reopened.render(container,data,config,{storageKey:key});
assert.equal(created[2].options.start_at_slide,3,
  "new iframe instance must restore its previously selected event");
created[2].current_id="title";
reopened.rememberCurrentEvent();
assert.equal(memory.get(key),"e-3","title slide must never overwrite saved event");
// Data edits may remove an event. Missing stored IDs must not point to the wrong slide.
reopened.render(container,{...data,events:[data.events[0]]},config,{storageKey:key});
assert.equal(created[3].options.start_at_slide,undefined);
assert.equal(created[3].options.start_at_end,false);
assert.equal(created[3].options.default_bg_color,"#ffffff");
assert.equal(memory.get(key),"e-3","old event stays cached for a later refresh");
// Each native database view keeps its own selection.
reopened.render(container,data,config,{storageKey:key+":other-view"});
assert.equal(created[4].options.start_at_slide,undefined);
console.log("PASS: slide remains selected after record navigation, theme refresh, iframe re-creation; missing events and other views are safe");

const policies=await readFile("src/lets-database-view/visual/visual-mount-policies.ts","utf8");
const css=await readFile("src/lets-database-view/database-view.css","utf8");
assert.match(policies,/timeline:\s*\{[\s\S]*?outsideAv: true,/);
assert.match(css,/\.av\.dodo-av-visual--timeline \+ \.dodo-av-visual-host/);
const bridge=await readFile("src/lets-database-view/visual/timeline-interaction.ts","utf8");
assert.match(bridge,/openMapItem\(data, \{ position: "right" \}\)/);
const iframe=await readFile("src/lets-custom-block/timeline/iframe/main.ts","utf8");
assert.match(iframe,/renderer\.rememberCurrentEvent\(\)/);
assert.match(iframe,/storageKey: currentTimelineStateKey\(\)/);
console.log("PASS: timeline frame is a stable AV sibling; opening a record preserves source pane and current slide");
