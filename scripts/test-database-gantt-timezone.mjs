import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {build}=require(require.resolve("esbuild",{paths:[require.resolve("vite")]}));
async function load(path){
  const module=await build({entryPoints:[path],bundle:true,platform:"node",
    format:"esm",write:false,logLevel:"silent"});
  return import("data:text/javascript;base64,"+
    Buffer.from(module.outputFiles[0].text).toString("base64"));
}
const model=await load("src/lets-database-view/gantt/gantt-model.ts");
const writer=await load("src/lets-database-view/gantt/gantt-write.ts");
const id=char=>"20261020101010-"+char.repeat(7);
const mapping={title:id("a"),start:id("b"),end:"",progress:"",group:"",color:""};
const context={avID:id("c"),blockId:id("d"),viewID:id("e")};
const rawDate=date=>({view:{columns:[
  {id:mapping.title,type:"block",name:"名称"},
  {id:mapping.start,type:"date",name:"开始"},
  {id:id("g"),type:"date",name:"结束"},
],rows:[{id:id("f"),cells:[
  {value:{keyID:mapping.title,type:"block",block:{content:"timezone regression"}}},
  {value:{keyID:mapping.start,type:"date",date}},
  {value:{keyID:id("g"),type:"date",date:{...date,content:date.content2}}},
]}]}});
const originalFetch=globalThis.fetch;
try{
  for(const [zone,offset] of [["Asia/Shanghai","+08:00"],["UTC","Z"],
    ["America/New_York","-04:00"],["Asia/Kolkata","+05:30"]]){
    process.env.TZ=zone;
    const stamp=wall=>Date.parse(wall.replace(" ","T")+":00"+offset);
    const display=ms=>new Intl.DateTimeFormat("sv-SE",{timeZone:zone,
      year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",
      hourCycle:"h23"}).format(ms);
    for(const hour of ["00:00","06:00"]){
      const input="2026-10-01 "+hour;
      const value=model.makeGanttDateValue(input,{isNotTime:false,isNotEmpty:true,
        content:stamp("2026-09-30 00:00")}).date;
      assert.equal(display(value.content),input,zone+": native table must display the Gantt wall time");
      assert.equal(value.content,stamp(input),zone+": explicit instant must use the local offset");
      assert.equal(model.formatGanttMinute(value.content),input,zone+": read-back retains wall time");
      assert.equal(model.formatGanttDate(value.content),"2026-10-01",zone+": midnight stays on the local day");
      const moved=model.makeGanttDateValue("2026-10-02",value).date;
      assert.equal(display(moved.content),"2026-10-02 "+hour,zone+": day edit retains local HH:mm");

      for(const separate of [false,true]){
        const raw=rawDate({content:stamp("2026-09-30 12:00"),content2:stamp("2026-10-01 18:00"),
          isNotTime:false,isNotEmpty:true,hasEndDate:true,isNotEmpty2:true});
        const config={fieldMapping:{...mapping,end:separate?id("g"):""},timeStep:15};
        const before=model.makeGanttResult(raw,config).data[0];
        globalThis.fetch=async()=>({ok:true,json:async()=>({code:0,data:raw})});
        const saved=[];
        await writer.saveGanttChange(context,config,{id:id("f"),kind:"dates",before,
          after:{...before,start_date:input,end_date:"2026-10-01 12:30"}},async(_path,body)=>{
          saved.push(body);
          const cell=raw.view.rows[0].cells.find(cell=>cell.value.keyID===body.keyID);
          cell.value.date=body.value.date;
        });
        assert.equal(display(saved[0].value.date.content),input,zone+": actual writer payload uses native wall time");
        assert.equal(saved.length,separate?2:1);
        const after=model.makeGanttResult(raw,config).data[0];
        assert.equal(after.start_date,input,zone+": writer/read-back round trip");
        assert.equal(after.end_date,"2026-10-01 12:30",zone+": end uses the same timezone convention");
        for(const body of saved){
          assert.equal(body.value.date.content%60000,0,"Writes retain minute precision");
          if(body.value.date.isNotEmpty2)assert.equal(body.value.date.content2%60000,0);
        }
      }
    }
    const dateOnly=model.makeGanttDateValue("2026-10-01").date;
    assert.equal(dateOnly.content,stamp("2026-10-01 00:00"),zone+": date-only writes use local midnight");
    const task=model.makeGanttResult(rawDate(dateOnly),{fieldMapping:mapping,timeStep:15}).data[0];
    assert.equal(task.start_date,"2026-10-01 00:00");
    assert.equal(task.end_date,"2026-10-02 00:00");
  }
  process.env.TZ="America/New_York";
  const moved=model.makeGanttDateValue("2026-03-08",{
    content:Date.parse("2026-03-07T09:15:37-05:00"),
    content2:Date.parse("2026-03-08T10:45:59-04:00"),
    isNotTime:false,isNotEmpty:true,hasEndDate:true,isNotEmpty2:true,
  }).date;
  assert.equal(moved.content,Date.parse("2026-03-08T09:15:00-04:00"));
  assert.equal(moved.content2,Date.parse("2026-03-09T10:45:00-04:00"),
    "Nested ranges retain local clock duration when moving across DST");
  const task=model.makeGanttResult(rawDate({content:Date.parse("2026-03-08T00:00:00-05:00"),
    isNotTime:true,isNotEmpty:true}),{fieldMapping:mapping,timeStep:15}).data[0];
  assert.equal(task.end_date,"2026-03-09 00:00","A date-only task spans a calendar day across DST");
  assert.throws(()=>model.parseGanttWallTime("2026-03-08 02:30"),/日期或时间无效/,
    "Nonexistent local time must not silently shift to another clock time");
}finally{globalThis.fetch=originalFetch;}
console.log("PASS: native timezone writes/read-back in Shanghai, UTC, New York and Kolkata; calendar moves across DST");
