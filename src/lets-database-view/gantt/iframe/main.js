/* Frappe Gantt 1.2.2 renderer. Native SiYuan AV operations stay in parent. */
const Frappe = window.Gantt;
if(typeof Frappe!=="function")throw Error("Frappe Gantt 尚未加载");
const byId=id=>document.getElementById(id);
const timeline=byId("dodo-frappe-timeline");
const gridRows=byId("dodo-frappe-grid-rows"),status=byId("dodo-gantt-status");
const zoomButton=byId("dodo-gantt-zoom");
const zoomLabels={hour:"小时",day:"日",week:"周",month:"月"};
const editor=byId("dodo-gantt-editor"),form=byId("dodo-gantt-edit-form");
const editTitle=byId("dodo-gantt-edit-title"),editStart=byId("dodo-gantt-edit-start");
const editEnd=byId("dodo-gantt-edit-end"),editProgress=byId("dodo-gantt-edit-progress");
const editHelp=byId("dodo-gantt-edit-help"),editSave=byId("dodo-gantt-edit-save");
const dateHint=byId("dodo-frappe-date-hint");
const ganttChart=byId("dodo-gantt-chart"),gridToggle=byId("dodo-gantt-grid-toggle");
let hoverEdge=null,dragEdge=null;
let pendingOpen=null,barPress=null,barMoved=false;
const DAY=86400000;
let chart=null,zoom="week",minuteStep=0,nativeMode=false,saving=false;
let editableDates=false,editableProgress=false,revision=0;
let requestSerial=0,pendingRequestId=0,precisionSerial=0,pendingPrecisionId=0;
let precisionPending=false,editingId=null,allTasks=[],visibleTasks=[];
let editingSnapshot=null,editingStep=0;
let editContext="",editingContext="";
const snapshots=new Map(),collapsed=new Set(),gridNodes=new Map(),dateDrafts=new Map();
function applyNativeTypography(values){
  const root=document.documentElement.style;
  for(const [key,cssName,property] of [
    ["fontFamily","--dodo-av-font-family","font-family"],
    ["fontSize","--dodo-av-font-size","font-size"],
    ["fontWeight","--dodo-av-font-weight","font-weight"],
    ["color","--dodo-av-color","color"],
  ]){
    const value=values?.[key];
    if(typeof value==="string"&&value.length<300&&CSS.supports(property,value))
      root.setProperty(cssName,value);
    else root.removeProperty(cssName);
  }
}
function setGridVisible(visible){
  ganttChart.classList.toggle("dodo-gantt-grid-hidden",!visible);
  document.querySelector(".dodo-gantt-preview").classList.toggle("dodo-gantt-grid-hidden",!visible);
  gridToggle.classList.toggle("is-collapsed",!visible);
  gridToggle.setAttribute("aria-expanded",String(visible));
  gridToggle.setAttribute("aria-label",visible?"隐藏表格":"显示表格");
  gridToggle.title=visible?"隐藏表格":"显示表格";
}
gridToggle.addEventListener("click",()=>
  setGridVisible(ganttChart.classList.contains("dodo-gantt-grid-hidden")));
