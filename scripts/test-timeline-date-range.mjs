import assert from "node:assert/strict";
import { createServer } from "vite";

// End-to-end, real SiYuan renderAttributeView-shaped cells -> adapter -> timeline.
const server = await createServer({configFile:false,server:{middlewareMode:true},appType:"custom"});
try {
  const { adaptAttributeViewRender } = await server.ssrLoadModule("/src/shared/av/av-data-adapter.ts");
  const { TimelineTransformerService } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/timeline-transformer.ts");
  const { materializeTimelineFieldMapping } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/field-mapping.ts");
  const titleID = "20261018231000-aaaaaaa";
  const dateID = "20261018231000-bbbbbbb";
  const otherDateID = "20261018231000-ccccccc";
  const blockID = "20261018231000-ddddddd";
  // Native SiYuan date editor stores the user's local calendar fields.
  const start = (day, hour=0) => new Date(2026, 9, day, hour).getTime();
  const makeDate = (begin, end, timed=false) => ({
    content:begin, isNotEmpty:begin!==undefined, content2:end,
    hasEndDate:end!==undefined, isNotEmpty2:end!==undefined, isNotTime:!timed,
  });
  const row = (name, date, second, item) => ({id:`20261018231100-${item}`,cells:[
    {value:{keyID:titleID,block:{content:name}}},
    {value:{keyID:dateID,date}},
    {value:{keyID:otherDateID,date:second}},
  ]});
  const rows = [
    row("晚开始范围",makeDate(start(20),start(24)),makeDate(start(22),start(25)),"aaaaaaa"),
    row("没有结束",makeDate(start(13),undefined),makeDate(start(19),start(21)),"bbbbbbb"),
    row("早开始范围",makeDate(start(1),start(4)),makeDate(start(1),start(2)),"ccccccc"),
    row("结束开关未开启",{...makeDate(start(16),start(30)),hasEndDate:false},makeDate(start(16),start(18)),"ddddddd"),
    row("开始日期为空",makeDate(undefined,start(7)),makeDate(start(7),start(10)),"eeeeeee"),
    row("带时分范围",makeDate(start(26,9),start(26,17),true),makeDate(start(26,9),start(27,10)),"fffffff"),
  ];
  const av={view:{columns:[
    {id:titleID,name:"标题",type:"block"},
    {id:dateID,name:"日期",type:"date"},
    {id:otherDateID,name:"单独截止日",type:"date"},
  ],rows}};
  const adapted=adaptAttributeViewRender(av);
  const virtualIndex=adapted.columnIds.indexOf(`${dateID}:end`);
  assert.ok(virtualIndex>=0,"The existing AV adapter must expose the real content2 as a virtual end cell");
  assert.equal(adapted.rows[0][virtualIndex],"2026-10-24");
  assert.equal(adapted.rows[1][virtualIndex],"","A single date should have no invented end");
  assert.equal(adapted.rows[3][virtualIndex],"","hasEndDate:false forbids stale content2 from being used");
  assert.equal(adapted.rows[5][virtualIndex],"2026-10-26 17:00:00");
  const table={...adapted,hasHeader:true,sourceName:"测试数据库"};
  const mapping={ title:titleID,startDate:dateID,endDate:dateID,displayDate:"",group:"" };
  const config={sourceType:"database",sourceBlockId:blockID,fieldMapping:mapping};
  const same=TimelineTransformerService.transform(table,config);
  const byTitle=Object.fromEntries(same.events.map(event=>[event.text.headline,event]));
  assert.equal(same.events.length,5,"Rows missing a valid start must be skipped");
  assert.deepEqual(same.events.map(event=>event.text.headline),
    ["早开始范围","没有结束","结束开关未开启","晚开始范围","带时分范围"],
    "Sorted order should use the date column start, not its end");
  assert.deepEqual(byTitle["早开始范围"].start_date,{year:2026,month:10,day:1});
  assert.deepEqual(byTitle["早开始范围"].end_date,{year:2026,month:10,day:4});
  assert.equal(byTitle["早开始范围"].display_date,"2026-10-01 - 2026-10-04");
  assert.equal(byTitle["没有结束"].end_date,undefined,"Single-day date cell must not duplicate its start as end");
  assert.equal(byTitle["没有结束"].display_date,"2026-10-13");
  assert.equal(byTitle["结束开关未开启"].end_date,undefined);
  assert.deepEqual(byTitle["带时分范围"].end_date,{year:2026,month:10,day:26,hour:17,minute:0,second:0});

  const different=TimelineTransformerService.transform(table,{...config,fieldMapping:{...mapping,endDate:otherDateID}});
  const diffByTitle=Object.fromEntries(different.events.map(event=>[event.text.headline,event]));
  assert.deepEqual(diffByTitle["晚开始范围"].end_date,{year:2026,month:10,day:22},
    "Different date column mapping must still read its independent START, not the first date's content2");
  assert.deepEqual(diffByTitle["没有结束"].end_date,{year:2026,month:10,day:19});

  const optionalOff=TimelineTransformerService.transform(table,{...config,fieldMapping:{...mapping,endDate:""}});
  assert.ok(optionalOff.events.every(event=>event.end_date===undefined),
    "An explicitly unused end mapping must disable every range end");

  const manuallyLabeled=TimelineTransformerService.transform(table,{...config,fieldMapping:{...mapping,displayDate:""}});
  assert.equal(manuallyLabeled.events[0].display_date,"2026-10-01 - 2026-10-04");
  const reNamed={...table,headers:["事件名","活动日期","另一日期",...table.headers.slice(3)],
    columnNames:["事件名","活动日期","另一日期",...table.columnNames.slice(3)]};
  const renamedMapping = materializeTimelineFieldMapping(reNamed,mapping).mapping;
  for (const [field, value] of Object.entries(mapping)) {
    assert.equal(renamedMapping[field],value,
      "Renaming date columns must not change previously persisted field keyIDs");
  }
  const renamedResult=TimelineTransformerService.transform(reNamed,config);
  assert.deepEqual(renamedResult.events.map(event=>event.end_date),same.events.map(event=>event.end_date));
  const noRanges=adaptAttributeViewRender({...av,view:{...av.view,rows:[rows[1]]}});
  assert.equal(noRanges.columnIds.includes(`${dateID}:end`),false,
    "The AV adapter should not generate phantom end columns for a single date");
  assert.equal(TimelineTransformerService.transform({...noRanges,hasHeader:true},config).events[0].end_date,undefined,
    "Same-column date binding without a range must not duplicate startDate");
  const markdown={headers:["标题","时间"],rows:[["纯 Markdown","2026-10-07"]],hasHeader:true};
  const markdownResult=TimelineTransformerService.transform(markdown,{sourceType:"table",fieldMapping:{title:"标题",startDate:"时间",endDate:"时间"}});
  assert.deepEqual(markdownResult.events[0].start_date,markdownResult.events[0].end_date,
    "Markdown table same-column mapping keeps its existing plain-cell behavior");
  console.log("PASS: native AV same-column date uses content2; separate date column unchanged; empty end ignored; local SiYuan dates, timed ranges, sorting, stable keyIDs and Markdown compatibility");
} finally {await server.close();}
