<script lang="ts">
  import { onMount } from "svelte";
  import FieldMapping from "../../components/ui/FieldMapping.svelte";
  import type { AvRenderData } from "../../shared/av/av-data-adapter";
  import { adaptAttributeViewRender } from "../../shared/av/av-data-adapter";
  import { SCHEDULE_FIELD_TYPES, prepareScheduleMapping, type ScheduleMapping } from "../core/schedule-model";
  import { CALENDAR_VIEWS, type CalendarConfig, type CalendarView } from "./calendar-model";

  export let load: () => Promise<{ raw: AvRenderData; config: CalendarConfig }>;
  export let apply: (config: CalendarConfig) => Promise<void>;

  let config: CalendarConfig = {};
  let mapping: ScheduleMapping = { title: "", start: "", end: "", progress: "", group: "", color: "" };
  let table = { headers: [] as string[], columnIds: [] as string[], columnNames: [] as string[], fieldTypes: [] as string[] };
  let busy = false;
  let loaded = false;
  let error = "";
  const definitions = ([
    { key: "title", label: "日程名称", required: true, description: "使用主键或文本列作为日程标题。" },
    { key: "start", label: "开始日期", required: true, description: "可用思源日期列，支持日期与精确到分钟的时间。" },
    { key: "end", label: "结束日期", required: false, description: "留空时读取开始日期列自身的日期范围。" },
    { key: "color", label: "日程颜色", required: false, description: "可选的单选或多选列，沿用数据库选项颜色。" },
  ] as const).map(field => ({ ...field, acceptedTypes: [...SCHEDULE_FIELD_TYPES[field.key]] }));

  onMount(() => {
    let alive = true;
    (async () => {
      try {
        const result = await load();
        if (!alive) return;
        config = result.config;
        const adapted = adaptAttributeViewRender(result.raw);
        table = { headers: adapted.headers, columnIds: adapted.columnIds,
          columnNames: adapted.columnNames, fieldTypes: adapted.fieldTypes };
        mapping = prepareScheduleMapping(result.raw, config.fieldMapping);
        loaded = true;
      } catch (e) {
        if (alive) error = e instanceof Error ? e.message : String(e);
      }
    })();
    return () => { alive = false; };
  });
  async function persist(next: CalendarConfig) {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await apply(next);
      config = next;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      mapping = { ...mapping, ...config.fieldMapping };
    } finally {
      busy = false;
    }
  }
  function change(key: string, value: string) {
    mapping = { ...mapping, [key]: value };
    void persist({ ...config, fieldMapping: mapping });
  }
  function changeView(event: Event) {
    const selected = (event.target as HTMLSelectElement).value as CalendarView;
    if (CALENDAR_VIEWS.includes(selected)) void persist({ ...config, fieldMapping: mapping, defaultView: selected });
  }
</script>

<div class="dodo-calendar-settings">
  {#if !loaded}
    <p role="status">{error || "正在读取数据库字段…"}</p>
  {:else}
    <p class="info">直接使用思源数据库中的记录。月、周、日视图均需拖动框选日期或时间范围来创建日程；单击空白处不会新建。拖动现有日程自动保存。</p>
    <FieldMapping {definitions} {table} {mapping} disabled={busy}
      on:change={event => change(event.detail.field, event.detail.value)} />
    <label class="setting-row">
      <span>默认视图</span>
      <select disabled={busy} value={config.defaultView || "dayGridMonth"} on:change={changeView}>
        <option value="dayGridMonth">月</option>
        <option value="timeGridWeek">周</option>
        <option value="timeGridDay">日</option>
        <option value="listWeek">日程列表</option>
      </select>
    </label>
    <p class="info">新建日程会写入当前思源数据库。选区后可输入标题，点击「创建」或按 Ctrl+Enter 保存，普通 Enter 只用于确认输入法候选词；也可选择“更多选项”；现有日程点击可打开原始条目。</p>
    {#if busy}<p>正在保存设置…</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
</div>
<style>
  .dodo-calendar-settings { height:100%; overflow-y:auto; padding:14px 16px; box-sizing:border-box; color:var(--b3-theme-on-background); font-size:13px }
  .info { line-height:1.65; color:var(--b3-theme-on-surface-light); margin:6px 0 13px }
  .setting-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 8px }
  select { min-width:148px; height:32px; padding:4px; background:var(--b3-theme-background);color:var(--b3-theme-on-background);border:1px solid var(--b3-border-color);border-radius:5px }
  .error { color:var(--b3-theme-error); overflow-wrap:anywhere }
</style>