function syncHeight(){
  if(chart){
    const container=chart.$container;
    // Frappe sizes the SVG; leave room for its horizontal scrollbar too.
    const height=chart.grid_height+container.offsetHeight-container.clientHeight;
    if(container.style.height!==height+"px")container.style.height=height+"px";
  }
}
function shiftDay(day,n){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return "";
  const date=Date.parse(day+"T00:00:00Z");
  if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==day)return "";
  return new Date(date+n*DAY).toISOString().slice(0,10);
}
function cleanDate(value){
  let text="";
  if(typeof value==="string")text=value.replace("T"," ").slice(0,minuteStep?16:10);
  else if(Object.prototype.toString.call(value)==="[object Date]" &&
    Number.isFinite(value.getTime())){
    text=[value.getFullYear(),String(value.getMonth()+1).padStart(2,"0"),
      String(value.getDate()).padStart(2,"0")].join("-");
    if(minuteStep)text+=" "+String(value.getHours()).padStart(2,"0")+":"+
      String(value.getMinutes()).padStart(2,"0");
  }
  if(!shiftDay(text.slice(0,10),0))return "";
  if(!minuteStep)return text.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text))return "";
  const ms=Date.parse(text.replace(" ","T")+":00Z");
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,16).replace("T"," ")===text?text:"";
}
function snapshot(task){
  const p=Number(task.progress);
  return Object.freeze({start_date:cleanDate(task.start_date),end_date:cleanDate(task.end_date),
    progress:Number.isFinite(p)?Math.max(0,Math.min(1,p)):0});
}
function nativeTime(value,ending=false){
  const text=value.includes(" ")?value:value+" 00:00";
  // Frappe 1.2.2 auto-appends a day when _end is midnight exactly.
  // The 1ms sentinel retains our native EXCLUSIVE end boundary.
  return text+":00."+(ending?"001":"000");
}
function nativeDate(value,ending=false){
  return new Date(nativeTime(value,ending).replace(" ","T"));
}
function makeTask(item){
  return {id:String(item.id),name:item.text||"未命名任务",
    start:nativeTime(item.start_date),end:nativeTime(item.end_date,true),
    progress:Math.round(item.progress*10000)/100,dependencies:[],
    custom_class:item.type==="project"?"dodo-frappe-group":
      item.dateLocked?"dodo-frappe-locked":"dodo-frappe-task"};
}
const scales={
  hour:{name:"Hour",padding:"2d",step:"1h",column_width:58,date_format:"YYYY-MM-DD HH:mm",
    lower_text:"HH:mm",upper_text:(d,p)=>!p||d.getDate()!==p.getDate()
      ?(d.getMonth()+1)+"月"+d.getDate()+"日":""},
  day:{name:"Day",padding:"5d",step:"6h",column_width:96,date_format:"YYYY-MM-DD HH:mm",
    lower_text:"HH:mm",upper_text:(d,p)=>!p||d.getDate()!==p.getDate()
      ?(d.getMonth()+1)+"月"+d.getDate()+"日":""},
  week:{name:"Week",padding:"12d",step:"1d",column_width:45,date_format:"YYYY-MM-DD",
    lower_text:"D",upper_text:(d,p)=>!p||d.getMonth()!==p.getMonth()
      ?d.getFullYear()+"年"+(d.getMonth()+1)+"月":""},
  month:{name:"Month",padding:"1m",step:"7d",column_width:96,date_format:"YYYY-MM-DD",
    lower_text:"D MMM",upper_text:(d,p)=>!p||d.getMonth()!==p.getMonth()
      ?d.getFullYear()+"年"+(d.getMonth()+1)+"月":""},
};
function syncScaleControls(){
  zoomButton.textContent=zoomLabels[zoom];
  zoomButton.setAttribute("aria-label","时间刻度："+zoomLabels[zoom]+"，点击切换");
  zoomButton.disabled=precisionPending;
}
/** Exact current wall-clock marker, independent from Frappe's snapped ruler. */
function nowX(now){
  if(!chart)return NaN;
  const millis=chart.config.unit==="hour"?3600000:chart.config.unit==="day"?DAY:0;
  return millis?((now.getTime()-chart.gantt_start.getTime())/
    (millis*chart.config.step))*chart.config.column_width:NaN;
}
function syncNowMarker(now=new Date()){
  const precise=zoom==="hour"||zoom==="day";
  ganttChart.classList.toggle("dodo-gantt-precise",precise);
  if(!chart)return;
  const container=chart.$container;
  container.querySelectorAll(".dodo-gantt-now-line,.dodo-gantt-now-dot,.dodo-gantt-now-label")
    .forEach(node=>node.remove());
  if(!precise)return;
  const x=nowX(now),limit=chart.dates.length*chart.config.column_width;
  if(!Number.isFinite(x)||x<0||x>limit)return;
  const line=document.createElement("div"),dot=document.createElement("div");
  const label=document.createElement("div");
  line.className="dodo-gantt-now-line";dot.className="dodo-gantt-now-dot";
  label.className="dodo-gantt-now-label";
  const at=x+"px";
  line.style.left=dot.style.left=label.style.left=at;
  line.style.top=chart.config.header_height+"px";
  line.style.height=(chart.grid_height-chart.config.header_height)+"px";
  dot.style.top=(chart.config.header_height-6)+"px";
  label.style.top=(chart.options.upper_header_height+5)+"px";
  label.textContent=String(now.getHours()).padStart(2,"0")+":"+
    String(now.getMinutes()).padStart(2,"0");
  container.append(line,dot,label);
}
function includeTodayInAxis(now){
  if(!chart)return false;
  if(now>=chart.gantt_start&&now<=chart.gantt_end)return true;
  const tasks=chart.tasks;
  if(!tasks.length)return false;
  const first=Math.min(...tasks.map(task=>task._start.getTime()));
  const last=Math.max(...tasks.map(task=>task._end.getTime()));
  const base={hour:2,day:5,week:12,month:30}[zoom];
  const before=Math.max(base,Math.ceil((first-now.getTime())/DAY)+2);
  const after=Math.max(base,Math.ceil((now.getTime()-last)/DAY)+2);
  // Do not generate thousands of hourly cells for very distant tasks.
  if(Math.max(before,after)>(zoom==="hour"?45:zoom==="day"?120:360))return false;
  const padding=[before+"d",after+"d"];
  scales[zoom].padding=padding;
  chart.config.view_mode.padding=padding;
  // Refresh the ruler only: unchanged native tasks, same chart instance/SVG.
  rebuild(false);
  syncHeight();
  return now>=chart.gantt_start&&now<=chart.gantt_end;
}
function scrollToToday(){
  if(!chart)return;
  const now=new Date();
  if(!includeTodayInAxis(now)){
    status.textContent="今天不在当前任务时间轴范围内。";
    byId("dodo-gantt-today").title="今天不在当前任务时间轴范围内";
    return;
  }
  byId("dodo-gantt-today").removeAttribute("title");
  syncNowMarker(now);
  if(zoom==="hour"||zoom==="day"){
    const x=nowX(now);
    if(Number.isFinite(x)&&x>=0&&x<=chart.dates.length*chart.config.column_width){
      chart.$container.scrollTo({left:Math.max(0,x-chart.$container.clientWidth/2),
        behavior:"smooth"});
      return;
    }
  }
  chart.scroll_current();
}
/** Move the ruler by a visible page without changing task dates. */
function moveTimeAxis(direction){
  if(!chart||saving||precisionPending)return;
  const viewport=chart.$container.clientWidth;
  const step=Math.max(chart.config.column_width,Math.round(viewport*.8));
  chart.$container.scrollTo({left:Math.max(0,chart.$container.scrollLeft+direction*step),
    behavior:"smooth"});
}
const VALID_ID=/^\d{14}-[a-z0-9]{7}$/;
function openRecord(id){
  if(!nativeMode||saving||precisionPending||!VALID_ID.test(id))return;
  const task=visibleTasks.find(t=>t.id===id&&t.type!=="project");
  if(!task||(!VALID_ID.test(task.blockId||"")&&!VALID_ID.test(task.valueId||"")))return;
  parent.postMessage({type:"dodoGanttOpenItem",id},location.origin);
}
function scheduleOpen(id){
  clearTimeout(pendingOpen);
  pendingOpen=setTimeout(()=>{pendingOpen=null;openRecord(id);},240);
}
function chartOptions(){
  const mode=scales[zoom];
  return {view_modes:[mode,...Object.values(scales).filter(m=>m!==mode)],
    view_mode:mode.name,scroll_to:"start",language:"zh",
    popup:()=>false,today_button:false,view_mode_select:false,
    padding:18,bar_height:30,upper_header_height:45,lower_header_height:30,
    snap_at:minuteStep===15?"900s":minuteStep===30?"1800s":"1d",
    readonly:false,readonly_dates:false,readonly_progress:false,
    move_dependencies:false,infinite_padding:false,
    on_date_change(task,start,end){
      if(!nativeMode||saving||task.custom_class==="dodo-frappe-group")return;
      const id=String(task.id),before=snapshots.get(id);
      if(!before)return;
      // Frappe calls this repeatedly DURING mousemove. Queue only final date.
      dateDrafts.set(id,{id,before,after:{...before,
        start_date:cleanDate(task._start||start),
        end_date:cleanDate(task._end)}});
      if(dragEdge?.id===id)refreshDateHint();
    },
    on_progress_change(task,value){
      if(!nativeMode||saving||!editableProgress||
        task.custom_class==="dodo-frappe-group")return;
      const id=String(task.id),before=snapshots.get(id);
      if(before)requestSave(id,"progress",before,
        {...before,progress:Math.max(0,Math.min(1,Number(value)/100))});
    },
    on_double_click(task){openEditor(String(task.id));},
  };
}
/** Frappe Gantt 1.2.2's Bar.compute_duration() loops over whole calendar
 * days, even for an Hour view. A 2-hour task was drawn 24 hours wide and
 * actual mouse dragging shifted its END two days instead of one. Override
 * only the per-bar duration calculation to use the actual timestamp span.
 * This is a local MIT-compatible adaptation, not a fork of SiYuan records.
 */
