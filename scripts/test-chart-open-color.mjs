import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createServer } from "vite";
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:"custom"});
try{
  const { chartPalette, CHART_PALETTE_HUES, mixHexColor }=
    await server.ssrLoadModule("/src/lets-custom-block/chart/open-color-palettes.ts");
  const { PALETTE_CONFIGS, EChartsGeneratorService }=
    await server.ssrLoadModule("/src/lets-custom-block/chart/echarts-generator.ts");
  assert.equal(CHART_PALETTE_HUES.colorful.length,12);
  assert.equal(CHART_PALETTE_HUES.colorful[0],"#339af0","Open Color blue-5");
  assert.equal(CHART_PALETTE_HUES.colorful[1],"#ff922b","Open Color orange-5");
  for(const name of ["colorful","bw","blue","yellow","green","purple","teal","orange","pink","red"]){
    for(const dark of [false,true]){
      const colors=chartPalette(name,dark);
      assert.ok(colors.length>=6,name+" must include at least six colors");
      assert.equal(new Set(colors).size,colors.length,name+" distinct swatches");
      assert.ok(colors.every(color=>/^#[a-f0-9]{6}$/i.test(color)));
    }
    assert.notDeepEqual(chartPalette(name),chartPalette(name,true),name+" must adapt to theme");
    assert.deepEqual(PALETTE_CONFIGS[name].colors,chartPalette(name));
    assert.deepEqual(PALETTE_CONFIGS[name].darkColors,chartPalette(name,true));
  }
  const spread=(color)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));return Math.max(r,g,b)-Math.min(r,g,b);};
  assert.equal(mixHexColor("#339af0","#f8f9fa",0.72),chartPalette("colorful")[0]);
  assert.ok(spread(chartPalette("colorful")[0])<spread(CHART_PALETTE_HUES.colorful[0]),
    "Muted Open Color must reduce chroma");
  const table={headers:["名称","总额"],rows:[["A","3"],["B","2"]],hasHeader:true,numericColumns:[1]};
  const auto=EChartsGeneratorService.generateOption(table,"bar-basic");
  assert.deepEqual(auto.color,chartPalette("colorful"),"Auto must not use saturated ECharts defaults");
  const chosen=EChartsGeneratorService.generateOption(table,"bar-basic",{style:{palette:"red"}});
  assert.deepEqual(chosen.color,chartPalette("red"));
  const dark=EChartsGeneratorService.generateOption(table,"bar-basic",{style:{palette:"red"}},true);
  assert.deepEqual(dark.color,chartPalette("red",true));

  const iframeScript=await readFile("src/lets-database-view/visual/chart-iframe.js","utf8");
  const themeRoot={dataset:{}};
  const parent={siyuan:{config:{appearance:{mode:0}}},document:{documentElement:{dataset:{}},body:{},head:{}},postMessage(){}};
  const handlers={};
  const callbacks=[];
  const updates=[];
  const chart={setOption:(option)=>updates.push(option),resize(){},clear(){}};
  const window={parent,echarts:{init:()=>chart},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const chartElement={};
  const empty={textContent:"",hidden:true};
  const document={documentElement:themeRoot,getElementById:id=>id==="chart"?chartElement:empty};
  class ResizeObserver{observe(){}}
  class MutationObserver{constructor(callback){callbacks.push(callback);}observe(){}disconnect(){}}
  vm.runInNewContext(iframeScript,{
    document,window,ResizeObserver,MutationObserver,requestAnimationFrame:fn=>fn(),
    location:{origin:"http://localhost"},
  });
  const input={
    color:chartPalette("colorful"),legend:{data:["数值"]},
    xAxis:{type:"category",data:["A","B"]},yAxis:{type:"value"},
    tooltip:{trigger:"axis"},series:[{type:"bar",data:[3,2],label:{show:true}}],
  };
  handlers.message({origin:"http://localhost",source:parent,
    data:{type:"dodoVisualChartOption",option:input,darkColors:chartPalette("colorful",true)}});
  assert.equal(updates.length,1);
  assert.equal(themeRoot.dataset.theme,"light");
  assert.equal(updates[0].backgroundColor,"#ffffff");
  assert.equal(updates[0].legend.textStyle.color,"#495057");
  assert.deepEqual(Array.from(updates[0].color),chartPalette("colorful"));
  parent.siyuan.config.appearance.mode=1;
  for(const callback of callbacks)callback();
  assert.equal(themeRoot.dataset.theme,"dark");
  assert.equal(updates.length,2,"Theme changes rerender without fetching database data");
  assert.equal(updates[1].backgroundColor,"#212529");
  assert.equal(updates[1].legend.textStyle.color,"#dee2e6");
  assert.equal(updates[1].xAxis.axisLabel.color,"#dee2e6");
  assert.equal(updates[1].tooltip.textStyle.color,"#dee2e6");
  assert.deepEqual(Array.from(updates[1].color),chartPalette("colorful",true));
  parent.siyuan.config.appearance.mode=0;
  for(const callback of callbacks)callback();
  assert.equal(updates.length,3,"Dark-to-light switch rerenders");
  assert.equal(updates[2].backgroundColor,"#ffffff");
  const html=await readFile("src/lets-database-view/visual/chart-iframe.html","utf8");
  assert.match(html,/chart-iframe\.js\?v=20261019-open-color-soft/);
  const settings=await readFile("src/lets-custom-block/chart/ChartSettingsPanel.svelte","utf8");
  assert.match(settings,/isDark \? darkColors : colors/);
  assert.match(settings,/currentPaletteColors\(option.colors, option.darkColors, previewDark\)/);
  const host=await readFile("src/lets-database-view/visual/chart-renderer.ts","utf8");
  assert.match(host,/darkColors: chartPalette|chartPalette\(config\.style\?\.palette, true\)/);
  console.log("PASS: Open Color chart palettes muted; auto, custom, previews, dark/light and live ECharts theme switching");
}finally{await server.close();}