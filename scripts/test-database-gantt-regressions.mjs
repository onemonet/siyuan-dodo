import { databaseViewTestRuntime } from "./database-view-test-runtime.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const esbuild=require(require.resolve("esbuild",{paths:[require.resolve("vite")]}));
const service=readFileSync("src/lets-database-view/visual/visual-view-service.ts","utf8");
const handler = "";
const handlerSource=readFileSync("src/lets-database-view/gantt/gantt-interaction.ts","utf8")
  .replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"")
  .replace(/^const ID = .*;\s*$/gm,"");
const mount=service.slice(service.indexOf("  private attach(av: HTMLElement"),
  service.indexOf("  private getSearch(av: HTMLElement)"));
const picker=service.slice(service.indexOf("  private ensurePicker(av: HTMLElement"),
  service.indexOf("  private async openPicker("));
const typography=service.slice(service.indexOf("  private ganttTypography(av:HTMLElement)"),
  service.indexOf("  private liveAvForGantt("));
assert.ok(handlerSource.includes("dodoGanttEdit") &&
  service.includes("visualInteractions") && mount.includes("private detach"),
  "Gantt message protocol and mount remain registered");
const hostCode=(await esbuild.transform(`${await databaseViewTestRuntime()}

const ACTIVE="dodo-av-visual--active";
const ID=/^\\d{14}-[a-z0-9]{7}$/;
const openMapItem=async()=>{};
const showMessage=()=>{};
const databaseViewWrites={subscribe:()=>()=>{},run:async (_ctx,op)=>op()};
const createCalendarMessageHandler=()=>()=>{};
${handlerSource}
const PICKER="dodo-av-view-picker";
const SETTINGS="dodo-av-view-settings";
const normalizePreviewHeight=value=>value||520;
const timelinePreviewHeight=value=>value||520;
class HeightHost {
  running=true;
  lifecycle=new ViewMountLifecycle(entry=>entry.frame,(av,entry)=>this.cleanupMount(av,entry));
  mounted=this.lifecycle.entries; cached=new Map(); refreshing=new Map();
  currentView(header){return header.dataset.currentViewId;}
  getSearch(){return "";} scheduleFrame(){} renderGantt(){}
  renderers={gantt:av=>this.renderGantt(av),calendar:()=>{},chart:()=>{},timeline:()=>{}};
  isMapEnabled(){return true;} isChartEnabled(){return true;}
  isTimelineEnabled(){return true;} isGanttEnabled(){return true;}
  openPicker(){} openSettings(blockId,viewId){this.lastSettings=[blockId,viewId];}
  ${picker}
  ${typography}
  ${handler}
  ${mount}
}
window.HeightHost=HeightHost;
`,{loader:"ts",target:"es2020"})).code;