function installExactBarDurations(){
  if(!chart?.bars)return;
  for(const bar of chart.bars){
    if(bar.__dodoExactDuration)continue;
    bar.__dodoExactDuration=true;
    bar.compute_duration=function(){
      const config=this.gantt.config;
      const msPerUnit={
        hour:3600000,day:DAY,week:7*DAY,month:30*DAY,
      }[config.unit];
      if(!msPerUnit || !Number.isFinite(config.step) || config.step<=0)
        throw Error("Unsupported Frappe duration unit: "+config.unit);
      const durationMs=this.task._end.getTime()-this.task._start.getTime();
      this.duration=Math.max(0.000001,durationMs/(msPerUnit*config.step));
      this.actual_duration_raw=this.duration;
      this.ignored_duration_raw=0;
      this.task.actual_duration=Math.ceil(durationMs/DAY);
      this.task.ignored_duration=0;
    };
    // One initial refresh rebuilds SVG geometry at exact elapsed duration.
    // From then on, Bar.update_bar_position() invokes our same implementation.
    bar.refresh();
    bar.group.addEventListener("mouseleave",event=>{
      if(dragEdge?.id!==String(bar.task.id))return;
      bar.$date_highlight.classList.remove("hide");
      event.stopImmediatePropagation();
    },true);
  }
}
/** Frappe exposes the true task boundaries as _start and _end. The latter
 * is exclusive in SiYuan; calendar-only endings therefore display the last
 * included day, while minute views show the exact wall-clock end.
 */
