/* Sandboxed to one same-origin plugin iframe; the parent owns filtered database data. */
let chart;
const chartElement = document.getElementById("chart");
const message = document.getElementById("empty");
// Observe the plot itself: iframe window.resize does not fire for every
// SiYuan editor/AV flex layout change.
const chartResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => { if (chart) chart.resize(); })
  : null;
chartResizeObserver?.observe(chartElement);
let lastOption = null;
let lastDarkColors = [];
let currentIsDark = false;

function detectDarkMode(){
  try{
    const parent = window.parent;
    const appearance = parent.siyuan?.config?.appearance;
    if(typeof appearance?.mode === "number")return appearance.mode === 1;
    const root = parent.document.documentElement;
    return root.dataset.theme === "dark" || root.dataset.themeMode === "dark";
  }catch{return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false;}
}

/** Theme-aware chart ink; both palette variants originate from Open Color. */
function applyChartTheme(option,isDark,darkColors){
  const ink=isDark?"#dee2e6":"#495057";
  const grid=isDark?"#495057":"#dee2e6";
  const paper=isDark?"#212529":"#ffffff";
  const axis=value=>value?{
    ...value,
    axisLabel:{...value.axisLabel,color:ink},
    axisLine:{...value.axisLine,lineStyle:{...value.axisLine?.lineStyle,color:grid}},
    splitLine:{...value.splitLine,lineStyle:{...value.splitLine?.lineStyle,color:grid}},
    nameTextStyle:{...value.nameTextStyle,color:ink},
  }:value;
  return{
    ...option,
    color:isDark&&darkColors?.length?[...darkColors]:[...(option.color||[])],
    backgroundColor:paper,
    textStyle:{...option.textStyle,color:ink},
    legend:option.legend?{...option.legend,textStyle:{...option.legend.textStyle,color:ink}}:undefined,
    title:option.title?{...option.title,textStyle:{...option.title.textStyle,color:ink}}:undefined,
    tooltip:{...option.tooltip,backgroundColor:isDark?"#343a40":"#ffffff",
      borderColor:grid,textStyle:{...option.tooltip?.textStyle,color:ink}},
    xAxis:Array.isArray(option.xAxis)?option.xAxis.map(axis):axis(option.xAxis),
    yAxis:Array.isArray(option.yAxis)?option.yAxis.map(axis):axis(option.yAxis),
    series:option.series?.map(item=>({...item,label:{...item.label,color:ink}})),
  };
}
function showError(text){message.textContent=text;message.hidden=false;if(chart)chart.clear();}
function render(option,darkColors){
  if(!window.echarts){showError("ECharts 未加载");return;}
  lastOption=option;
  lastDarkColors=darkColors||[];
  currentIsDark=detectDarkMode();
  document.documentElement.dataset.theme=currentIsDark?"dark":"light";
  message.hidden=true;
  if(!chart)chart=window.echarts.init(chartElement);
  chart.setOption(applyChartTheme(lastOption,currentIsDark,lastDarkColors),true);
  requestAnimationFrame(()=>chart.resize());
}
function refreshTheme(){
  const next=detectDarkMode();
  if(next===currentIsDark)return;
  currentIsDark=next;
  document.documentElement.dataset.theme=next?"dark":"light";
  if(chart&&lastOption)chart.setOption(applyChartTheme(lastOption,next,lastDarkColors),true);
}
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==="dodoVisualChartOption"){
    if(event.data.error)showError(String(event.data.error));
    else if(event.data.option&&typeof event.data.option==="object"){
      try{render(event.data.option,event.data.darkColors)}
      catch(error){showError(error.message||String(error));}
    }
  }
});
// Follow SiYuan root and stylesheet changes without refetching chart data.
try{
  const parent=window.parent.document;
  const themeObserver=new MutationObserver(()=>refreshTheme());
  themeObserver.observe(parent.documentElement,{attributes:true,
    attributeFilter:["class","style","data-theme","data-theme-mode"]});
  if(parent.body)themeObserver.observe(parent.body,{attributes:true,attributeFilter:["class","style"]});
  if(parent.head)themeObserver.observe(parent.head,{childList:true});
  window.addEventListener("pagehide",()=>themeObserver.disconnect(),{once:true});
}catch{}window.addEventListener("resize",()=>chart?.resize());
window.parent.postMessage({type:"dodoVisualChartReady"},location.origin);