const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
assert.ok(chrome, "A Chromium browser is required");
const tempRoot = resolve(tmpdir());
const profile = mkdtempSync(join(tempRoot, "dodo-gantt-regressions-"));
assert.ok(resolve(profile).startsWith(tempRoot + sep));
const root = process.env.GANTT_ASSET_ROOT||"src/lets-database-view/gantt/iframe/";
const legacyClient=process.argv.includes("--legacy-client");
const hostCSS=readFileSync("src/lets-database-view/database-view.css","utf8");
const checks = String.raw`
const legacyClient=LEGACY_CLIENT;
const av=document.querySelector(".av"), heightHost=new window.HeightHost();
av.querySelector(".av__scroll").innerHTML='<div class="av__row"><div class="av__cell" data-dtype="block"><span class="av__celltext">思源表格条目</span></div></div>';
const nativeText=av.querySelector('.av__celltext');
const actualNativeStyle=getComputedStyle(nativeText);
const inferredTypography=heightHost.ganttTypography(av);
if(inferredTypography.fontSize!==actualNativeStyle.fontSize||
   inferredTypography.fontFamily!==actualNativeStyle.fontFamily||
   inferredTypography.fontWeight!==actualNativeStyle.fontWeight||
   inferredTypography.color!==actualNativeStyle.color||
   inferredTypography.fontSize!=="14px")
  throw Error("Native table typography was not correctly captured: "+JSON.stringify(inferredTypography));
av.querySelector(".av__header").dataset.currentViewId="";
heightHost.attach(av,av.dataset.nodeId,"gantt-view","gantt");
const toolbar=av.querySelector(".av__header"), avTools=toolbar.querySelector(".av__views");
heightHost.ensurePicker(av,toolbar,av.dataset.nodeId);
heightHost.ensureSettingsButton(av,toolbar,av.dataset.nodeId,"gantt");
const viewPicker=avTools.querySelector(".dodo-av-view-picker");
let viewSettings=avTools.querySelector(".dodo-av-view-settings");
if(!viewPicker||!viewSettings||viewSettings.previousElementSibling!==viewPicker||
   viewSettings.nextElementSibling?.dataset.type!=="av-filter")
  throw Error("View settings not immediately right of view picker, before native filter");
if(viewSettings.title!=="甘特视图设置" ||
   document.querySelector(".dodo-av-visual-actions"))
  throw Error("Settings overlay still exists or toolbar label is incorrect");
toolbar.dataset.currentViewId="gantt-view";
viewSettings.click();
if(heightHost.lastSettings?.[0]!==av.dataset.nodeId||
   heightHost.lastSettings?.[1]!=="gantt-view")
  throw Error("Toolbar settings failed to open current Gantt view config");
heightHost.ensurePicker(av,toolbar,av.dataset.nodeId);
heightHost.ensureSettingsButton(av,toolbar,av.dataset.nodeId,"chart");
if(avTools.querySelectorAll(".dodo-av-view-settings").length!==1 ||
   viewSettings.title!=="图表视图设置")
  throw Error("Reusing toolbar settings for another view failed");
heightHost.ensureSettingsButton(av,toolbar,av.dataset.nodeId,undefined);
if(avTools.querySelector(".dodo-av-view-settings"))
  throw Error("Settings must disappear when returning to table view");
heightHost.ensureSettingsButton(av,toolbar,av.dataset.nodeId,"gantt");
avTools.innerHTML='<button data-type="av-filter">筛选</button>';
heightHost.ensurePicker(av,toolbar,av.dataset.nodeId);
heightHost.ensureSettingsButton(av,toolbar,av.dataset.nodeId,"gantt");
viewSettings=avTools.querySelector(".dodo-av-view-settings");
if(!viewSettings||viewSettings.previousElementSibling?.classList.contains("dodo-av-view-picker")!==true||
   avTools.querySelectorAll(".dodo-av-view-settings").length!==1)
  throw Error("Rebuilt SiYuan toolbar did not restore settings adjacent to picker");
const frame = document.querySelector("iframe"), result = document.querySelector("pre");
frame.style.width="1300px";
let edits = [], opens = [], booted = false;
const tick = () => new Promise(resolve => requestAnimationFrame(()=>setTimeout(resolve,60)));
const check = (condition, message) => { if (!condition) throw Error(message); };
const task = {id:"20261020101010-ddddddd",text:"review",
  start_date:"2026-10-20",end_date:"2026-10-23",progress:.35};
const data = (item=task, extra={}) => ({data:[item],timeStep:0,zoom:"week",
  editableDates:true,editableProgress:true,revision:1,...extra});
window.addEventListener("message", event => {
  if (event.source !== frame.contentWindow) return;
  if (event.data?.type === "dodoGanttOpenItem") opens.push(event.data);
  if (event.data?.type === "dodoGanttEdit") {
    edits.push(event.data);
    frame.contentWindow.postMessage({type:"dodoGanttSaveResult",
      requestId:event.data.requestId,success:true}, location.origin);
  }
  if (event.data?.type === "dodoGanttReady" && !booted) {
    booted = true;
    setTimeout(() => run().catch(error => result.textContent = "FAIL: " + error.stack), 50);
  }
});
async function run() {
  const w=frame.contentWindow, probe=w.__ganttProbe, d=w.document;
  check(frame.offsetHeight>0,"Loaded Gantt is collapsed to zero height when the client sends no resize message");
  const content=d.querySelector(".dodo-gantt-preview");
  check(content.getBoundingClientRect().height<=frame.clientHeight+1,"Startup content must fit even while native view metadata is unavailable");
  const lastBar=[...d.querySelectorAll(".bar")].at(-1);
  check(lastBar && lastBar.getBoundingClientRect().bottom<=frame.clientHeight,"Loaded tasks must be visible, not only the toolbar");
  av.querySelector(".av__header").dataset.currentViewId="gantt-view";
  if(legacyClient){result.textContent="PASS: Gantt startup stays visible without child resize messages";return;}
  const errors=[];
  w.addEventListener("error",event=>errors.push(event.message));
  const start=d.getElementById("dodo-gantt-edit-start");
  const end=d.getElementById("dodo-gantt-edit-end");
  const progress=d.getElementById("dodo-gantt-edit-progress");
  const form=d.getElementById("dodo-gantt-edit-form");
  const editor=d.getElementById("dodo-gantt-editor");
  const save=d.getElementById("dodo-gantt-edit-save");
  const cancel=() => d.getElementById("dodo-gantt-edit-cancel").click();
  const checkHighlight=()=>{
    const bar=probe.getChart().get_bar(task.id);
    const pills=[...d.querySelectorAll('.date-range-highlight')].filter(el=>
      el.classList.contains('highlight-'+task.id));
    check(pills.length===1&&pills[0]===bar.$date_highlight,
      'Date capsule has '+pills.length+' stale copies after refresh');
    const actual=bar.$bar.getBoundingClientRect();
    const wasHidden=bar.$date_highlight.classList.contains("hide");
    bar.$date_highlight.classList.remove("hide");
    const pill=bar.$date_highlight.getBoundingClientRect();
    if(wasHidden)bar.$date_highlight.classList.add("hide");
    check(Math.abs(pill.left-actual.left)<2&&Math.abs(pill.right-actual.right)<2,
      "Date capsule does not align with task: bar="+actual.left+".."+actual.right+
      " pill="+pill.left+".."+pill.right);
  };
  // Progress 0%, near-zero and 100% previously made its circle overlap a
  // left/right date resize handle. Check real SVG pointer hit targets.
  for(const value of [0,.02,1]){
    probe.loadNative(data({...task,progress:value}));
    checkHighlight();
    const b=probe.getChart().get_bar(task.id);
    const left=b.group.querySelector(".handle.left");
    const right=b.group.querySelector(".handle.right");
    const progress=b.group.querySelector(".handle.progress");
    check(left&&right&&progress,"Resize/progress handles are missing");
    const l=left.getBoundingClientRect(),r=right.getBoundingClientRect();
    const p=progress.getBoundingClientRect();
    check(l.width>=7&&r.width>=7,"Date resize handles are too narrow");
    check(p.bottom+0.5<Math.min(l.top,r.top),
      "Progress knob overlaps the date resize hit area at "+value);
    const hit=box=>d.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    check(hit(l)===left,"Left edge hit target is not the date handle at "+value);
    check(hit(r)===right,"Right edge hit target is not the date handle at "+value);
    check(hit(p)===progress,"Progress remains independently draggable at "+value);
  }
  const linked={...task,blockId:"20261020101010-eeeeeee",valueId:"20261020101010-fffffff"};
  probe.loadNative(data(linked));
  const sidebar=d.querySelector('.dodo-frappe-row .dodo-frappe-text');
  check(d.querySelectorAll('.dodo-frappe-grid-head span').length===1&&
    d.querySelector('.dodo-frappe-grid-head span').textContent==='任务名称'&&
    d.querySelectorAll('.dodo-frappe-date,.dodo-frappe-length').length===0,
    'Native Gantt sidebar must only display the name column and header');
  const sidebarRow=sidebar.closest('.dodo-frappe-row');
  check(sidebarRow.getAttribute('role')==='link', 'Whole bound AV row must be a link');
  const sidebarBlank=sidebar.closest('.dodo-frappe-name');
  sidebarBlank.click();await new Promise(done=>setTimeout(done,320));
  check(opens.length===1&&opens[0].id===task.id,
    'Clicking blank space in sidebar row did not navigate by AV item ID');
  sidebar.click();sidebar.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));
  await new Promise(done=>setTimeout(done,320));
  check(opens.length===1&&!d.getElementById('dodo-gantt-editor').hidden,
    'Double-click must edit without also opening the AV record');
  cancel();
  const bar=probe.getChart().get_bar(task.id),barGroup=bar.group;
  const barLabel=barGroup.querySelector('.bar-label');
  const taskRect=bar.$bar;
  check(barGroup.getAttribute('role')==='link','Whole Gantt bar is not keyboard accessible');
  barGroup.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await tick();
  check(opens.length===2&&opens[1].id===task.id,'Enter on task bar should open AV item');
  const rect=taskRect.getBoundingClientRect(),x=rect.left+30,y=rect.top+rect.height/2;
  const dispatch=(target,type,px=x,py=y)=>target.dispatchEvent(new w.MouseEvent(type,
    {bubbles:true,clientX:px,clientY:py,button:0}));
  dispatch(taskRect,'mousedown');dispatch(taskRect,'mouseup');dispatch(taskRect,'click');
  await new Promise(done=>setTimeout(done,320));
  check(opens.length===3&&opens[2].id===task.id,'Clicking task rectangle away from text should open AV item');
  check(getComputedStyle(barLabel).textDecorationLine==='none'&&
    getComputedStyle(sidebar).textDecorationLine==='none',
    'Task labels must have no underline');
  const progressHandle=barGroup.querySelector('.handle.progress');
  dispatch(progressHandle,'mousedown');dispatch(progressHandle,'mouseup');dispatch(progressHandle,'click');
  await new Promise(done=>setTimeout(done,320));
  check(opens.length===3,'Progress handle clicks must not open AV items');
  dispatch(taskRect,'mousedown');
  dispatch(w,'mousemove',x+20,y);
  dispatch(taskRect,'mouseup',x+20,y);
  dispatch(taskRect,'click',x+20,y);
  await new Promise(done=>setTimeout(done,320));
  check(opens.length===3,'Dragging the bar must never open AV items');
  const next=d.getElementById('dodo-gantt-next'),prev=d.getElementById('dodo-gantt-prev');
  const scrollArea=probe.getChart().$container;
  const originalScrollTo=scrollArea.scrollTo,positions=[];
  scrollArea.scrollTo=opts=>positions.push(opts.left);
  next.click();prev.click();scrollArea.scrollTo=originalScrollTo;
  check(positions.length===2&&positions[0]>scrollArea.scrollLeft&&
    positions[1]===Math.max(0,scrollArea.scrollLeft-
      Math.max(probe.getChart().config.column_width,Math.round(scrollArea.clientWidth*.8))),
    'Previous/next arrows must pan the timeline without changing data');
  check(d.getElementById('dodo-gantt-today').textContent==='今天',
    'Today control should be short and unambiguous');
  probe.loadNative(data());probe.openEditor(task.id);
  checkHighlight();
  const nativeTypography={fontFamily:'Arial',fontSize:'14px',fontWeight:'400',color:'rgb(34, 34, 34)'};
  probe.loadNative(data(task,{typography:nativeTypography}));
  for(const elem of [probe.getChart().get_bar(task.id).group.querySelector('.bar-label'),
    d.querySelector('.dodo-frappe-row .dodo-frappe-text')]){
    const s=getComputedStyle(elem),isSvg=elem instanceof w.SVGElement;
    check(s.fontSize==='14px'&&s.fontWeight==='400'&&s.fontFamily.includes('Arial')&&
      (isSvg?s.fill:s.color)==='rgb(34, 34, 34)',
      'Task text does not match native SiYuan typography: '+elem.className+' '+JSON.stringify({fontSize:s.fontSize,weight:s.fontWeight,font:s.fontFamily,color:s.color,fill:s.fill,svg:isSvg}));
  }
  // Simulate a SiYuan theme and editor font change while preserving the view.
  probe.loadNative(data(task,{typography:{fontFamily:'Georgia',fontSize:'18px',
    fontWeight:'600',color:'rgb(20, 40, 60)'}}));
  for(const elem of [probe.getChart().get_bar(task.id).group.querySelector('.bar-label'),
    d.querySelector('.dodo-frappe-row .dodo-frappe-text')]){
    const s=getComputedStyle(elem),isSvg=elem instanceof w.SVGElement;
    check(s.fontSize==='18px'&&s.fontWeight==='600'&&s.fontFamily.includes('Georgia')&&
      (isSvg?s.fill:s.color)==='rgb(20, 40, 60)',
      'Task text did not follow updated native theme/editor typography');
  }
  probe.loadNative(data());
  const longName='这里是一条长度明显超过甘特任务条的完整任务名称，用于检查文字不截断且保持左对齐';
  probe.loadNative(data({...task,text:longName}));
  await tick();
  const nameBar=probe.getChart().get_bar(task.id);
  const nameLabel=nameBar.group.querySelector('.bar-label');
  check(nameLabel.textContent===longName,'Full task name is truncated');
  check(nameLabel.getBBox().width>nameBar.$bar.getWidth(),
    'Long text fixture must exceed bar width');
  check(Math.abs(nameLabel.getX()-nameBar.$bar.getX()-12)<1,
    'Task label is not left-anchored at 12px: '+nameLabel.getX()+' vs '+nameBar.$bar.getX());
  check(getComputedStyle(nameLabel).fontSize==='14px',
    'Task text is not rendered at SiYuan default 14px');
  checkHighlight();
  const chartScroll=probe.getChart().$container;
  chartScroll.scrollLeft+=130;
  chartScroll.dispatchEvent(new Event('scroll'));
  check(Math.abs(nameLabel.getX()-nameBar.$bar.getX()-12)<1,
    'Horizontal scroll moved text independently of task');
  checkHighlight();
  probe.loadNative(data());
  check(form.checkValidity(), "Default day editor rejects its native dates");
  end.value="2026-10-24";save.click();await tick();
  check(edits.length===1 && edits[0].kind==="dates", "Day editor must submit date changes");

  edits=[];
  probe.loadNative(data({...task,progress:.355}));probe.openEditor(task.id);
  check(form.checkValidity(), "Fractional progress must pass native input validation");
  save.click();await tick();
  check(edits.length===0, "Saving untouched 35.5% progress must not write 36%");
  probe.openEditor(task.id);start.value="2026-10-21";save.click();await tick();
  check(edits.length===1 && edits[0].kind==="dates" && edits[0].after.progress===.355,
    "Date-only edit must retain fractional progress");

  edits=[];
  const minute={...task,start_date:"2026-10-20 09:10",end_date:"2026-10-20 10:10"};
  probe.loadNative(data(minute,{timeStep:15,zoom:"hour"}));probe.openEditor(task.id);
  check(form.checkValidity(), "Native minute dates need not align to drag snap");
  progress.value="60";save.click();await tick();
  check(edits.length===1 && edits[0].kind==="progress", "Minute editor can save progress alone");

  probe.loadNative(data());
  const chart=probe.getChart(), svg=chart.$svg;
  for (const year of [2027,2025]) {
    probe.loadNative(data({...task,start_date:year+"-10-20",end_date:year+"-10-23"}));
    const bar=chart.get_bar(task.id).$bar, width=Number(svg.getAttribute("width"));
    check(probe.getChart()===chart && chart.$svg===svg, "Range expansion must reuse chart and SVG");
    check(bar.getX()>=0 && bar.getEndX()<=width, "Moved task is outside the scrollable axis");
  }

  edits=[];
  probe.loadNative(data());probe.openEditor(task.id);start.value="2026-10-21";
  probe.loadNative(data({...task,progress:.6},{revision:2}));
  check(!editor.hidden && start.value==="2026-10-21", "Refresh discarded the edit draft");
  save.click();await tick();
  check(edits.length===1 && edits[0].kind==="dates" && edits[0].revision===2 &&
    edits[0].before.progress===.35, "Draft must keep its original snapshot and current revision");
  probe.loadNative(data());probe.openEditor(task.id);start.value="2026-10-21";
  probe.loadNative(data({...task,start_date:"2026-10-19"},{revision:3}));
  save.click();await tick();
  check(edits.length===2 && edits[1].before.start_date==="2026-10-20",
    "Concurrent date refresh must not replace the snapshot used for conflict detection");

  probe.loadNative(data());probe.openEditor(task.id);start.value="2026-10-21";
  probe.loadNative(data(minute,{timeStep:15,zoom:"hour"}));
  check(!editor.hidden && start.value==="2026-10-21" && save.disabled,
    "Precision change must preserve the draft and block a mismatched submission");
  cancel();probe.loadNative(data());probe.openEditor(task.id);start.value="2026-10-21";
  probe.loadNative(data(task,{fieldMapping:{start:"another-date-column"}}));
  check(!editor.hidden && start.value==="2026-10-21" && save.disabled,
    "Mapping change must not redirect an existing draft to another native column");
  cancel();probe.loadNative(data());probe.openEditor(task.id);
  probe.loadNative(data(task,{data:[]}));
  check(!editor.hidden && save.disabled, "Removed task must retain its draft without allowing writes");
  cancel();probe.loadNative(data());await tick();
  const small=frame.offsetHeight;
  check(Math.abs(small-d.querySelector(".dodo-gantt-preview").offsetHeight)<=1,
    "Parent iframe must fit its natural content height");
  const tasks=Array.from({length:40},(_,i)=>({...task,id:"20261020101010-"+String(i).padStart(7,"0")}));
  probe.loadNative(data(task,{data:tasks}));await tick();
  const large=frame.offsetHeight;
  check(large>small+1500, "Many tasks must grow beyond the former fixed/max height");
  check(probe.getChart().$container.clientHeight>=probe.getChart().grid_height,
    "Horizontal scrollbar must not clip the final task row");
  heightHost.attach(av,av.dataset.nodeId,"gantt-view","gantt");
  check(frame.offsetHeight===large, "Host scans must preserve the measured height");
  probe.openEditor(tasks[0].id);
  const panel=form.getBoundingClientRect(), frameTop=frame.getBoundingClientRect().top;
  check(frameTop+panel.top>=0 && frameTop+panel.bottom<=window.innerHeight,
    "Editor must remain in the visible viewport when iframe grows tall");
  cancel();
  const group={...task,id:"review-group",type:"project"};
  probe.loadNative(data(task,{data:[group,...tasks.map(t=>({...t,parent:group.id}))]}));await tick();
  d.querySelector(".dodo-frappe-expand").click();await tick();
  check(frame.offsetHeight<small+100, "Collapsed groups must shrink the iframe");
  d.querySelector(".dodo-frappe-expand").click();await tick();
  check(frame.offsetHeight>large, "Expanded groups must grow the iframe");
  probe.loadNative(data(task,{data:[]}));await tick();
  check(frame.offsetHeight<small, "Empty views must shrink too");
  document.body.style.width="520px";
  // Chromium virtual time can defer iframe resize events; exercise the
  // production resize handler after the actual narrow layout is applied.
  d.querySelector(".dodo-gantt-preview").getBoundingClientRect();
  w.dispatchEvent(new w.Event("resize"));await tick();
  check(Math.abs(frame.offsetHeight-d.querySelector(".dodo-gantt-preview").offsetHeight)<=1,
    "Wrapped headers must still fit the iframe height: "+frame.offsetHeight+" / "+
      d.querySelector(".dodo-gantt-preview").offsetHeight+"; errors="+errors.join("; "));
  document.body.style.width="";
  d.querySelector(".dodo-gantt-preview").getBoundingClientRect();
  w.dispatchEvent(new w.Event("resize"));await tick();
  for (const [item,extra] of [[task,{}],[minute,{timeStep:15,zoom:"hour"}]]) {
    probe.loadNative(data(item,extra));await tick();
    const chart=probe.getChart(), bar=chart.get_bar(task.id);
    chart.$container.scrollLeft=Math.max(0,bar.$bar.getX()-300);
    for (const edge of ["left","right"]) {
      const handle=bar.group.querySelector(".handle."+edge);
      handle.dispatchEvent(new w.MouseEvent("mouseover",{bubbles:true}));
      const hint=d.getElementById("dodo-frappe-date-hint"), box=hint.getBoundingClientRect();
      const rect=bar.$bar.getBoundingClientRect();
      check(!hint.hidden && Math.abs(box.top+box.height/2-rect.top-rect.height/2)<=1,
        "Edge date hints must share the bar's vertical center");
      check(edge==="left"?box.right<=rect.left-6:box.left>=rect.right+6,
        "Start date belongs outside the left edge; end date outside the right edge");
      handle.dispatchEvent(new w.MouseEvent("mouseout",{bubbles:true}));
      check(hint.hidden,"Leaving a handle must hide its date hint");
    }
  }
  probe.getChart().get_bar(task.id).group.querySelector(".handle.right")
    .dispatchEvent(new w.MouseEvent("mouseover",{bubbles:true}));
  check(!errors.length,"Unexpected iframe errors: "+errors.join("; "));
  result.textContent="PASS: editor/timezone regressions, automatic parent height, grow/shrink/groups, inline left/right date hints";
}
setTimeout(() => { if (result.textContent === "WAITING") result.textContent="FAIL: browser timed out"; }, 6000);
`;