function formatEdgeDate(task,edge){
  const stamp=edge==="start"?task?._start:task?._end;
  if(Object.prototype.toString.call(stamp)!=="[object Date]" ||
    !Number.isFinite(stamp.getTime()))return "";
  let d=stamp;
  if(edge==="end" && !minuteStep){
    // The native AV end is exclusive. Our Frappe vendor sends it with a
    // +1ms sentinel to avoid upstream "midnight means tomorrow" behavior.
    // Subtract one CALENDAR day (not 1ms) for the visible inclusive label.
    d=new Date(stamp.getFullYear(),stamp.getMonth(),stamp.getDate()-1);
  }
  const text=(d.getMonth()+1)+"月"+d.getDate()+"日";
  return minuteStep ? text+" "+String(d.getHours()).padStart(2,"0")+":"+
    String(d.getMinutes()).padStart(2,"0") : text;
}
function hintHandle(target){
  const element=target?.closest?.(".handle.left, .handle.right");
  const wrapper=element?.closest?.(".bar-wrapper[data-id]");
  if(!wrapper)return null;
  const id=wrapper.getAttribute("data-id");
  const edge=element.classList.contains("left")?"start":"end";
  return chart?.get_task(id)?{id,edge,element}:null;
}
function hideDateHint(){
  if(dragEdge)chart?.get_bar(dragEdge.id)?.$date_highlight.classList.add("hide");
  dateHint.hidden=true;
  hoverEdge=null;
  dragEdge=null;
}
function refreshDateHint(){
  const active=dragEdge||hoverEdge;
  if(!active || !chart){
    dateHint.hidden=true;return;
  }
  const task=chart.get_task(active.id);
  if(!task||!active.element.isConnected){
    hideDateHint();return;
  }
  const label=formatEdgeDate(task,active.edge);
  if(!label){hideDateHint();return;}
  dateHint.textContent=label;
  dateHint.dataset.edge=active.edge;
  dateHint.hidden=false;
  const rect=chart.get_bar(active.id).$bar.getBoundingClientRect();
  const width=dateHint.offsetWidth,height=dateHint.offsetHeight;
  // Clamp to the iframe viewport: short bars and bars at the edge should
  // never have their date labels cut off by the scrolling timeline.
  const left=active.edge==="start"?rect.left-width-8:rect.right+8;
  dateHint.style.left=Math.max(6,Math.min(window.innerWidth-width-6,
    left))+"px";
  dateHint.style.top=(rect.top+(rect.height-height)/2)+"px";
}
function applyColors(){
  if(!chart?.bars)return;
  const colors=new Map(visibleTasks.map(item=>[item.id,item.color]));
  for(const bar of chart.bars){
    const color=colors.get(String(bar.task.id));
    const explicit=typeof color==="string" &&
      /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color);
    bar.group.classList.toggle("dodo-frappe-colored",explicit);
    if(explicit)bar.group.style.setProperty("--dodo-frappe-color",color);
    else bar.group.style.removeProperty("--dodo-frappe-color");
  }
}
function formatDuration(item){
  const parse=value=>Date.parse(value.slice(0,10)+"T"+
    (value.includes(" ")?value.slice(11):"00:00")+":00Z");
  const mins=Math.max(0,Math.round((parse(item.end_date)-parse(item.start_date))/60000));
  if(!minuteStep)return Math.max(1,Math.ceil(mins/1440))+"天";
  const h=Math.floor(mins/60),m=mins%60;
  return (h?h+"小时":"")+(m?m+"分钟":"")||"0分钟";
}
function renderGrid(items,force=false){
  if(force || gridNodes.size!==items.length ||
     items.some(item=>!gridNodes.has(item.id))){
    gridNodes.clear();gridRows.replaceChildren();
    for(const item of items){
      const row=document.createElement("div");row.className="dodo-frappe-row";
      const name=document.createElement("span");name.className="dodo-frappe-name";
      const label=document.createElement("span");label.className="dodo-frappe-text";
      let toggle=null;
      if(item.type==="project"){
        toggle=document.createElement("button");toggle.type="button";
        toggle.className="dodo-frappe-expand";toggle.setAttribute("aria-label","展开或折叠分组");
        toggle.addEventListener("click",()=>toggleGroup(item.id));
        name.append(toggle);
      }
      name.append(label);row.append(name);
      row.addEventListener("click",event=>{
        if(event.target.closest(".dodo-frappe-expand"))return;
        scheduleOpen(item.id);
      });
      row.addEventListener("dblclick",event=>{
        if(event.target.closest(".dodo-frappe-expand"))return;
        event.preventDefault();clearTimeout(pendingOpen);pendingOpen=null;
        openEditor(item.id);
      });
      row.addEventListener("keydown",event=>{
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();openRecord(item.id);
        }
      });
      gridNodes.set(item.id,{row,label,toggle});gridRows.append(row);
    }
  }
  for(const item of items){
    const node=gridNodes.get(item.id);if(!node)continue;
    node.row.classList.toggle("is-group",item.type==="project");
    node.row.classList.toggle("is-child",Boolean(item.parent));
    node.label.textContent=item.text||"未命名任务";
    node.label.title=item.text||"未命名任务";
    const link=item.type!=="project" &&
      (VALID_ID.test(item.blockId||"")||VALID_ID.test(item.valueId||""));
    node.row.classList.toggle("is-link",link);
    if(link){node.row.setAttribute("role","link");node.row.tabIndex=0;}
    else{node.row.removeAttribute("role");node.row.removeAttribute("tabindex");}
    if(node.toggle){
      node.toggle.textContent=collapsed.has(item.id)?"▸":"▾";
      node.toggle.setAttribute("aria-expanded",String(!collapsed.has(item.id)));
    }
  }
}
function visibleData(){
  return allTasks.filter(item=>!item.parent||!collapsed.has(String(item.parent)));
}
function decorateTaskLinks(){
  for(const bar of chart?.bars||[]){
    const label=bar.group.querySelector(".bar-label");
    const item=visibleTasks.find(t=>t.id===String(bar.task.id));
    if(!label)continue;
    const link=item?.type!=="project"&&
      (VALID_ID.test(item?.blockId||"")||VALID_ID.test(item?.valueId||""));
    bar.group.classList.toggle("dodo-frappe-link",Boolean(link));
    if(link){
      bar.group.setAttribute("role","link");bar.group.setAttribute("tabindex","0");
      bar.group.setAttribute("aria-label",item.text||"未命名任务");
    }else{
      for(const attr of ["role","tabindex","aria-label"])bar.group.removeAttribute(attr);
    }
  }
}
function bindChart(){
  const svg=chart.$svg,scroll=chart.$container;
  svg.addEventListener("mousedown",event=>{
    const wrapper=event.target.closest?.(".bar-wrapper.dodo-frappe-link[data-id]");
    const handle=event.target.closest?.(".handle");
    const item=wrapper&&chart.get_task(wrapper.getAttribute("data-id"));
    barPress=wrapper&&!handle&&event.button===0?{
      id:wrapper.getAttribute("data-id"),x:event.clientX,y:event.clientY,
      start:item?item._start.getTime():null,end:item?item._end.getTime():null,
      progress:item?.progress}:null;
    barMoved=false;
  },true);
  window.addEventListener("mousemove",event=>{
    if(barPress&&(Math.abs(event.clientX-barPress.x)>4||
      Math.abs(event.clientY-barPress.y)>4))barMoved=true;
  },true);
  svg.addEventListener("click",event=>{
    const wrapper=event.target.closest?.(".bar-wrapper.dodo-frappe-link[data-id]");
    const press=barPress;barPress=null;
    if(!wrapper||!press||barMoved||event.target.closest?.(".handle"))return;
    const id=wrapper.getAttribute("data-id"),task=chart?.get_task(id);
    if(id===press.id&&task?._start.getTime()===press.start&&
      task?._end.getTime()===press.end&&task?.progress===press.progress)
      scheduleOpen(id);
  });
  svg.addEventListener("dblclick",event=>{
    if(!event.target.closest?.(".bar-wrapper.dodo-frappe-link"))return;
    clearTimeout(pendingOpen);pendingOpen=null;
  },true);
  svg.addEventListener("keydown",event=>{
    if(event.key!=="Enter"&&event.key!==" ")return;
    const wrapper=event.target.closest?.(".bar-wrapper.dodo-frappe-link[data-id]");
    if(!wrapper)return;
    event.preventDefault();openRecord(wrapper.getAttribute("data-id"));
  });
  svg.addEventListener("mouseover",event=>{
    const handle=hintHandle(event.target);
    if(!dragEdge && handle){
      hoverEdge=handle;
      refreshDateHint();
    }
  });
  svg.addEventListener("mouseout",event=>{
    if(dragEdge)return;
    if(hoverEdge?.element===event.target){
      hoverEdge=null;dateHint.hidden=true;
    }
  });
  svg.addEventListener("mousedown",event=>{
    const handle=hintHandle(event.target);
    if(handle && editableDates && !saving && !precisionPending){
      const row=visibleTasks.find(item=>item.id===handle.id);
      if(row && row.type!=="project" && !row.dateLocked){
        dragEdge=handle;
        hoverEdge=handle;
        refreshDateHint();
      }
    }
  });
  svg.addEventListener("mousemove",()=>{
    if(dragEdge)refreshDateHint();
  });

  scroll.addEventListener("scroll",()=>{
    if(!dateHint.hidden)refreshDateHint();
  },{passive:true});
  svg.addEventListener("mousedown",event=>{
    const wrapper=event.target.closest?.(".bar-wrapper");
    if(!wrapper)return;
    const item=visibleTasks.find(t=>t.id===wrapper.getAttribute("data-id"));
    const progress=Boolean(event.target.closest?.(".handle.progress"));
    if(!item||saving||precisionPending||item.type==="project"||
      (!progress&&(item.dateLocked||!editableDates))||
      (progress&&!editableProgress)){
      event.stopImmediatePropagation();event.preventDefault();
      if(item?.dateLocked)status.textContent="原生日期异常，日期调整已受保护。";
    }
  },true);
  svg.addEventListener("mouseup",()=>setTimeout(flushDateChanges,0));
}
function rebuild(keepScroll=true){
  hideDateHint();
  const scroll=keepScroll&&chart?.$container
    ?{x:chart.$container.scrollLeft,y:chart.$container.scrollTop}:null;
  const tasks=visibleTasks.map(makeTask);
  if(chart){
    // Frappe installs delegated mouse listeners on construction, including a
    // document-level mouseup listener. Reuse the SAME instance on group and
    // scale changes to prevent accumulating listeners after every switch.
    const mode=scales[zoom];
    const snap=minuteStep===15?"900s":minuteStep===30?"1800s":"1d";
    if(chart.config?.view_mode?.name!==mode.name||chart.options.snap_at!==snap){
      chart.update_options({
        view_modes:[mode,...Object.values(scales).filter(m=>m!==mode)],
        snap_at:snap,
      });
    }
    chart.refresh(tasks);
  }else{
    timeline.replaceChildren();
    if(!tasks.length)return;
    chart=new Frappe(timeline,tasks,chartOptions());
    bindChart();
  }
  installExactBarDurations();
  decorateTaskLinks();
  applyColors();
  syncNowMarker();
  for(const task of chart.tasks)task.__dodoSnapshot=snapshots.get(String(task.id));
  if(scroll){
    chart.$container.scrollLeft=scroll.x;chart.$container.scrollTop=scroll.y;
  }
}
function updateData(items,force=false){
  const outside=chart && items.some(item=>nativeDate(item.start_date)<chart.gantt_start ||
    nativeDate(item.end_date,true)>chart.gantt_end);
  const different=!chart||force||outside||items.length!==visibleTasks.length||
    items.some((item,i)=>item.id!==visibleTasks[i].id||
      item.type!==visibleTasks[i].type||item.parent!==visibleTasks[i].parent);
  visibleTasks=items;
  renderGrid(items,different);
  if(different){rebuild(!outside);syncHeight();return;}
  for(const item of items){
    const old=chart.get_task(item.id),snapshotNow=snapshots.get(item.id);
    if(!old)continue;
    const before=old.__dodoSnapshot,after=makeTask(item);
    if(!before||before.start_date!==snapshotNow.start_date||
      before.end_date!==snapshotNow.end_date||before.progress!==snapshotNow.progress||
      old.name!==after.name||old.custom_class!==after.custom_class){
      chart.update_task(item.id,{name:after.name,start:after.start,end:after.end,
        _start:nativeDate(item.start_date),_end:nativeDate(item.end_date,true),
        progress:after.progress,custom_class:after.custom_class});
      old.__dodoSnapshot=snapshotNow;
    }
  }
  applyColors();
  decorateTaskLinks();
  syncNowMarker();
  syncHeight();
}
function toggleGroup(id){
  if(collapsed.has(id))collapsed.delete(id);else collapsed.add(id);
  updateData(visibleData(),true);
}
function flushDateChanges(){
  if(!dateDrafts.size)return;
  const changes=[...dateDrafts.values()];dateDrafts.clear();
  if(!nativeMode||saving)return;
  const changed=changes.find(t=>t.before.start_date!==t.after.start_date||
    t.before.end_date!==t.after.end_date);
  if(changed)requestSave(changed.id,"dates",changed.before,changed.after);
}
function requestSave(id,kind,before,after){
  if(saving||precisionPending)return false;
  const prev=snapshot(before),next=snapshot(after);
  if(!prev.start_date||!prev.end_date||!next.start_date||!next.end_date||
    prev.start_date>=prev.end_date||next.start_date>=next.end_date){
    status.textContent="日期范围无效，已阻止写入。";return false;
  }
  const changed=kind==="progress"?Math.abs(prev.progress-next.progress)>.00001:
    prev.start_date!==next.start_date||prev.end_date!==next.end_date;
  if(!changed)return false;
  saving=true;pendingRequestId=++requestSerial;
  status.textContent="正在保存到思源原生数据库…";
  parent.postMessage({type:"dodoGanttEdit",id,kind,before:prev,after:next,
    requestId:pendingRequestId,revision},location.origin);
  return true;
}
function loadNative(data){
  if(saving||precisionPending)return;
  applyNativeTypography(data.typography);
  const step=data.timeStep===15?15:data.timeStep===30?30:0;
  const nextZoom=["hour","day","week","month"].includes(data.zoom)?
    data.zoom:step?"hour":"week";
  const changed=minuteStep!==step||zoom!==nextZoom;
  minuteStep=step;zoom=nextZoom;nativeMode=true;
  editContext=JSON.stringify([data.fieldMapping,data.progressMax===1?1:100]);
  editableDates=Boolean(data.editableDates);editableProgress=Boolean(data.editableProgress);
  byId("dodo-gantt-reset").hidden=true;
  try {
    const rows=[],ids=new Set();
    for(const record of data.data||[]){
      const item={...record,id:String(record.id)};
      const start=cleanDate(item.start_date),end=cleanDate(item.end_date);
      if(!item.id||ids.has(item.id)||!start||!end||start>=end)
        throw Error("任务 ID 或日期无效");
      ids.add(item.id);item.start_date=start;item.end_date=end;
      item.progress=Math.max(0,Math.min(1,Number(item.progress)||0));rows.push(item);
    }
    allTasks=rows;snapshots.clear();
    for(const item of rows)snapshots.set(item.id,snapshot(item));
    updateData(visibleData(),changed);
    revision=data.revision||revision+1;
    if(editingId){
      const item=rows.find(row=>row.id===editingId && row.type!=="project");
      editStart.disabled=editEnd.disabled=!editableDates||Boolean(item?.dateLocked);
      editProgress.disabled=!editableProgress;
      editSave.disabled=!item||editingStep!==minuteStep||editingContext!==editContext||
        (editStart.disabled&&editProgress.disabled);
      editHelp.textContent=!item?"任务已移出当前视图，已保留输入；请取消后检查数据库。":
        editingStep!==minuteStep?"时间精度已改变，已保留输入；请取消后重新打开编辑。":
        editingContext!==editContext?"字段映射或进度范围已改变，已保留输入；请取消后重新打开编辑。":
        item.dateLocked?"原生日期异常，请在思源表格编辑日期。":
        "已保留当前输入；保存时会检查数据库中的字段是否已变化。";
    }
    status.textContent=data.warning||"已载入 "+rows.filter(t=>t.type!=="project").length+
      " 条任务。拖动后自动保存，双击任务可编辑。";
  }catch(e){
    status.textContent="甘特数据加载失败："+(e instanceof Error?e.message:String(e));
    timeline.replaceChildren();gridRows.replaceChildren();chart=null;
    allTasks=[];visibleTasks=[];gridNodes.clear();
    if(editingId){editSave.disabled=true;editHelp.textContent="数据读取失败，已保留输入；请等待刷新后再保存。";}
  }
  syncScaleControls();
}
function requestScale(next){
  if(!["hour","day","week","month"].includes(next)||saving||precisionPending)return;
  const step=next==="hour"||next==="day"?15:0;
  if(!nativeMode){
    zoom=next;minuteStep=step;syncScaleControls();
    updateData(visibleData(),true);return;
  }
  if(zoom===next&&minuteStep===step)return;
  precisionPending=true;pendingPrecisionId=++precisionSerial;
  syncScaleControls();
  parent.postMessage({type:"dodoGanttSetTimeStep",requestId:pendingPrecisionId,
    zoom:next,timeStep:step},location.origin);
}
function closeEditor(){editor.hidden=true;editingId=null;editingSnapshot=null;}
function openEditor(id){
  if(!nativeMode||saving||precisionPending)return;
  const item=allTasks.find(t=>t.id===id);
  if(!item||item.type==="project")return;
  const before=snapshots.get(id);if(!before)return;
  editingId=id;editingSnapshot=before;editingStep=minuteStep;
  editingContext=editContext;
  editTitle.textContent=item.text;
  editStart.type=minuteStep?"datetime-local":"date";
  editEnd.type=minuteStep?"datetime-local":"date";
  // Date inputs count days; datetime-local inputs count seconds. Editing
  // accepts native minute values independently of the bar's drag snap.
  editStart.step=editEnd.step=minuteStep?"60":"1";
  editStart.value=minuteStep?before.start_date.replace(" ","T"):before.start_date;
  editEnd.value=minuteStep?before.end_date.replace(" ","T"):shiftDay(before.end_date,-1);
  editProgress.value=String(before.progress*100);
  editStart.disabled=editEnd.disabled=!editableDates||Boolean(item.dateLocked);
  editProgress.disabled=!editableProgress;
  editSave.disabled=editStart.disabled&&!editableProgress;
  editHelp.textContent=item.dateLocked?"原生日期异常，请在思源表格编辑日期。":
    "通过思源原生 API 保存，每次只更新日期或进度。";
  // A tall, auto-sized iframe can extend beyond the editor viewport.
  const frameTop=window.frameElement?.getBoundingClientRect().top||0;
  const top=Math.max(0,-frameTop);
  editor.style.top=top+"px";
  editor.style.height=Math.max(0,Math.min(window.innerHeight,parent.innerHeight-frameTop)-top)+"px";
  editor.hidden=false;
}
form.addEventListener("submit",event=>{
  event.preventDefault();
  const id=editingId,before=editingSnapshot,item=allTasks.find(t=>t.id===id);
  if(!before||!item||saving||editSave.disabled||editingStep!==minuteStep||editingContext!==editContext)return;
  const after={...before};
  if(editableDates&&!item.dateLocked){
    after.start_date=minuteStep?editStart.value.replace("T"," "):editStart.value;
    after.end_date=minuteStep?editEnd.value.replace("T"," "):shiftDay(editEnd.value,1);
  }
  if(editableProgress)after.progress=Number(editProgress.value)/100;
  const dates=before.start_date!==after.start_date||before.end_date!==after.end_date;
  const progress=Math.abs(before.progress-after.progress)>.00001;
  if(dates&&progress){editHelp.textContent="请分别保存日期和进度。";return;}
  if(!dates&&!progress){closeEditor();return;}
  if(requestSave(id,dates?"dates":"progress",before,after))closeEditor();
});
for(const id of ["dodo-gantt-edit-close","dodo-gantt-edit-cancel"])
  byId(id).addEventListener("click",closeEditor);
