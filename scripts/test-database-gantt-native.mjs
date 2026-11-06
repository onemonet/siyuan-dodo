import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {build}=require(require.resolve("esbuild",{paths:[require.resolve("vite")]}));

const files=["src/lets-database-view/gantt/gantt-model.ts",
  "src/lets-database-view/gantt/gantt-write.ts"];
const makeModule=async(path)=>{
  const result=await build({entryPoints:[path],bundle:true,platform:"node",
    format:"esm",target:"es2022",write:false,logLevel:"silent"});
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
};
const model=await makeModule(files[0]);
const writer=await makeModule(files[1]);
const makeId=(char)=>"20261020101010-"+char.repeat(7);
const IDs={av:makeId("a"),block:makeId("b"),view:makeId("c"),item:makeId("d"),
  title:makeId("e"),start:makeId("f"),end:makeId("g"),
  progress:makeId("h"),group:makeId("i"),color:makeId("j")};
process.env.TZ="Asia/Shanghai";
const localDay=(s)=>Date.parse(s+"T00:00:00+08:00");
const columns=[
  {id:IDs.title,name:"名称",type:"block"},
  {id:IDs.start,name:"日期",type:"date"},
  {id:IDs.end,name:"结束时间",type:"date"},
  {id:IDs.progress,name:"进度",type:"number"},
  {id:IDs.group,name:"状态",type:"select"},
  {id:IDs.color,name:"优先级",type:"select"},
];
const cells=[
  {value:{keyID:IDs.title,type:"block",block:{content:"项目实施"}}},
  {value:{keyID:IDs.start,type:"date",date:{
    content:localDay("2026-10-20"),content2:localDay("2026-10-22"),
    hasEndDate:true,isNotEmpty:true,isNotEmpty2:true,isNotTime:true,
  }}},
  {value:{keyID:IDs.end,type:"date",date:{
    content:localDay("2026-10-22"),isNotEmpty:true,isNotTime:true,
  }}},
  {value:{keyID:IDs.progress,type:"number",number:{content:35,isNotEmpty:true}}},
  {value:{keyID:IDs.group,type:"select",mSelect:[{content:"进行中",color:"blue"}]}},
  {value:{keyID:IDs.color,type:"select",mSelect:[{content:"高优先级",color:"red"}]}},
];
const data=()=>({name:"验证项目",view:{columns,rows:[{id:IDs.item,cells}]}});
const keyMap={title:IDs.title,start:IDs.start,end:"",progress:IDs.progress,
  group:IDs.group,color:IDs.color};
const cfg={fieldMapping:keyMap,progressMax:100};
assert.equal(model.prepareGanttMapping(data(),{}).title,IDs.title);
assert.equal(model.prepareGanttMapping(data(),{}).start,IDs.start);
assert.equal(model.prepareGanttMapping(data(),{title:IDs.title}).title,IDs.title);
assert.equal(model.resolvedGanttKeys(data(),keyMap).group,IDs.group);
const result=model.makeGanttResult(data(),cfg);
assert.equal(result.data.length,2,"group and task");
assert.equal(result.data[0].type,"project");
assert.equal(result.data[0].readonly,true);
const task=result.data[1];
assert.equal(task.id,IDs.item);
assert.equal(task.blockId,undefined,"No fabricated bound doc when primary cell has none");
assert.equal(task.valueId,undefined,"No fabricated AV primary value ID");
const navData=JSON.parse(JSON.stringify(data()));
navData.view.rows[0].cells[0].value.id=makeId("k");
navData.view.rows[0].cells[0].value.block.id=makeId("m");
const boundTask=model.makeGanttResult(navData,cfg).data[1];
assert.equal(boundTask.blockId,makeId("m"),"Navigate to bound SiYuan document");
assert.equal(boundTask.valueId,makeId("k"),"Keep actual AV primary value ID");
navData.view.rows[0].cells[0].value.isDetached=true;
assert.equal(model.makeGanttResult(navData,cfg).data[1].blockId,undefined,
  "Detached AV entry must not navigate to stale bound block");
assert.equal(model.makeGanttResult(navData,cfg).data[1].valueId,makeId("k"),
  "Detached AV entry uses native row details with real value ID");
