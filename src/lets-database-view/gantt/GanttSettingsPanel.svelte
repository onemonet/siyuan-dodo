<script lang="ts">
  import { onMount } from "svelte";
  import FieldMapping from "../../components/ui/FieldMapping.svelte";
  import type { AvRenderData } from "../../shared/av/av-data-adapter";
  import { adaptAttributeViewRender } from "../../shared/av/av-data-adapter";
  import { GANTT_FIELDS, GANTT_FIELD_TYPES, prepareGanttMapping,
    type GanttConfig, type GanttMapping } from "./gantt-model";
  export let load:()=>Promise<{raw:AvRenderData;config:GanttConfig}>;
  export let apply:(config:GanttConfig)=>Promise<void>;
  let config:GanttConfig={};
  let table={headers:[] as string[],columnIds:[] as string[],columnNames:[] as string[],fieldTypes:[] as string[]};
  let mapping:GanttMapping={title:"",start:"",end:"",progress:"",group:"",color:""};
  let busy=false;
  let error="";
  let loaded=false;
  const definitions=GANTT_FIELDS.map(item=>({
    key:item.key,label:item.label,required:!item.optional,
    acceptedTypes:[...GANTT_FIELD_TYPES[item.key]],
    description:item.key==="start"?"可选择思源原生日期列。若结束日期留空，读取同一日期单元格的结束时间。"
    :item.key==="end"?"可选择另一个日期列；不选择则读取开始列自带的日期范围。"
    :item.key==="progress"?"数字列支持 0–100 或 0–1，按下面的比例设置解释。"
    :item.key==="group"?"使用单选或多选列的第一个选项，生成左侧可折叠任务组。"
    :item.key==="color"?"根据单选/多选项稳定分配任务条颜色，不改动数据库选项颜色。"
    :"任务名称来自文本列或主键列。",
  }));
  onMount(()=>{
    let alive=true;
    (async()=>{
      try{
        const data=await load();
        if(!alive)return;
        config=data.config;
        const t=adaptAttributeViewRender(data.raw);
        table={headers:t.headers,columnIds:t.columnIds,columnNames:t.columnNames,fieldTypes:t.fieldTypes};
        mapping=prepareGanttMapping(data.raw,config.fieldMapping);
        loaded=true;
      }catch(e){if(alive)error=e instanceof Error?e.message:String(e);}
    })();
    return ()=>{alive=false;};
  });
  async function save(next:GanttConfig) {
    if(busy)return;
    busy=true;error="";
    try{await apply(next);config=next;}
    catch(e){
      error=e instanceof Error?e.message:String(e);
      // Restore the last successfully saved mapping if the kernel rejected
      // this configuration. No unsaved UI value should appear persisted.
      mapping={...mapping,...config.fieldMapping} as GanttMapping;
    }
    finally{busy=false;}
  }
  function change(field:string,value:string) {
    const next={...mapping,[field]:value};
    mapping=next;
    void save({...config,fieldMapping:next,demo:false});
  }
  function changeProgress(event:Event) {
    const v=Number((event.target as HTMLSelectElement).value)===1?1:100;
    void save({...config,fieldMapping:mapping,progressMax:v,demo:false});
  }
  function changeTimeStep(event:Event){
    const value=Number((event.target as HTMLSelectElement).value);
    const timeStep=value===15?15:value===30?30:0;
    void save({...config,fieldMapping:mapping,timeStep,
      zoom:timeStep?(config.zoom==="day"?"day":"hour"):
        (config.zoom==="month"?"month":"week"),
      demo:false});
  }
</script>
<div class="dodo-gantt-settings">
  {#if !loaded}
    <p>{error||"正在读取思源数据库字段…"}</p>
  {:else}
    <p class="dodo-gantt-info">数据直接读取思源原生数据库，字段通过列 keyID 绑定。修改设置后自动保存，删除或重命名列不会错误地绑定到同名列。</p>
    <FieldMapping {definitions} {table} {mapping} disabled={busy}
      on:change={event=>change(event.detail.field,event.detail.value)}/>
    <p class="dodo-gantt-hint">顶栏「小时」「日」默认按 15 分钟拖拽；「周」「月」按天。也可在下方单独设置 30 分钟。</p>
    <div class="dodo-gantt-setting-row"><span>拖拽时间精度</span>
      <select disabled={busy} value={config.timeStep??0} on:change={changeTimeStep}>
        <option value={0}>1 天（默认）</option>
        <option value={30}>30 分钟</option>
        <option value={15}>15 分钟</option>
      </select>
    </div>
    <div class="dodo-gantt-setting-row"><span>进度数值范围</span>
      <select disabled={busy} value={config.progressMax===1?1:100} on:change={changeProgress}>
        <option value={100}>0–100</option><option value={1}>0–1</option>
      </select>
    </div>
    <p class="dodo-gantt-hint">拖拽仅修改日期和进度映射列；分组、颜色由原生选项字段决定，需到思源表格修改。日期按天调整时保留原有时分秒和日期范围；异常日期仍会阻止写入。项目组及依赖连线不写入数据库。</p>
    {#if busy}<p>正在保存配置…</p>{/if}
    {#if error}<p class="dodo-gantt-error" role="alert">{error}</p>{/if}
  {/if}
</div>
<style>
.dodo-gantt-settings{padding:13px 16px;color:var(--b3-theme-on-background);font-size:13px;overflow-y:auto;height:100%;box-sizing:border-box}
.dodo-gantt-info,.dodo-gantt-hint{color:var(--b3-theme-on-surface-light);line-height:1.7;margin:5px 0 12px}
.dodo-gantt-setting-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 8px}
.dodo-gantt-setting-row select{width:160px;height:31px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);border:1px solid var(--b3-border-color);border-radius:5px;padding:4px 7px;box-sizing:border-box}
.dodo-gantt-error{color:var(--b3-theme-error);overflow-wrap:anywhere}
</style>