editor.addEventListener("click",event=>{if(event.target===editor)closeEditor();});
window.addEventListener("keydown",event=>{if(event.key==="Escape")closeEditor();});
// A drag may finish just outside the SVG; capture the final draft there too.
document.addEventListener("mouseup",event=>{
  if(dragEdge){
    refreshDateHint();
    const edge=dragEdge;
    dragEdge=null;
    const wrapper=event.target instanceof Element
      ?event.target.closest(".bar-wrapper[data-id]"):null;
    if(wrapper?.getAttribute("data-id")!==edge.id)
      chart?.get_bar(edge.id)?.$date_highlight.classList.add("hide");
  }
  setTimeout(flushDateChanges,0);
});
window.addEventListener("blur",hideDateHint);
window.addEventListener("resize",()=>{
  syncHeight();
  if(!dateHint.hidden)refreshDateHint();
});
zoomButton.addEventListener("click",()=>{
  if(saving||precisionPending)return;
  parent.postMessage({type:"dodoGanttOpenZoomMenu",zoom},location.origin);
});
byId("dodo-gantt-today").addEventListener("click",scrollToToday);
byId("dodo-gantt-prev").addEventListener("click",()=>moveTimeAxis(-1));
byId("dodo-gantt-next").addEventListener("click",()=>moveTimeAxis(1));
setInterval(()=>{if(chart&&(zoom==="hour"||zoom==="day"))syncNowMarker();},60000);
byId("dodo-gantt-reset").addEventListener("click",loadDemo);
function loadDemo(){
  if(nativeMode)return;
  minuteStep=0;zoom="week";
  const first=shiftDay(cleanDate(new Date()),-1),later=shiftDay(first,2);
  allTasks=[
    {id:"sample-group",text:"演示项目",type:"project",start_date:first,
      end_date:shiftDay(first,7),progress:.3},
    {id:"sample-a",text:"需求分析",parent:"sample-group",start_date:first,
      end_date:later,progress:.8,color:"#628bd4"},
    {id:"sample-b",text:"开发验证",parent:"sample-group",start_date:later,
      end_date:shiftDay(later,3),progress:.35,color:"#57a58f"},
  ];
  snapshots.clear();for(const item of allTasks)snapshots.set(item.id,snapshot(item));
  updateData(visibleData(),true);syncScaleControls();
  status.textContent="当前是独立演示，未写入思源数据库。";
}
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==parent)return;
  const data=event.data;if(!data||typeof data!=="object")return;
  if(data.type==="dodoGanttChangeZoom"){
    if(typeof data.zoom==="string")requestScale(data.zoom);
  }else if(data.type==="dodoGanttData")loadNative(data);
  else if(data.type==="dodoGanttSaveResult"){
    if(!saving||data.requestId!==pendingRequestId)return;
    saving=false;pendingRequestId=0;
    status.textContent=data.success?"已保存到思源数据库。":
      "保存失败，正在从思源重新载入："+(data.error||"未知原因");
    parent.postMessage({type:"dodoGanttReload"},location.origin);
  }else if(data.type==="dodoGanttTimeStepSaved"){
    if(!precisionPending||data.requestId!==pendingPrecisionId)return;
    precisionPending=false;pendingPrecisionId=0;
    status.textContent=data.success?"时间刻度已保存，正在同步任务…":
      "时间刻度保存失败："+(data.error||"未知原因");
    syncScaleControls();
  }else if(data.type==="dodoVisualRefresh"){
    parent.postMessage({type:"dodoGanttReload"},location.origin);
  }
});
loadDemo();
parent.postMessage({type:"dodoGanttReady"},location.origin);