assert.equal(task.text,"项目实施");
assert.equal(task.start_date,"2026-10-20");
assert.equal(task.end_date,"2026-10-23","SiYuan inclusive end converts to Gantt exclusive end");
assert.equal(task.progress,.35);
assert.ok(task.color,"option grouping colors");
assert.equal(task.parent,result.data[0].id);
assert.equal(result.skipped,0);
const noGroup=model.makeGanttResult(data(),{fieldMapping:{...keyMap,group:""}});
assert.equal(noGroup.data.length,1);
assert.equal(noGroup.data[0].parent,undefined);
assert.equal(model.makeGanttDateValue("2026-11-05",undefined,"2026-11-08").date.content2,
  localDay("2026-11-08"));
assert.equal(model.makeGanttProgressValue(.43,100).number.content,43);
assert.equal(model.makeGanttProgressValue(.43,1).number.content,.43);
assert.equal(model.makeGanttDateValue("2026-11-05",
  {isNotTime:false,isNotEmpty:true,content:Date.parse("2026-10-20T13:45:30.123+08:00")}).date.content,
  Date.parse("2026-11-05T13:45:00.000+08:00"),
  "datetime day edits keep visible HH:mm and normalize seconds/milliseconds");
assert.equal(model.formatGanttMinute(Date.parse("2026-10-01T13:30:59.999+08:00")),"2026-10-01 13:30");
assert.equal(model.parseGanttWallTime("2026-10-01 13:30"),Date.parse("2026-10-01T13:30:00.000+08:00"));
assert.equal(model.makeGanttDateValue("2026-10-01 13:30",{
  content:Date.parse("2026-09-30T09:10:59.999+08:00"),isNotTime:false,isNotEmpty:true,
}).date.content,Date.parse("2026-10-01T13:30:00.000+08:00"));
assert.throws(()=>model.parseGanttWallTime("2026-10-01 13:30:20"),/YYYY-MM-DD HH:mm/);
assert.throws(()=>model.parseGanttWallTime("2026-02-30 13:30"),/日期或时间无效/);
const range=model.makeGanttDateValue("2026-11-05",{
  isNotTime:false,isNotEmpty:true,hasEndDate:true,isNotEmpty2:true,
  content:Date.parse("2026-10-20T08:10:20.123+08:00"),
  content2:Date.parse("2026-10-22T17:35:48.456+08:00"),
},"2026-11-08");
assert.equal(range.date.content,Date.parse("2026-11-05T08:10:00.000+08:00"));
assert.equal(range.date.content2,Date.parse("2026-11-08T17:35:00.000+08:00"));
assert.equal(range.date.isNotTime,false);
const nested=model.makeGanttDateValue("2026-10-25",{
  content:Date.parse("2026-10-20T08:10:20.123+08:00"),
  content2:Date.parse("2026-10-22T17:35:48.456+08:00"),
  isNotTime:false,isNotEmpty:true,hasEndDate:true,isNotEmpty2:true,
});
assert.equal(nested.date.content,Date.parse("2026-10-25T08:10:00.000+08:00"));
assert.equal(nested.date.content2,Date.parse("2026-10-27T17:35:00.000+08:00"),
  "separate mapped cell keeps its nested range at minute precision when moving");
const unrelatedSeconds=model.makeGanttDateValue("2026-10-25",{
  content:Date.parse("2026-10-20T08:10:59.999+08:00"),
  content2:Date.parse("2026-10-22T17:35:00.001+08:00"),
  isNotTime:false,isNotEmpty:true,hasEndDate:true,isNotEmpty2:true,
});
assert.equal(unrelatedSeconds.date.content,Date.parse("2026-10-25T08:10:00.000+08:00"));
assert.equal(unrelatedSeconds.date.content2,Date.parse("2026-10-27T17:35:00.000+08:00"),
  "hidden original seconds must not steal one minute from nested end dates");
assert.equal(model.makeGanttDateValue("2026-11-05",{
  isNotTime:true,hasEndDate:false,isNotEmpty:true,content:localDay("2026-10-20")
},"2026-11-05").date.hasEndDate,false,
  "moving a single date never invents a new end date");
