import assert from "node:assert/strict";
import {build} from "esbuild";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const output = "tmp/unified-av-standard-test";
if (!process.argv.includes("--case")) {
  await build({
    entryPoints:{
      canonical:"src/shared/av/av-normalized.ts",
      flattened:"src/shared/av/av-data-adapter.ts",
      schedule:"src/lets-database-view/core/schedule-model.ts",
      sdk:"src/lets-database-view/custom/data-service.ts",
      timeline:"src/lets-custom-block/timeline/services/timeline-transformer.ts",
    },
    outdir:output,bundle:true,platform:"node",format:"esm",logLevel:"silent",
    outExtension:{".js":".mjs"},
    plugins:[{name:"mock-native-open",setup(bundle){
      bundle.onResolve({filter:/^\.\.\/map\/open-map-item$/},args=>({namespace:"mock",path:args.path}));
      bundle.onLoad({namespace:"mock",filter:/.*/},()=>({
        contents:'export async function openMapItem(){}',loader:"js",
      }));
    }}],
  });
  for(const tz of ["Asia/Shanghai","UTC","America/Los_Angeles","Asia/Seoul"]){
    const done=spawnSync(process.execPath,[process.argv[1],"--case"],{
      cwd:process.cwd(),encoding:"utf8",env:{...process.env,TZ:tz},
    });
    assert.equal(done.status,0,`${tz} failed: ${done.stdout} ${done.stderr}`);
    console.log(`PASS: ${tz} all AV views and SDK agree on native calendar dates, schema, item IDs`);
  }
  process.exit(0);
}
const mod=async key=>import(pathToFileURL(resolve(output,key+".mjs")).href);
const {normalizeAvRender,normalizeAvDate}=await mod("canonical");
const {adaptAttributeViewRender}=await mod("flattened");
const {makeScheduleResult}=await mod("schedule");
const {TimelineTransformerService}=await mod("timeline");
const {listCustomRecords}=await mod("sdk");

const id=(c)=>"20261105010000-"+c.repeat(7);
const avID=id("a"), blockId=id("b"), viewId=id("c");
const item=id("d"), doc=id("e"), valueId=id("f"),title=id("g"),date=id("h"),tag=id("i"),otherDate=id("j");
const first=Date.parse("2025-11-29T16:00:00.000Z");
const last=Date.parse("2026-02-27T16:00:00.000Z");
const timed=Date.parse("2025-11-30T01:30:00.000Z");
const raw={
  name:"日期统一测试",viewID:viewId,view:{
    id:viewId,name:"地图",pageSize:25,rowCount:1,
    columns:[
      {id:title,name:"标题",type:"block"},
      {id:date,name:"开始时间",type:"date"},
      {id:tag,name:"分类",type:"select"},
      {id:otherDate,name:"带时间",type:"date"},
    ],
    rows:[{id:item,cells:[
      {value:{id:valueId,keyID:title,block:{id:doc,content:"上海 - 玉兰香苑四期"},
        updatedAt:12345}},
      {value:{keyID:date,date:{content:first,content2:last,hasEndDate:true,isNotEmpty:true,
        isNotEmpty2:true,isNotTime:true,formattedContent:"2025-11-30 至 2026-02-28"}}},
      {value:{keyID:tag,type:"select",mSelect:[{content:"租房",color:"purple"}]}},
      {value:{keyID:otherDate,date:{content:timed,isNotEmpty:true,isNotTime:false,
        formattedContent:"2025-11-30 09:30:00"}}},
    ]}],
  },
};
const common=normalizeAvRender(raw);
assert.deepEqual(common.fields.map(f=>f.id),[title,date,tag,otherDate]);
assert.equal(common.records[0].itemId,item);
assert.equal(common.records[0].blockId,doc);
assert.equal(common.records[0].valueId,valueId);
const cell=common.records[0].cells[date];
assert.deepEqual(cell.value,{start:first,end:last,allDay:true});
assert.equal(cell.date.startDisplay,"2025-11-30");
assert.equal(cell.date.endDisplay,"2026-02-28");
assert.equal(cell.display,"2025-11-30 至 2026-02-28");
assert.equal(common.records[0].cells[otherDate].date.startDisplay,"2025-11-30 09:30:00");
assert.equal(common.records[0].cells[tag].value,"租房");
// The kernel may omit formattedContent. In that case its native local
// midnight must stay on the exact local calendar day, in EVERY timezone.
const bareLocal=new Date(2026,1,28,0,0,0).getTime();
assert.equal(normalizeAvDate({
  isNotEmpty:true,isNotTime:true,content:bareLocal,
}).startDisplay,"2026-02-28");
assert.equal(normalizeAvDate({
  isNotEmpty:true,isNotTime:false,content:new Date(2026,1,28,9,30).getTime(),
}).startDisplay,"2026-02-28 09:30:00");

const flattened=adaptAttributeViewRender(raw);
assert.equal(flattened.rows[0][1],"2025-11-30");
assert.equal(flattened.rows[0][3],"2025-11-30 09:30:00");
assert.equal(flattened.rows[0][flattened.columnIds.indexOf(date+":end")],"2026-02-28");
assert.deepEqual([flattened.rowBlockIds[0],flattened.rowBoundBlockIds[0],flattened.rowValueIds[0]],
  [item,doc,valueId]);

const gantt=makeScheduleResult(raw,{
  fieldMapping:{title,start:date,end:date,progress:"",group:"",color:""},
});
assert.equal(gantt.data.length,1);
assert.equal(gantt.data[0].start_date,"2025-11-30");
assert.equal(gantt.data[0].end_date,"2026-03-01","exclusive date end is one calendar day after Feb 28");
assert.deepEqual([gantt.data[0].blockId,gantt.data[0].valueId],[doc,valueId]);
const timeline=TimelineTransformerService.transform({...flattened,hasHeader:true,sourceName:raw.name},
  {sourceType:"database",sourceBlockId:blockId,sourceAvID:avID,
    fieldMapping:{title,startDate:date,endDate:date}});
assert.deepEqual(timeline.events[0].start_date,{year:2025,month:11,day:30});
assert.deepEqual(timeline.events[0].end_date,{year:2026,month:2,day:28});
assert.equal(timeline.events[0].display_date,"2025-11-30 - 2026-02-28");
assert.equal(timeline.events[0].record.itemId,item);

globalThis.fetch=async (url,options)=>{
  const action=JSON.parse(options.body);
  assert.equal(url,"/api/av/renderAttributeView");
  assert.equal(action.id,avID);
  assert.equal(action.viewID,viewId);
  return new Response(JSON.stringify({code:0,data:raw}),{status:200});
};
const sdk=await listCustomRecords({avID,blockId,viewId,search:""},{page:1});
assert.deepEqual(sdk.fields.map(f=>f.id),[title,date,tag,otherDate]);
assert.deepEqual([sdk.records[0].id,sdk.records[0].blockId,sdk.records[0].valueId],[item,doc,valueId]);
assert.deepEqual(sdk.records[0].values[date],cell.value);
assert.equal(sdk.records[0].displayValues[date],cell.display);
assert.equal(sdk.records[0].displayValues[otherDate],"2025-11-30 09:30:00");
assert.equal(sdk.records[0].values[tag],"租房");
assert.equal(sdk.records[0].valueDetails[date].isNotTime,true);

console.log("unified AV normalized dates across timeline, calendar/gantt, legacy table and HTML SDK");
