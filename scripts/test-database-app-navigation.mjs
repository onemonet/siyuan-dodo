import assert from "node:assert/strict";
import { build } from "esbuild";

await build({
  entryPoints:["src/lets-database-view/custom/app-reference-navigation.ts"],
  outfile:"tmp/test-dodo-app-navigation.mjs",
  bundle:true,format:"esm",platform:"node",logLevel:"silent",
  plugins:[{name:"navigation-mocks",setup(builder){
    builder.onResolve({filter:/^(siyuan|\.\.\/\.\.\/utils|\.\.\/\.\.\/shared\/av\/kernel-api)$/},
      args=>({path:args.path,namespace:"stub"}));
    builder.onLoad({filter:/.*/,namespace:"stub"},args=>{
      if(args.path==="siyuan")return {loader:"js",contents:
        "export async function openTab(data){globalThis.__tabs.push(data)}"};
      if(args.path==="../../utils")return {loader:"js",contents:
        "export const plugin={app:{name:'SiYuan-Test'}}"};
      return {loader:"js",contents:
        "export async function postJson(url,params){globalThis.__requests.push({url,params});if(url===\"/api/query/sql\"){globalThis.__sql.push(params.stmt);return globalThis.__blockRows;}if(url===\"/api/block/getBlockDOM\")return {dom:params.id===globalThis.__b1?\"<div data-av-id=\\\"20261104182000-ccccccc\\\"></div>\":\"\"};if(url===\"/api/av/getAttributeView\")return {av:{name:\"美食菜谱\",views:[{id:globalThis.__b1,name:\"AI 看板\",icon:\"dodo-lucide-custom-html.svg\"}]}};throw new Error(\"Unexpected API \"+url)}"};
    });
  }}],
});
const api = await import("../tmp/test-dodo-app-navigation.mjs");
const b1="20261104182000-aaaaaaa",b2="20261104182000-bbbbbbb";
const app1="app-11111111-2222-3333-4444-555555555555";
globalThis.__tabs=[];
globalThis.__requests=[];
globalThis.__b1=b1;
globalThis.__sql=[];
globalThis.__blockRows=[
  {id:b1,content:"影视收藏",hpath:"/个人/电影"},
  {id:b2,content:"<div>Non-display markup</div>",hpath:"/工作/项目"},
];
const refs={byApp:{[app1]:[
  {blockId:b1,viewId:b1,mode:"custom"},
  {blockId:b2,viewId:b1,mode:"table"},
  {blockId:"bad');DELETE FROM blocks;--",viewId:b1,mode:"custom"},
]}};
const labels=await api.loadAppReferenceLabels(refs);
assert.equal(labels[b1].title,"美食菜谱");
assert.equal(labels[b1].viewNames[b1],"AI 看板");
assert.equal(labels[b1].viewIcons[b1],"dodo-lucide-custom-html.svg");
assert.equal(labels[b1].path,"/个人/电影");
assert.deepEqual(api.nativeViewIcon(labels[b1].viewIcons[b1]),{
  kind:"asset",value:"/emojis/dodo-lucide-custom-html.svg",
});
assert.deepEqual(api.nativeViewIcon("1f5fa-fe0f"),{kind:"emoji",value:"🗺️"});
assert.deepEqual(api.nativeViewIcon("1f4bb"),{kind:"emoji",value:"💻"});
assert.deepEqual(api.nativeViewIcon(""),{kind:"symbol",value:"iconDatabase"});
for(const input of ["javascript:alert(1)","https://untrusted.test/icon.svg",
  "../outside.svg","/emojis/../../outside.svg","110000","d800"]) {
  assert.deepEqual(api.nativeViewIcon(input),{kind:"symbol",value:"iconDatabase"},
    "Untrusted or invalid native icons must use a safe fallback");
}
assert.equal(labels[b2].title,"未命名数据库");
assert.equal(globalThis.__sql.length,1);
assert(globalThis.__requests.some(x=>x.url==="/api/av/getAttributeView"));
assert.match(globalThis.__sql[0],/FROM blocks WHERE id IN/);
assert(!globalThis.__sql[0].includes("DELETE FROM blocks"));
await api.openAppDatabaseBlock(refs.byApp[app1][0]);
assert.deepEqual(globalThis.__tabs[0],{
  app:{name:"SiYuan-Test"},doc:{id:b1},openNewTab:true,
});
await assert.rejects(
  ()=>api.openAppDatabaseBlock({blockId:"../invalid",viewId:b1,mode:"custom"}),
  /数据库块 ID 无效/);
assert.equal(globalThis.__tabs.length,1);
console.log("PASS: native AV view names/icons, safe emoji/custom assets/fallback, filtered SQL IDs and exact openTab");