assert.throws(()=>model.makeGanttDateValue("2026-11-10",undefined,"2026-11-05"),/结束日期/);

// Runtime protocol validation must precede even the read-only SiYuan API
// call. A DHTMLX Date object or local date string is never a valid wire value.
const protocolBefore={start_date:"2026-11-01",end_date:"2026-11-04",progress:.25};
const validRequest={id:IDs.item,kind:"dates",before:protocolBefore,
  after:{...protocolBefore,start_date:"2026-11-02",end_date:"2026-11-05"}};
assert.doesNotThrow(()=>writer.assertGanttChangeWire(validRequest));
assert.throws(()=>writer.assertGanttChangeWire({...validRequest,
  before:{...protocolBefore,start_date:new Date("2026-11-01T00:00:00")}}),
  /标准日期字符串/,"Date objects from DHTMLX must never bypass the primitive protocol");
assert.throws(()=>writer.assertGanttChangeWire({...validRequest,
  before:{...protocolBefore,start_date:"Sun Nov 01 2026 00:00:00 GMT+0800"}}),
  /YYYY-MM-DD/,"locale-formatted dates must never enter native AV writes");
assert.throws(()=>writer.assertGanttChangeWire({...validRequest,
  after:{...validRequest.after,start_date:"2026-02-31"}}),/不是有效日期/);
assert.throws(()=>writer.assertGanttChangeWire({...validRequest,
  after:{...validRequest.after,progress:NaN}}),/进度不是有效/);

