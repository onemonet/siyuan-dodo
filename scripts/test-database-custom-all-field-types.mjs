import assert from "node:assert/strict";
import { build } from "esbuild";

const key = char => "20261104184100-" + char.repeat(7);
const viewID=key("v"),avID=key("a"),blockID=key("b"),recordID=key("r");
const columns = [
  ["p","block","主键"],
  ["t","text","文本"],
  ["n","number","数字"],
  ["s","select","单选"],
  ["m","mSelect","多选"],
  ["d","date","日期"],
  ["x","mAsset","资源"],
  ["c","checkbox","复选框"],
  ["u","url","链接"],
  ["e","email","邮箱"],
  ["h","phone","电话"],
  ["l","location","位置"],
  ["q","template","模板"],
  ["i","relation","关联"],
  ["o","rollup","汇总"],
  ["z","lineNumber","行号"],
  ["f","created","创建时间"],
  ["g","updated","更新时间"],
].map(([c,type,name])=>({id:key(c),type,name}));

const values = {
  p: {block:{id:key("j"),content:"测试主键"}},
  t: {text:{content:"说明"}},
  n: {number:{content:0,isNotEmpty:true,formattedContent:"0.00"}},
  s: {mSelect:[{content:"销售一部",color:"red"}]},
  m: {mSelect:[{content:"销售二部",color:"blue"},{content:"研发部",color:"green"}]},
  d: {date:{content:1735689600000,content2:1735776000000,isNotEmpty:true,
    isNotEmpty2:true,hasEndDate:true,isNotTime:true,formattedContent:"2025-01-01 至 2025-01-02"}},
  x: {mAsset:[{content:"assets/cover.png",name:"封面",type:"image"},
    {content:"assets/paper.pdf",name:"报告",type:"file"}]},
  c: {checkbox:{checked:false}},
  u: {url:{content:"https://example.com"}},
  e: {email:{content:"team@example.com"}},
  h: {phone:{content:"+86 12345"}},
  l: {location:{name:"测试地点",latitude:31.2,longitude:121.5,originalInput:"31.2,121.5"}},
  q: {template:{content:"自动模板结果"}},
  i: {relation:{blockIDs:[key("k"),key("w")],contents:[
    {type:"block",block:{id:key("k"),content:"关联文档 A"}},
    {type:"block",block:{id:key("w"),content:"关联文档 B"}},
  ]}},
  o: {rollup:{contents:[
    {type:"number",number:{content:16,isNotEmpty:true}},
    {type:"text",text:{content:"汇总备注"}},
    {type:"select",mSelect:[{content:"已完成"}]},
  ]}},
  z: {lineNumber:{content:0}},
  f: {created:{content:1735689600000,formattedContent:"2025-01-01"}},
  g: {updated:{content:"2025-01-02 12:30:00"}},
};

const raw = {
  name:"全部字段测试",viewID,view:{columns,rowCount:1,rows:[{
    id:recordID,cells:columns.map(field=>({
      value:{keyID:field.id,type:field.type,...values[field.id.slice(-1)]},
    })),
  }]},
};

await build({entryPoints:["src/lets-database-view/custom/data-service.ts"],
  outfile:"tmp/custom-view-test/all-field-types.mjs",format:"esm",bundle:true,
  platform:"node",logLevel:"silent",
  plugins:[{name:"fake-native-open",setup(builder){
    builder.onResolve({filter:/^\.\.\/map\/open-map-item$/},args=>
      ({path:args.path,namespace:"test-stub"}));
    builder.onLoad({filter:/.*/,namespace:"test-stub"},()=>({
      contents:"export async function openMapItem() {}",loader:"js"}));
  }}]});
const api = await import("../tmp/custom-view-test/all-field-types.mjs");
globalThis.fetch = async(url,options) =>
  new Response(JSON.stringify({code:0,data:raw}),{status:200});
const context={avID,blockId:blockID,viewId:viewID,search:""};
const schema=await api.getCustomSchema(context);
assert.equal(schema.fields.length,18,"17 kinds plus block primary");
const page=await api.listCustomRecords(context,{page:1,pageSize:50});
const record=page.records[0];
const at=c=>record.values[key(c)], display=c=>record.displayValues[key(c)],
  detail=c=>record.valueDetails[key(c)];
assert.equal(at("p"),"测试主键");
assert.equal(record.blockId,key("j"));
assert.equal(at("t"),"说明");
assert.equal(at("n"),0);
assert.equal(display("n"),"0.00");
assert.equal(at("s"),"销售一部");
assert.equal(detail("s").color,"red");
assert.deepEqual(at("m"),["销售二部","研发部"]);
assert.equal(detail("m")[1].color,"green");
assert.deepEqual(at("d"),{start:1735689600000,end:1735776000000,allDay:true});
assert.equal(display("d"),"2025-01-01 至 2025-01-02");
assert.equal(at("x")[0].path,"assets/cover.png");
assert.equal(at("x")[1].name,"报告");
assert.equal(at("c"),false);
assert.equal(at("u"),"https://example.com");
assert.equal(at("e"),"team@example.com");
assert.equal(at("h"),"+86 12345");
assert.deepEqual(at("l"),{name:"测试地点",latitude:31.2,
  longitude:121.5,originalInput:"31.2,121.5"});
assert.equal(display("l"),"测试地点");
assert.equal(at("q"),"自动模板结果");
assert.deepEqual(at("i"),[key("k"),key("w")]);
assert.equal(detail("i").contents[0].value,"关联文档 A");
assert.equal(display("i"),"关联文档 A, 关联文档 B");
assert.deepEqual(at("o"),[16,"汇总备注","已完成"]);
assert.equal(detail("o")[0].type,"number");
assert.equal(at("z"),0,"Line number 0 must not be lost");
assert.equal(at("f"),1735689600000,"Native created timestamp must preserve type");
assert.equal(display("f"),"2025-01-01");
assert.equal(at("g"),"2025-01-02 12:30:00");

// Empty/null shape of each type; do not leak null display labels or undefined.
for (const field of columns) {
  if(field.type==="block") continue;
  raw.view.rows[0].cells.find(c=>c.value.keyID===field.id).value =
    {keyID:field.id,type:field.type};
}
const empty=(await api.listCustomRecords(context)).records[0];
for(const field of columns.slice(1)){
  assert(Object.hasOwn(empty.values,field.id),field.type+" must not disappear");
  assert.equal(typeof empty.displayValues[field.id],"string");
}
assert.equal(empty.values[key("n")],null);
assert.equal(empty.values[key("s")],"");
assert.deepEqual(empty.values[key("m")],[]);
assert.equal(empty.values[key("d")],null);
assert.deepEqual(empty.values[key("x")],[]);
assert.equal(empty.values[key("c")],false);
assert.equal(empty.values[key("l")],null);
assert.deepEqual(empty.values[key("i")],[]);
assert.deepEqual(empty.values[key("o")],[]);
assert.equal(empty.values[key("z")],null);
assert.equal(empty.values[key("f")],null);
assert.equal(empty.values[key("g")],null);

console.log("PASS: all 17 SiYuan AV field kinds + block, typed displayValues/valueDetails, empty cells");
