import { databaseViewTestRuntime } from "./database-view-test-runtime.mjs";
import {createRequire} from "node:module";
import {createServer} from "node:http";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
const require=createRequire(import.meta.url);
const createViteRequire=createRequire(require.resolve("vite"));
const esbuild=createViteRequire("esbuild");
const service=readFileSync("src/lets-database-view/visual/visual-view-service.ts","utf8");
const start=service.indexOf("  private attach(av: HTMLElement");
const end=service.indexOf("  private getSearch(av: HTMLElement)",start);
if(start<0||end<0)throw Error("Native AV host methods not found");
const body=service.slice(start,end);
if(!body.includes('if(policy.outsideAv) av.after(host)') ||
   !body.includes('this.lifecycle.reconcile(av') ||
   !body.includes('current.native=native')){
  throw Error("Production iframe retention rules disappeared");
}

const source=[
await databaseViewTestRuntime(),
'const ACTIVE="dodo-av-visual--active";',
'const SETTINGS="dodo-av-view-settings";',
'const normalizePreviewHeight=v=>v||520;',
'const timelinePreviewHeight=v=>v||520;',
'class HostProbe {',
'  lifecycle=new ViewMountLifecycle(entry=>entry.frame,(av,entry)=>this.cleanupMount(av,entry));',
'  mounted=this.lifecycle.entries;cached=new Map();refreshing=new Map();',
'  scheduled=0;rendered=0;',
'  getSearch(){return "";}',
'  scheduleFrame(){this.scheduled++;}',
'  renderGantt(){this.rendered++;}',
'  renderers={gantt:av=>this.renderGantt(av),calendar:()=>{},chart:()=>{},timeline:()=>{}};',
'  openSettings(){}',
body,
'}',
'window.HostProbe=HostProbe;',
].join("\n");
const output=(await esbuild.transform(source,{loader:"ts",target:"es2020",format:"iife"})).code;
const tmp=mkdtempSync(join(tmpdir(),"dodo-frappe-host-"));
let server;
try {
  const markup=[
    '<!doctype html><meta charset="utf-8">',
    '<div id="root"><div class="av" data-node-id="20261020101010-aaaaaaa" ',
    ' data-av-id="20261020101010-bbbbbbb">',
    '<div class="av__container"><div class="av__header"></div>',
    '<div class="av__scroll" style="height:120px"></div></div></div></div>',
    '<pre id="result">WAITING</pre>',
    '<script src="/host-probe.js"></script>',
  ].join("");
  writeFileSync(join(tmp,"host.html"),markup);
  writeFileSync(join(tmp,"host-probe.js"),output);
  server=createServer((request,response)=>{
    const path=(request.url||"").split("?")[0];
    let filename;
    if(path==="/host.html")filename=join(tmp,"host.html");
    else if(path==="/host-probe.js")filename=join(tmp,"host-probe.js");
    else if(path.startsWith("/plugins/siyuan-dodo/preview/gantt/")){
      const base=path.split("/").at(-1);
      if(!/^[a-zA-Z0-9._-]+$/.test(base)){
        response.writeHead(404);response.end();return;
      }
      filename=resolve("src/lets-database-view/gantt/iframe",base);
    }else{response.writeHead(404);response.end();return;}
    try{
      const bytes=readFileSync(filename);
      response.writeHead(200,{"Content-Type":filename.endsWith(".js")?"text/javascript":
        filename.endsWith(".css")?"text/css":"text/html"});
      response.end(bytes);
    }catch(error){response.writeHead(404);response.end(String(error));}
  });
  await new Promise((res,rej)=>{server.once("error",rej);server.listen(0,"127.0.0.1",res);});
  const url="http://127.0.0.1:"+server.address().port+"/host.html";
  const result=await new Promise((resolve,reject)=>{
    const child=spawn("python",["scripts/test-frappe-host-stability.py",url],{windowsHide:true});
    let stdout="",stderr="";
    child.stdout.on("data",data=>stdout+=data.toString());
    child.stderr.on("data",data=>stderr+=data.toString());
    const timer=setTimeout(()=>child.kill(),50000);
    child.on("error",reject);
    child.on("close",code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
  if(result.code!==0||!result.stdout.includes("PASS:")){
    throw Error("Native iframe mount regression: "+result.stdout+" "+result.stderr);
  }
  console.log(result.stdout.trim());
} finally {
  if(server)server.close();
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
  catch(error){console.warn("Temporary file cleanup:",String(error));}
}