const assets = new Set(["gantt-iframe.html", "main.js", "app.css", "frappe-gantt.css", "frappe-gantt.umd.js"]);
const server = createServer((request, response) => {
  const file = (request.url || "").split("?")[0].slice(1)
    .replace(/^plugins\/siyuan-dodo\/preview\/gantt\//,"");
  if (!file) {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end('<!doctype html><style>'+hostCSS+'.av{font:16px Arial;color:#222}.av__row{font-size:87.5%}</style><body class="protyle-wysiwyg"><div class="av" data-node-id="20261020101010-aaaaaaa" data-av-id="20261020101010-bbbbbbb">' +
      '<div class="av__container"><div class="av__header" data-current-view-id="gantt-view"><div class="av__views"><button data-type="av-filter">筛选</button></div></div><div class="av__scroll"></div></div></div>' +
    '<pre id="result">WAITING</pre><script>window.onerror=(msg,src,line,col,err)=>{if(String(msg).startsWith("ResizeObserver loop"))return true;document.getElementById("result").textContent="FAIL: "+(err?.stack||msg)};</script><script>' + hostCode + checks.replace("LEGACY_CLIENT",String(legacyClient)) + '</script>');
    return;
  }
  if (!assets.has(file)) { response.writeHead(404); response.end(); return; }
  let content = readFileSync(join(root,file));
  if(file==="main.js" && legacyClient){
    const source=content.toString();
    content=source.replace('parent.postMessage({type:"dodoGanttResize",height},location.origin);',"");
    assert.ok(!content.includes('parent.postMessage({type:"dodoGanttResize"'),"Legacy fixture must omit the resize protocol");
  }
  if (file === "main.js") content = content.toString() +
    "\nwindow.__ganttProbe={loadNative,openEditor,getChart:()=>chart};";
  response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" :
    file.endsWith(".css") ? "text/css" : "text/html; charset=utf-8");
  response.end(content);
});
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
  });
  // Use Chromium's native debugging pipe and real render frames: virtual
  // time can skip the ResizeObserver/rAF deliveries this test must exercise.
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking",
    "--window-size=1450,900", "--remote-debugging-pipe", "--no-first-run",
    "--user-data-dir=" + profile], {windowsHide:true,stdio:["ignore","ignore","pipe","pipe","pipe"]});
  let stderr = "", buffer="", serial=0;
  const pending=new Map();
  child.stderr.on("data", chunk => stderr += chunk);
  const closed=new Promise(resolve=>child.once("close",resolve));
  child.on("close",()=>{
    for(const request of pending.values())request.reject(Error("Chrome closed: "+stderr.slice(-500)));
    pending.clear();
  });
  child.on("error",error=>{for(const request of pending.values())request.reject(error);});
  child.stdio[4].on("data",chunk=>{
    buffer+=chunk.toString();
    let end;
    while((end=buffer.indexOf("\0"))>=0){
      const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
      const request=pending.get(message.id);
      if(!request)continue;
      pending.delete(message.id);
      if(message.error)request.reject(Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});
    child.stdio[3].write(JSON.stringify({id,method,params,sessionId})+"\0");
  });
  const timer=setTimeout(()=>child.kill(),30000);
  try {
    const {targetId}=await cdp("Target.createTarget",{url:"about:blank"});
    const {sessionId}=await cdp("Target.attachToTarget",{targetId,flatten:true});
    await cdp("Page.enable",{},sessionId);
    await cdp("Page.navigate",{url:"http://127.0.0.1:"+server.address().port+"/"},sessionId);
    let message="";
    const deadline=Date.now()+12000;
    while(Date.now()<deadline){
      const {result}=await cdp("Runtime.evaluate",{
        expression:'document.getElementById("result")?.textContent',returnByValue:true,
      },sessionId);
      message=result.value||"";
      if(message.startsWith("PASS:")||message.startsWith("FAIL:"))break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(process.env.GANTT_SCREENSHOT){
      const {data}=await cdp("Page.captureScreenshot",{},sessionId);
      writeFileSync(process.env.GANTT_SCREENSHOT,Buffer.from(data,"base64"));
    }
    assert.ok(message.startsWith("PASS:"),message||"No browser result: "+stderr.slice(-500));
    console.log(message);
  } finally {
    child.kill();await closed;clearTimeout(timer);
  }
} finally {
  server.close();
  rmSync(profile, {recursive:true, force:true, maxRetries:4, retryDelay:250});
}
