import assert from "node:assert/strict";
import {createServer} from "node:http";
import {copyFileSync,existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {spawn} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const esbuild=require(require.resolve("esbuild",{paths:[require.resolve("vite")]}));
const chrome=[
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if(!chrome)throw Error("A Chromium browser is required for Frappe integration");
const tooltipLeft=process.argv.includes("--tooltip-left");
const tooltipMode=process.argv.includes("--tooltip")||tooltipLeft;
const externalMouse=process.argv.includes("--playwright")||tooltipMode;
const precision=Number(process.argv[2]||0);
const scale=process.argv[3]||(precision?"hour":"week");
assert.ok([0,15,30].includes(precision));
assert.ok(["hour","day","week","month"].includes(scale));
const tmp=mkdtempSync(join(tmpdir(),"dodo-frappe-e2e-"));
let server=null;
try{
  for(const name of ["gantt-iframe.html","main.js","app.css",
    "frappe-gantt.umd.js","frappe-gantt.css"]){
    copyFileSync("src/lets-database-view/gantt/iframe/"+name,join(tmp,name));
  }
  const filename=join(tmp,"main.js");
  const original=readFileSync(filename,"utf8");
  const changed=original.replace("chart=new Frappe(timeline,tasks,chartOptions());",
    "chart=window.__dodoChart=new Frappe(timeline,tasks,chartOptions());");
  assert.notEqual(original,changed);
  writeFileSync(filename,changed,"utf8");
  await esbuild.build({entryPoints:["src/lets-database-view/gantt/gantt-write.ts"],
    bundle:true,platform:"browser",format:"esm",target:"es2022",
    outfile:join(tmp,"native-writer.js"),logLevel:"silent"});
  await esbuild.build({entryPoints:["src/lets-database-view/gantt/gantt-model.ts"],
    bundle:true,platform:"browser",format:"esm",target:"es2022",
    outfile:join(tmp,"native-model.js"),logLevel:"silent"});
  const host=[
    '<!doctype html><meta charset="UTF-8">',
    '<iframe id="preview" src="./gantt-iframe.html" style="width:1350px;height:690px"></iframe>',
    '<pre id="result">WAITING</pre>',
    '<script type="module">',
    'import {saveGanttChange} from "./native-writer.js";',
    'import {makeGanttResult} from "./native-model.js";',
    'const result=document.getElementById("result");',
    'const frame=document.getElementById("preview");',
    'const precision='+precision+',scale='+JSON.stringify(scale)+';',
    'const externalMouse='+JSON.stringify(externalMouse)+';',
    'const avID="20261020101010-aaaaaaa",blockId="20261020101010-bbbbbbb";',
    'const viewID="20261020101010-ccccccc",itemID="20261020101010-ddddddd";',
    'const titleID="20261020101010-eeeeeee",dateID="20261020101010-fffffff";',
    'const progressID="20261020101010-ggggggg";',
    'const ts=(v)=>Date.parse(v);',
    'const originalStart=precision?"2026-11-01 09:00":"2026-11-01";',
    'const originalEnd=precision?"2026-11-01 11:00":"2026-11-04";',
    'const nextStart=precision?"2026-11-01 09:"+String(precision).padStart(2,"0"):"2026-11-02";',
    'const nextEnd=precision?"2026-11-01 11:"+String(precision).padStart(2,"0"):"2026-11-05";',
    'const dateCell={keyID:dateID,type:"date",date:{',
    '  content:ts("2026-11-01T"+(precision?"09:00:37.891":"00:00:00")),',
    '  content2:ts("2026-11-"+(precision?"01T11:00:59.123":"03T00:00:00")),',
    '  isNotTime:!precision,isNotEmpty:true,isNotEmpty2:true,hasEndDate:true}};',
    'const numberCell={keyID:progressID,type:"number",number:{content:25,isNotEmpty:true}};',
    'const raw={name:"Frappe mock AV",view:{columns:[',
    '  {id:titleID,name:"名称",type:"block"},{id:dateID,name:"日期",type:"date"},',
    '  {id:progressID,name:"进度",type:"number"}],rows:[{id:itemID,cells:[',
    '  {value:{keyID:titleID,type:"block",block:{content:"真实 Frappe / 模拟思源"}}},',
    '  {value:dateCell},{value:numberCell}]}]}};',
    'const config={fieldMapping:{title:titleID,start:dateID,end:"",',
    '  progress:progressID,group:"",color:""},timeStep:precision,progressMax:100};',
    'const snapshot=()=>makeGanttResult(raw,config).data[0];',
    'let phase=0,reads=0,writes=0,chart0=null,svg0=null,booted=false;',
    'let activeZoom=scale;',
    'const source=()=>{const task=snapshot();return {type:"dodoGanttData",',
    '  data:[{id:"dodo-group-0",text:"项目分组",type:"project",',
    '    start_date:task.start_date,end_date:task.end_date,progress:task.progress},',
    '    {...task,parent:"dodo-group-0"}],',
    '  timeStep:precision,zoom:activeZoom,editableDates:true,editableProgress:true,',
    '  revision:phase+1,sourceName:"模拟思源数据库"};};',
    'window.fetch=async(path,options)=>{',
    '  if(path!=="/api/av/renderAttributeView")throw Error("unexpected fetch "+path);',
    '  const body=JSON.parse(options.body);',
    '  if(body.id!==avID||body.blockID!==blockId||body.viewID!==viewID)',
    '    throw Error("Wrong reader args");',
    '  reads++;return {ok:true,json:async()=>({code:0,data:raw})};',
    '};',
    'function done(message){result.textContent=message;}',
    'function simulateDateMove(){',
    '  const fw=frame.contentWindow,chart=fw.__dodoChart;',
    '  if(!chart || !chart.get_task(itemID))throw Error("Frappe chart not loaded");',
    '  if(chart.options.snap_at!==(precision===15?"900s":precision===30?"1800s":"1d"))',
    '    throw Error("Frappe snap_at is wrong: "+chart.options.snap_at);',
    '  const idName={hour:"Hour",day:"Day",week:"Week",month:"Month"};',
    '  if(chart.config.view_mode.name!==idName[scale])throw Error("Wrong Frappe ruler");',
    '  if(fw.document.querySelectorAll(".dodo-frappe-grid .dodo-frappe-row").length!==2)',
    '    throw Error("Missing grouped sidebar rows");',
    '  if(fw.document.querySelectorAll(".dodo-frappe-grid .is-group").length!==1)',
    '    throw Error("Missing native SiYuan grouping in Frappe sidebar");',
    '  if(!fw.document.querySelector(".gantt-container .bar-wrapper"))',
    '    throw Error("Missing Frappe SVG bars");',
    '  const root=fw.document.getElementById("dodo-gantt-chart");',
    '  if(fw.document.querySelector(".dodo-gantt-footer")||',
    '    fw.document.body.textContent.includes("Frappe Gantt · MIT"))',
    '    throw Error("Visible Gantt footer still exists");',
    '  const status=fw.document.getElementById("dodo-gantt-status");',
    '  if(!status||status.getAttribute("role")!=="status"||',
    '    getComputedStyle(status).clipPath!=="inset(50%)"||',
    '    status.getBoundingClientRect().width!==1)',
    '    throw Error("Screen-reader status is not visually hidden");',
    '  if(fw.document.querySelector(".dodo-gantt-title")||',
    '    fw.document.querySelector(".dodo-gantt-demo-tag"))',
    '    throw Error("Removed Gantt heading is still visible");',
    '  const head=fw.document.querySelector(".dodo-gantt-header");',
    '  if(getComputedStyle(head).justifyContent!=="flex-end")',
    '    throw Error("Gantt toolbar is no longer right-aligned");',
    '  const zoomMenu=fw.document.getElementById("dodo-gantt-zoom");',
    '  if(!zoomMenu||zoomMenu.tagName!=="BUTTON"||',
    '    zoomMenu.textContent!==({hour:"小时",day:"日",week:"周",month:"月"})[scale]||',
    '    zoomMenu.getAttribute("aria-haspopup")!=="menu"||',
    '    fw.document.querySelector("select#dodo-gantt-zoom"))',
    '    throw Error("Gantt native Menu trigger missing, duplicated or wrong scale");',
    '  if(Math.abs(head.getBoundingClientRect().top-',
    '    fw.document.querySelector(".gantt-container .grid-header").getBoundingClientRect().top)>2||',
    '    head.getBoundingClientRect().height>50)',
    '    throw Error("Toolbar still consumes a separate header row");',
    '  const side=fw.document.getElementById("dodo-frappe-grid");',
    '  const control=fw.document.getElementById("dodo-gantt-grid-toggle");',
    '  const timeline=fw.document.getElementById("dodo-frappe-timeline");',
    '  if(!side||!control||control.getAttribute("aria-controls")!==side.id)',
    '    throw Error("Grid toggle target missing");',
    '  const beforeWidth=timeline.getBoundingClientRect().width;',
    '  const sideRect=side.getBoundingClientRect();',
    '  const controlRect=control.getBoundingClientRect();',
    '  if(beforeWidth<=0||Math.abs(sideRect.width-260)>2||',
    '    Math.abs(controlRect.x+controlRect.width/2-sideRect.right)>5)',
    '    throw Error("Expanded grid boundary / timeline invalid");',
    '  const columnTitles=[...side.querySelectorAll(".dodo-frappe-grid-head span")];',
    '  if(columnTitles.length!==1||columnTitles[0].textContent!=="任务名称"||',
    '    fw.document.querySelector(".dodo-frappe-date,.dodo-frappe-length")||',
    '    [...side.querySelectorAll(".dodo-frappe-row")].some(row=>row.children.length!==1))',
    '    throw Error("Left sidebar must contain task-name column only");',
    '  const today=fw.document.getElementById("dodo-gantt-today");',
    '  const prev=fw.document.getElementById("dodo-gantt-prev");',
    '  const next=fw.document.getElementById("dodo-gantt-next");',
    '  if(!prev||!next||today?.textContent!=="今天")',
    '    throw Error("Today and adjacent timeline navigation arrows missing");',
    '  const initialSvg=chart.$svg;',
    '  control.click();',
    '  if(getComputedStyle(side).display!=="none"||',
    '    !root.classList.contains("dodo-gantt-grid-hidden")||',
    '    control.title!=="显示表格"||control.getAttribute("aria-expanded")!=="false"||',
    '    control.getAttribute("aria-label")!=="显示表格"||',
    '    Math.abs(timeline.getBoundingClientRect().width-root.getBoundingClientRect().width)>2||',
    '    Math.abs(control.getBoundingClientRect().left-root.getBoundingClientRect().left-8)>2)',
    '    throw Error("Hiding grid failed to expand timeline and move toggle left");',
    '  control.click();',
    '  if(getComputedStyle(side).display==="none"||',
    '    root.classList.contains("dodo-gantt-grid-hidden")||',
    '    control.title!=="隐藏表格"||control.getAttribute("aria-expanded")!=="true"||',
    '    control.getAttribute("aria-label")!=="隐藏表格"||',
    '    Math.abs(timeline.getBoundingClientRect().width-beforeWidth)>2||',
    '    chart.$svg!==initialSvg)',
    '    throw Error("Showing grid failed to restore timeline without rerender");',
    '  if(scale==="hour"||scale==="day"){',
    '    const OriginalDate=fw.Date;',
    '    fw.Date=class extends OriginalDate {',
    '      constructor(...args){super(...(args.length?args:["2026-11-01T09:42:00"]));}',
    '    };',
    '    try{fw.document.getElementById("dodo-gantt-today").click();}',
    '    finally{fw.Date=OriginalDate;}',
    '    const line=fw.document.querySelector(".dodo-gantt-now-line");',
    '    const dot=fw.document.querySelector(".dodo-gantt-now-dot");',
    '    const label=fw.document.querySelector(".dodo-gantt-now-label");',
    '    if(!line||!dot||!label||label.textContent!=="09:42")',
    '      throw Error("Hour/day today marker lacks precise 09:42 label");',
    '    const now=new OriginalDate("2026-11-01T09:42:00");',
    '    const millis=chart.config.unit==="hour"?3600000:86400000;',
    '    const want=(now-chart.gantt_start)/(millis*chart.config.step)*chart.config.column_width;',
    '    if(Math.abs(parseFloat(line.style.left)-want)>0.05||',
    '      Math.abs(parseFloat(dot.style.left)-want)>0.05||',
    '      Math.abs(parseFloat(label.style.left)-want)>0.05||',
    '      fw.getComputedStyle(line).backgroundColor!=="rgb(232, 91, 84)"||',
    '      fw.getComputedStyle(label).color!=="rgb(232, 91, 84)")',
    '      throw Error("Exact today line/dot/label are not aligned and red");',
    '    const oldSvg=chart.$svg,oldCount=chart.tasks.length;',
    '    fw.Date=class extends OriginalDate {',
    '      constructor(...args){super(...(args.length?args:["2026-11-09T09:42:00"]));}',
    '    };',
    '    try{fw.document.getElementById("dodo-gantt-today").click();}',
    '    finally{fw.Date=OriginalDate;}',
    '    if(!fw.document.querySelector(".dodo-gantt-now-label")||',
    '      fw.document.querySelector(".dodo-gantt-now-label").textContent!=="09:42"||',
    '      chart.$svg!==oldSvg||chart.tasks.length!==oldCount||',
    '      chart.gantt_end<new OriginalDate("2026-11-09T09:42:00"))',
    '      throw Error("Today outside task range failed to extend ruler safely");',
    '  }else if(fw.document.querySelector(".dodo-gantt-now-line")){',
    '    throw Error("Day-level precise current time must be hidden in week/month view");',
    '  }',
    '  chart0=chart;svg0=chart.$svg;',
    '  const t=chart.get_task(itemID);',
    '  const shift=precision?precision*60000:86400000;',
    '  const start=new Date(t._start.getTime()+shift);',
    '  const end=new Date(t._end.getTime()+shift);',
    '  t._start=start;t._end=end;',
    '  chart.options.on_date_change(t,start,new Date(end.getTime()-1000));',
    '  chart.options.on_date_change(t,start,new Date(end.getTime()-1000));',
    '  if(writes!==0)throw Error("Moved bar saved before mouseup");',
    '  fw.document.querySelector(".gantt-container svg").dispatchEvent(',
    '    new fw.MouseEvent("mouseup",{bubbles:true}));',
    '}',
    'function boot(){',
    '  if(booted)return;booted=true;',
    '  frame.contentWindow.postMessage(source(),location.origin);',
    '  if(!externalMouse)setTimeout(()=>{try{simulateDateMove()}',
    '    catch(e){done("ERROR: "+String(e))}},450);',
    '}',
    'frame.addEventListener("load",()=>setTimeout(boot,70));',
    'window.addEventListener("message",async(event)=>{',
    '  if(event.source!==frame.contentWindow||event.origin!==location.origin)return;',
    '  const message=event.data||{};',
    '  if(message.type==="dodoGanttReady"){',
    '    boot();',
    '  }else if(message.type==="dodoGanttSetTimeStep" && phase===4){',
    '    const wanted=scale==="hour"?"day":"hour";',
    '    if(message.timeStep!==15||message.zoom!==wanted){',
    '      done("ERROR: wrong hour/day switch step "+JSON.stringify(message));return;',
    '    }',
    '    phase=5;activeZoom=wanted;',
    '    frame.contentWindow.postMessage({type:"dodoGanttTimeStepSaved",',
    '      requestId:message.requestId,success:true},location.origin);',
    '    frame.contentWindow.postMessage(source(),location.origin);',
    '    setTimeout(()=>{',
    '      const chart=frame.contentWindow.__dodoChart;',
    '      if(chart!==chart0 || chart.$svg!==svg0)',
    '        done("ERROR: changing hour/day caused a new Frappe instance");',
    '      else if(chart.config.view_mode.name!==',
    '        (wanted==="day"?"Day":"Hour") || chart.options.snap_at!=="900s")',
    '        done("ERROR: chart ruler/precision was not changed");',
    '      else done("PASS: Chrome Frappe 15min hour/day zoom, writes, groups, same SVG");',
    '    },200);',
    '  }else if(message.type==="dodoGanttEdit"){',
    '    if(phase===0&&!chart0){',
    '      chart0=frame.contentWindow.__dodoChart;',
    '      svg0=chart0?.$svg;',
    '    }',
    '    if(phase===0){',
    '      if(message.kind!=="dates"||message.before.start_date!==originalStart||',
    '        message.before.end_date!==originalEnd||message.after.start_date!==nextStart||',
    '        message.after.end_date!==nextEnd||typeof message.before.start_date!=="string"){',
    '        done("ERROR: Date wire mismatch "+JSON.stringify(message));return;',
    '      }',
    '    }else if(phase===2){',
    '      if(message.kind!=="progress"||message.after.progress!==.6){',
    '        done("ERROR: Progress wire mismatch "+JSON.stringify(message));return;',
    '      }',
    '    }else{done("ERROR: Duplicate/unexpected save");return;}',
    '    try{',
    '      await saveGanttChange({avID,blockId,viewID},config,message,',
    '        async(path,body)=>{',
    '          if(path!=="/api/av/setAttributeViewBlockAttr"||body.itemID!==itemID||',
    '             body.avID!==avID)throw Error("Wrong native AV writer");',
    '          if(message.kind==="dates"){',
    '            if(body.keyID!==dateID || body.value.type!=="date")',
    '              throw Error("Date writer did not target date keyID");',
    '            const nativeDate=body.value.date;',
    '            if(nativeDate.content%60000!==0||',
    '              nativeDate.content2%60000!==0)',
    '              throw Error("SiYuan date write contains hidden seconds/milliseconds");',
    '            if(nativeDate.isNotTime!==!precision)',
    '              throw Error("SiYuan isNotTime flag wrong");',
    '            const expectedStart=ts(nextStart.replace(" ","T")+(precision?":00":"T00:00:00"));',
    '            if(nativeDate.content!==expectedStart)',
    '              throw Error("Native table local time differs from Gantt start");',
    '            dateCell.date=nativeDate;',
    '          }else{',
    '            if(body.keyID!==progressID || body.value.number.content!==60)',
    '              throw Error("Progress writer payload mismatch");',
    '            numberCell.number=body.value.number;',
    '          }writes++;',
    '        });',
    '      phase=phase===0?1:3;',
    '      frame.contentWindow.postMessage({type:"dodoGanttSaveResult",',
    '        requestId:message.requestId,success:true},location.origin);',
    '    }catch(e){done("ERROR: Native AV writer "+String(e))}',
    '  }else if(message.type==="dodoGanttReload"&&(phase===1||phase===3)){',
    '    if(phase===1){',
    '      phase=2;frame.contentWindow.postMessage(source(),location.origin);',
    '      setTimeout(()=>{',
    '        try{',
    '          const fw=frame.contentWindow,c=fw.__dodoChart;',
    '          if(c!==chart0||c.$svg!==svg0)throw Error("Frappe full redraw after native AV save");',
    '          if(reads!==1||writes!==1)throw Error("Date save/read count mismatch");',
    '          const bar=c.get_task(itemID);',
    '          if(!bar||bar.progress!==25)throw Error("Task lost after reload");',
    '          c.options.on_progress_change(bar,60);',
    '        }catch(e){done("ERROR: "+String(e))}',
    '      },140);',
    '    }else{',
    '      phase=4;frame.contentWindow.postMessage(source(),location.origin);',
    '      setTimeout(()=>{',
    '        const c=frame.contentWindow.__dodoChart;',
    '        if(c!==chart0||c.$svg!==svg0)done("ERROR: Frappe replaced SVG after progress");',
    '        else if(reads!==2||writes!==2||c.get_task(itemID)?.progress!==60)',
    '          done("ERROR: Frappe progress write/reload mismatch");',
    '        else{',
    '          const button=frame.contentWindow.document.querySelector(".dodo-frappe-expand");',
    '          if(!button)throw Error("Missing group toggle");',
    '          button.click();',
    '          if(frame.contentWindow.__dodoChart.tasks.length!==1)',
    '            throw Error("Group collapse did not hide child task");',
    '          frame.contentWindow.document.querySelector(".dodo-frappe-expand").click();',
    '          if(frame.contentWindow.__dodoChart.tasks.length!==2)',
    '            throw Error("Group expand did not restore child task");',
    '          if(precision===15 && (scale==="hour"||scale==="day")){',
    '            const target=scale==="hour"?"day":"hour";',
    '            const menu=frame.contentWindow.document.getElementById("dodo-gantt-zoom");',
    '            if(!menu||menu.tagName!=="BUTTON")throw Error("Missing native Menu button");',
    '            menu.click();',
    '            frame.contentWindow.postMessage({type:"dodoGanttChangeZoom",zoom:target},location.origin);',
    '          }else{',
    '            done("PASS: Chrome Frappe "+precision+"min "+scale+',
    '              " 2 native AV saves + no SVG rebuild + group collapse");',
    '          }',
    '        }',
    '      },180);',
    '    }',
    '  }',
    '});',
    'setTimeout(()=>{if(result.textContent==="WAITING"){',
    '  const f=frame.contentWindow;',
    '  done("ERROR: test timed out; booted="+booted+" iframe="+',
    '    f?.document?.getElementById("dodo-gantt-status")?.textContent+',
    '    " bars="+f?.document?.querySelectorAll(".bar-wrapper")?.length);',
    '}},'+(externalMouse?15000:6500)+');',
    '</script>',
  ].join("\n");
  writeFileSync(join(tmp,"host.html"),host,"utf8");
  server=createServer((request,response)=>{
    const file=(request.url||"").split("?")[0].slice(1);
    if(!/^[\w.-]+$/.test(file)){response.writeHead(404);response.end();return;}
    try{
      const bytes=readFileSync(join(tmp,file));
      response.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript":
        file.endsWith(".css")?"text/css":"text/html"});
      response.end(bytes);
    }catch{response.writeHead(404);response.end();}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);});
  if(externalMouse){
    const url="http://127.0.0.1:"+server.address().port+"/host.html";
    const result=await new Promise((resolve,reject)=>{
      const process=spawn("python",[tooltipMode
        ? "scripts/test-frappe-handle-tooltip.py"
        : "scripts/test-frappe-playwright.py",url,
        String(precision),scale,...(tooltipLeft?["left"]:[])],{windowsHide:true});
      let stdout="",stderr="";
      process.stdout.on("data",chunk=>stdout+=chunk.toString());
      process.stderr.on("data",chunk=>stderr+=chunk.toString());
      const timer=setTimeout(()=>process.kill(),65000);
      process.on("error",reject);
      process.on("close",code=>{clearTimeout(timer);
        resolve({exit:code,stdout,stderr});});
    });
    if(result.exit!==0||!result.stdout.includes("PASS:")){
      throw Error("Real Playwright mouse regression: "+result.stdout+" "+result.stderr);
    }
    console.log(result.stdout.trim());
    process.exitCode=0;
  }else{
  const result=await new Promise((resolve,reject)=>{
    const process=spawn(chrome,["--headless=new","--disable-gpu",
      "--disable-background-networking","--no-first-run",
      "--user-data-dir="+join(tmp,"profile"),"--virtual-time-budget=8500",
      "--dump-dom","http://127.0.0.1:"+server.address().port+"/host.html"],
      {windowsHide:true});
    let stdout="",stderr="";
    process.stdout.on("data",data=>{stdout+=data.toString();});
    process.stderr.on("data",data=>{stderr+=data.toString();});
    const timer=setTimeout(()=>process.kill(),55000);
    process.on("error",reject);
    process.on("close",exit=>{clearTimeout(timer);resolve({exit,stdout,stderr});});
  });
  const match=result.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  if(!match)throw Error("Missing host result: "+result.stderr.slice(-400)+
    " "+result.stdout.slice(-1200));
  const message=match[1].replaceAll("&quot;",'"').replaceAll("&amp;","&");
  if(!message.startsWith("PASS:"))throw Error(message);
  console.log(message);
  }
}finally{
  if(server)server.close();
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
  catch(error){console.warn("Cleanup failure:",String(error));}
}
