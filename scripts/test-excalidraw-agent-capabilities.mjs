import assert from "node:assert/strict";
import { build } from "esbuild";
const options=await build({entryPoints:["src/lets-excalidraw/agent-tools.ts"],bundle:true,
  platform:"node",format:"esm",write:true,outfile:"tmp/test-agent-capabilities-bundle.mjs",
  plugins:[{name:"raw-skill",setup(b){
    b.onResolve({filter:/SKILL\.md\?raw$/},args=>({path:args.path,namespace:"raw"}));
    b.onLoad({filter:/.*/,namespace:"raw"},()=>({contents:'export default "Agent guide";',loader:"js"}));
  }}]});
const {registerExcalidrawAgentCapabilities}=await import("../tmp/test-agent-capabilities-bundle.mjs");
const capabilities=new Map();
const fakeWindow=new EventTarget();
fakeWindow.setTimeout=setTimeout;
fakeWindow.clearTimeout=clearTimeout;
const liveWindow={postMessage(data,origin){
    const sent=JSON.parse(data);
    const response=sent.action==="screenshot"
      ?{canvasId:"canvas-123",dataURL:"data:image/png;base64,iVBORw0KGgo=",mimeType:"image/png",count:1,sizeBytes:8}
      :{canvasId:"canvas-123",updated:["node-1"],saved:true};
    const e=new Event("message");e.source=liveWindow;e.origin=origin;
    e.data=JSON.stringify({event:"agentCommandResult",requestId:sent.requestId,result:response});
    queueMicrotask(()=>fakeWindow.dispatchEvent(e));
  }};
globalThis.window=fakeWindow;globalThis.location={origin:"http://localhost"};
const plugin={addAgentCapability(value){assert(!capabilities.has(value.name));capabilities.set(value.name,value);}};
assert(registerExcalidrawAgentCapabilities(plugin,()=>({contentWindow:liveWindow})));
const names=[...capabilities.keys()];
assert.equal(names.length,15,names.join(","));
for(const name of ["screenshot","align","distribute","group","ungroup","duplicate","from_mermaid","add_image"]){
  const cap=capabilities.get("dodo-excalidraw.canvas."+name);
  assert(cap,name+" missing");
  assert(cap.inputSchema.required.includes("canvasId"),name+" should protect canvas");
  assert(cap.effects[name==="screenshot"?"localRead":"localWrite"],name+" effect incorrect");
}
const screenshot=await capabilities.get("dodo-excalidraw.canvas.screenshot").handler({canvasId:"canvas-123"});
assert.equal(screenshot.content[0].type,"image");
assert.equal(screenshot.content[0].mimeType,"image/png");
assert.equal(screenshot.content[0].data,"iVBORw0KGgo=");
assert(!JSON.stringify(screenshot.structuredContent).includes("dataURL"),"Image must not be duplicated in metadata");
const noId=await capabilities.get("dodo-excalidraw.canvas.align").handler({ids:["a","b"],alignment:"left"});
assert(noId.error?.includes("canvasId"));
const testWrite=await capabilities.get("dodo-excalidraw.canvas.align").handler({canvasId:"canvas-123",ids:["a","b"],alignment:"left"});
assert.equal(testWrite.structuredContent.saved,true);
assert(capabilities.get("dodo-excalidraw.read_me"));
console.log("PASS: 15 Agent capabilities registered, read/write effects, required canvasId, PNG image content, no duplicated base64");
