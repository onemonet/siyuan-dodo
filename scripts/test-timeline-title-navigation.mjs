import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const source = name => readFile(name,"utf8");
const id = suffix => `20261018220000-${suffix}`;
const server = await createServer({configFile:false,server:{middlewareMode:true},appType:"custom"});
try {
  const { adaptAttributeViewRender } = await server.ssrLoadModule("/src/shared/av/av-data-adapter.ts");
  const { TimelineTransformerService } = await server.ssrLoadModule("/src/lets-custom-block/timeline/services/timeline-transformer.ts");
  const titleId=id("ttttttt"), dateId=id("ddddddd"), avID=id("aaaaaaa"), databaseBlockID=id("sssssss");
  const cases = [
    {title:"较晚绑定文档",date:Date.UTC(2026,9,18),item:id("iiiiii1"),value:id("vvvvvv1"),bound:id("bbbbbb1")},
    {title:"无日期条目",date:null,item:id("iiiiii2"),value:id("vvvvvv2"),bound:""},
    {title:"较早独立条目",date:Date.UTC(2026,9,16),item:id("iiiiii3"),value:id("vvvvvv3"),bound:""},
    {title:"较早绑定文档",date:Date.UTC(2026,9,17),item:id("iiiiii4"),value:id("vvvvvv4"),bound:id("bbbbbb4")},
  ];
  const adapted=adaptAttributeViewRender({view:{columns:[
    {id:titleId,name:"标题",type:"block"},{id:dateId,name:"开始时间",type:"date"}
  ],rows:cases.map(x=>({id:x.item,cells:[
    {value:{id:x.value,keyID:titleId,blockID:x.item,isDetached:!x.bound,block:{content:x.title,...(x.bound?{id:x.bound}:{})}}},
    {value:{keyID:dateId,date:x.date===null?{isNotEmpty:false}:{isNotEmpty:true,content:x.date,isNotTime:true}}}
  ]}))}});
  assert.deepEqual(adapted.rowBlockIds,cases.map(x=>x.item));
  assert.deepEqual(adapted.rowValueIds,cases.map(x=>x.value));
  assert.deepEqual(adapted.rowBoundBlockIds,cases.map(x=>x.bound));
  const table={...adapted,hasHeader:true};
  const config={sourceType:"database",sourceBlockId:databaseBlockID,sourceAvID:avID,fieldMapping:{title:titleId,startDate:dateId}};
  const events=TimelineTransformerService.transform(table,config).events;
  assert.deepEqual(events.map(x=>x.record?.itemId),[cases[2].item,cases[3].item,cases[0].item],
    "Sorting chronologically must retain correct AV record IDs; records with invalid dates are skipped");
  assert.deepEqual(events.map(x=>x.unique_id),[`${databaseBlockID}-2`,`${databaseBlockID}-3`,`${databaseBlockID}-0`],
    "Slide ID must remain stable after skipping invalid dates and sorting");
  assert.deepEqual(events[0].record,{blockId:"",itemId:cases[2].item,valueId:cases[2].value,avID,databaseBlockID,title:cases[2].title},
    "Detached entry must provide same native AV tab arguments as map view");
  assert.deepEqual(events[1].record,{blockId:cases[3].bound,itemId:cases[3].item,valueId:cases[3].value,avID,databaseBlockID,title:cases[3].title},
    "Bound entry must prefer actual document block ID over database row itemID");
  assert.ok(TimelineTransformerService.transform({...table,rowBlockIds:[],rowBoundBlockIds:[],rowValueIds:[]},config)
    .events.every(event=>!event.record),"Missing IDs must not create a clickable but invalid target");
  assert.ok(TimelineTransformerService.transform(table,{...config,sourceType:"table"})
    .events.every(event=>!event.record),"Standalone Markdown timelines must not navigate to AV records");
  const iframe=await source("src/lets-custom-block/timeline/iframe/main.ts");
  const host=await source("src/lets-database-view/index.ts") +
    await source("src/lets-database-view/visual/timeline-interaction.ts");
  const visual=await source("src/lets-database-view/visual/visual-view-service.ts");
  assert.match(iframe,/target\.closest<HTMLElement>\("\.tl-slide:not\(\.tl-slide-titleslide\)"\)/);
  assert.match(iframe,/recordTargets\.get\(slide\.id\)/);
  assert.match(iframe,/window\.parent\.postMessage\(\{ type: "dodoTimelineOpenItem", \.\.\.record \}, location\.origin\)/);
  assert.match(iframe,/event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(host,/getTimelineFrameContext\(source\)/);
  assert.match(host,/data\.databaseBlockID !== context\.blockId \|\| data\.avID !== context\.avID/);
  assert.match(host,/openMapItem\(data, \{ position: "right" \}\)/,
    "Timeline record links must open on the right, preserving the current timeline pane");
  assert.match(visual,/mounted\.kind === "timeline"/);
  console.log("PASS: database timeline title click maps to bound/detached record after date sorting/filtering; message origin/context validated");
} finally { await server.close(); }