// Minute precision: reads ignore hidden fractional seconds; writes must zero them.
const originalMinuteStart={...cells[1].value.date};
const startMinute=Date.parse("2026-11-01T08:15:12.345+08:00");
const endMinute=Date.parse("2026-11-01T09:45:28.456+08:00");
cells[1].value.date.content=startMinute;
cells[1].value.date.content2=endMinute;
cells[1].value.date.isNotTime=false;
for(const timeStep of [15,30]){
  const modeConfig={...cfg,timeStep};
  const converted=model.makeGanttResult(data(),modeConfig).data[1];
  assert.equal(converted.start_date,"2026-11-01 08:15");
  assert.equal(converted.end_date,"2026-11-01 09:45");
  assert.doesNotThrow(()=>writer.assertGanttChangeWire({
    kind:"dates",id:IDs.item,before:{start_date:converted.start_date,
      end_date:converted.end_date,progress:.35},
    after:{start_date:"2026-11-01 08:45",
      end_date:"2026-11-01 10:15",progress:.35},
  },timeStep));
  assert.equal(model.makeGanttDateValue("2026-11-01 08:45",
    cells[1].value.date,"2026-11-01 10:15").date.content,
    Date.parse("2026-11-01T08:45:00.000+08:00"));
  assert.equal(model.makeGanttDateValue("2026-11-01 08:45",
    cells[1].value.date,"2026-11-01 10:15").date.content2,
    Date.parse("2026-11-01T10:15:00.000+08:00"));
  assert.throws(()=>writer.assertGanttChangeWire({kind:"dates",id:IDs.item,
    before:{start_date:"2026-11-01",end_date:"2026-11-04",progress:.35},
    after:{start_date:"2026-11-01 08:45",
      end_date:"2026-11-01 10:15",progress:.35}},timeStep),
    /YYYY-MM-DD HH:mm/);
}
Object.assign(cells[1].value.date,originalMinuteStart);
const context={avID:IDs.av,blockId:IDs.block,viewID:IDs.view};
const saved=[];
const originalFetch=globalThis.fetch;
let readCount=0;
globalThis.fetch=async(path,opts)=>{
  readCount++;
  assert.equal(path,"/api/av/renderAttributeView");
  assert.deepEqual(JSON.parse(opts.body),{id:IDs.av,blockID:IDs.block,
    viewID:IDs.view,pageSize:100000,page:1,createIfNotExist:false});
  return {ok:true,json:async()=>({code:0,data:data()})};
};
const mockWriter=async(path,body)=>{assert.equal(path,"/api/av/setAttributeViewBlockAttr");saved.push(body);};
const original=()=>{
  return {start_date:"2026-10-20",end_date:"2026-10-23",progress:.35};
};
try {
  const before=original();
  const minutesOld={...cells[1].value.date};
  cells[1].value.date.content=Date.parse("2026-11-01T08:15:12.345+08:00");
  cells[1].value.date.content2=Date.parse("2026-11-01T09:45:28.456+08:00");
  cells[1].value.date.isNotTime=false;
  for(const timeStep of [15,30]){
    const minuteConfig={...cfg,timeStep};
    const beforeMinute={start_date:"2026-11-01 08:15",
      end_date:"2026-11-01 09:45",progress:.35};
    await writer.saveGanttChange(context,minuteConfig,{kind:"dates",id:IDs.item,
      before:beforeMinute,after:{...beforeMinute,start_date:"2026-11-01 08:45",
        end_date:"2026-11-01 10:15"}},mockWriter);
    assert.equal(saved.length,1);
    assert.equal(saved[0].value.date.content,Date.parse("2026-11-01T08:45:00.000+08:00"));
    assert.equal(saved[0].value.date.content2,Date.parse("2026-11-01T10:15:00.000+08:00"));
    assert.equal(saved[0].value.date.isNotTime,false);
    assert.equal(saved[0].value.date.content%60000,0);
    assert.equal(saved[0].value.date.content2%60000,0);
    saved.length=0;
  }
  Object.assign(cells[1].value.date,minutesOld);
  const readsBeforeInvalid=readCount;
  await assert.rejects(writer.saveGanttChange(context,cfg,{
    ...validRequest,id:IDs.item,
    before:{...validRequest.before,start_date:new Date("2026-11-01T00:00:00")},
  },async()=>{throw Error("Unexpected AV write");}),/标准日期字符串/);
  assert.equal(readCount,readsBeforeInvalid,"invalid iframe payload must not call SiYuan");

  await writer.saveGanttChange(context,cfg,{
    id:IDs.item,kind:"dates",before,after:{...before,start_date:"2026-10-21",end_date:"2026-10-26"},
  },mockWriter);
  assert.equal(saved.length,1);
  assert.equal(saved[0].avID,IDs.av);
  assert.equal(saved[0].keyID,IDs.start);
  assert.equal(saved[0].itemID,IDs.item);
  assert.equal(saved[0].value.type,"date");
  assert.equal(saved[0].value.date.content,localDay("2026-10-21"));
  assert.equal(saved[0].value.date.content2,localDay("2026-10-25"));
  saved.length=0;
  await writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"progress",
    before,after:{...before,progress:.6}},mockWriter);
  assert.equal(saved.length,1);
  assert.equal(saved[0].keyID,IDs.progress);
  assert.equal(saved[0].value.number.content,60);
  saved.length=0;
  const separate={...cfg,fieldMapping:{...keyMap,end:IDs.end}};
  const originalStartCell=cells[1].value.date;
  const originalEndCell=cells[2].value.date;
  cells[1].value.date={content:Date.parse("2026-10-20T18:00:00+08:00"),isNotEmpty:true,isNotTime:false};
  cells[2].value.date={content:Date.parse("2026-10-22T09:00:00+08:00"),isNotEmpty:true,isNotTime:false};
  try{
    for(const after of [
      {...before,start_date:"2026-10-22"},
      {...before,end_date:"2026-10-21"},
      {...before,start_date:"2026-10-21",end_date:"2026-10-22"},
    ]){
      await assert.rejects(writer.saveGanttChange(context,separate,{
        id:IDs.item,kind:"dates",before,after,
      },mockWriter),/结束日期不能早于开始日期/);
      assert.equal(saved.length,0,"reversed native timestamps must fail before any write");
    }
    await writer.saveGanttChange(context,separate,{
      id:IDs.item,kind:"dates",before,after:{...before,start_date:"2026-10-21"},
    },mockWriter);
    assert.equal(saved.length,1,"a valid date move still preserves native time");
    assert.equal(saved[0].value.date.content,Date.parse("2026-10-21T18:00:00+08:00"));
    saved.length=0;
    // An untouched endpoint may have changed since the editor opened.
    cells[1].value.date.content=Date.parse("2026-10-22T18:00:00+08:00");
    cells[2].value.date.content=Date.parse("2026-10-24T09:00:00+08:00");
    await assert.rejects(writer.saveGanttChange(context,separate,{
      id:IDs.item,kind:"dates",
      before:{...before,end_date:"2026-10-25"},
      after:{...before,end_date:"2026-10-23"},
    },mockWriter),/结束日期不能早于开始日期/);
    assert.equal(saved.length,0,"validate the final range against the latest untouched endpoint");
  }finally{
    cells[1].value.date=originalStartCell;
    cells[2].value.date=originalEndCell;
  }
  // Separate date fields are editable even if the start field has its own
  // nested date range. A change to END alone must never modify START.
  const oldStartDate={...cells[1].value.date};
  assert.equal(model.makeGanttResult(data(),separate).data[1].dateLocked,undefined);
  await writer.saveGanttChange(context,separate,{id:IDs.item,kind:"dates",
    before,after:{...before,end_date:"2026-10-26"}},mockWriter);
  assert.equal(saved.length,1);
  assert.equal(saved[0].keyID,IDs.end);
  assert.equal(saved[0].value.date.content,localDay("2026-10-25"));
  saved.length=0;
  const sepBefore={...before};
  await writer.saveGanttChange(context,separate,{id:IDs.item,kind:"dates",
    before:sepBefore,after:{...sepBefore,start_date:"2026-10-21",end_date:"2026-10-28"}},mockWriter);
  assert.deepEqual(saved.map(b=>b.keyID),[IDs.start,IDs.end]);
  assert.equal(saved[0].value.date.content,localDay("2026-10-21"));
  assert.equal(saved[0].value.date.content2,localDay("2026-10-23"),
    "separate start field shifts its hidden range by the same day delta");
  assert.equal(saved[1].value.date.content,localDay("2026-10-27"));
  saved.length=0;
  let attempts=0;
  await assert.rejects(writer.saveGanttChange(context,separate,{id:IDs.item,
    kind:"dates",before,after:{...before,start_date:"2026-10-21",end_date:"2026-10-26"}},
    async(_path,body)=>{saved.push(body);if(++attempts===2)throw Error("Kernel denied");}),
    /甘特自动保存失败/);
  assert.equal(saved.length,3,"failed second field triggers rollback of first");
  assert.equal(saved[2].value.date.content,localDay("2026-10-20"));
  Object.assign(cells[1].value.date,oldStartDate);
  saved.length=0;
  await assert.rejects(writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"dates",
    before:{...before,start_date:"2026-10-19"},after:{...before,start_date:"2026-10-22"}},
    mockWriter),/开始日期已在思源数据库中变化/);
  assert.equal(saved.length,0,"stale payload must not reach API");
  // Editing one native column must not be blocked by a change in
  // unrelated columns. The old guard incorrectly compared the whole task.
  const originalProgress=cells[3].value.number.content;
  cells[3].value.number.content=70;
  try{
    await writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"dates",
      before,after:{...before,start_date:"2026-10-21",end_date:"2026-10-26"}},
      mockWriter);
    assert.equal(saved.length,1,"unrelated progress change must not block date save");
    assert.equal(saved[0].keyID,IDs.start);
    saved.length=0;
    await assert.rejects(writer.saveGanttChange(context,cfg,{
      id:IDs.item,kind:"progress",before,after:{...before,progress:.6},
    },mockWriter),/进度已在思源数据库中变化/);
    assert.equal(saved.length,0,"conflicting progress update must fail closed");
  }finally{cells[3].value.number.content=originalProgress;}

  const priorDate={...cells[1].value.date};
  cells[1].value.date.content=localDay("2026-10-22");
  cells[1].value.date.content2=localDay("2026-10-24");
  try{
    await writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"progress",
      before,after:{...before,progress:.6}},mockWriter);
    assert.equal(saved.length,1,"unrelated date change must not block progress write");
    assert.equal(saved[0].keyID,IDs.progress);
    saved.length=0;
    await assert.rejects(writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"dates",
      before,after:{...before,start_date:"2026-10-21",end_date:"2026-10-26"}},mockWriter),
      /开始日期已在思源数据库中变化/);
    assert.equal(saved.length,0);
  }finally{Object.assign(cells[1].value.date,priorDate);}

  // Two independently mapped date columns only need to validate the
  // column(s) that the drag actually changes.
  const previousEnd=cells[2].value.date.content;
  cells[2].value.date.content=localDay("2026-10-24");
  try{
    await writer.saveGanttChange(context,separate,{id:IDs.item,kind:"dates",
      before,after:{...before,start_date:"2026-10-21"}},mockWriter);
    assert.deepEqual(saved.map(b=>b.keyID),[IDs.start]);
    saved.length=0;
    await assert.rejects(writer.saveGanttChange(context,separate,{id:IDs.item,
      kind:"dates",before,after:{...before,end_date:"2026-10-28"}},mockWriter),
      /结束日期已在思源数据库中变化/);
    assert.equal(saved.length,0);
  }finally{cells[2].value.date.content=previousEnd;}

  await assert.rejects(writer.saveGanttChange(context,cfg,{id:"__proto__",kind:"dates",
    before,after:before},mockWriter),/ID 无效/);
  assert.equal(saved.length,0);
  const oldDate={...cells[1].value.date};
  cells[1].value.date.isNotTime=false;
  cells[1].value.date.content=Date.parse("2026-10-20T13:45:30.123+08:00");
  cells[1].value.date.content2=Date.parse("2026-10-22T18:05:55.678+08:00");
  try {
    assert.equal(model.makeGanttResult(data(),cfg).data[1].dateLocked,undefined,
      "datetime cell with valid range remains date-editable");
    await writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"dates",
      before,after:{...before,start_date:"2026-10-21",end_date:"2026-10-27"}},mockWriter);
    assert.equal(saved.length,1);
    assert.equal(saved[0].keyID,IDs.start);
    assert.equal(saved[0].value.date.content,Date.parse("2026-10-21T13:45:00.000+08:00"));
    assert.equal(saved[0].value.date.content2,Date.parse("2026-10-26T18:05:00.000+08:00"));
    assert.equal(saved[0].value.date.isNotTime,false);
    saved.length=0;
    await writer.saveGanttChange(context,cfg,{id:IDs.item,kind:"progress",
      before,after:{...before,progress:.5}},mockWriter);
    assert.equal(saved.length,1);
    assert.equal(saved[0].keyID,IDs.progress);
    saved.length=0;
  }finally{Object.assign(cells[1].value.date,oldDate);}
}finally{globalThis.fetch=originalFetch;}
const host=readFileSync("src/lets-database-view/gantt/gantt-renderer.ts","utf8");
const frame=readFileSync("src/lets-database-view/gantt/iframe/main.js","utf8");
const settings=readFileSync("src/lets-database-view/gantt/GanttSettingsPanel.svelte","utf8");
assert.match(host,/renderAttributeView\(\{id:avID,blockID:blockId,viewID:mounted.viewId,pageSize:100000,query:bridge.search\(av\)\}/);
assert.match(host,/saveGanttChange\(\{avID,blockId,viewID:mounted.viewId\}/);
assert.match(readFileSync("src/lets-database-view/gantt/gantt-interaction.ts","utf8"),/event.origin !== location.origin/);
assert.match(readFileSync("src/lets-database-view/gantt/gantt-interaction.ts","utf8"),/m.frame.contentWindow===event.source/);
assert.match(host,/DatabaseViewConfigStore.updateView/);
assert.match(host,/甘特字段映射已修改，请等待视图刷新后再编辑/);

assert.match(frame,/dodoGanttEdit/);
assert.match(frame,/dodoGanttData/);
assert.match(frame,/openEditor\(id\)/, "double-click opens editor in native mode");
assert.match(frame,/form\.addEventListener\("submit"/, "native editor submits through bridge");
assert.match(frame,/item\.dateLocked/, "date locks are independent from progress editing");
assert.match(frame,/requestSave\(/);

assert.doesNotMatch(frame,/api\/av\/setAttributeViewBlockAttr/);
assert.match(settings,/FieldMapping/);
console.log("PASS: native AV mapping, date end semantics, grouping/color/progress, safe write, stale rejection, double-date rollback, host bridge");
