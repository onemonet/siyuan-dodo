<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { showMessage } from "siyuan";
  import BarChartHorizontal from "lucide-svelte/icons/bar-chart-horizontal";
  import ChartArea from "lucide-svelte/icons/chart-area";
  import ChartColumn from "lucide-svelte/icons/chart-column";
  import ChartLine from "lucide-svelte/icons/chart-line";
  import ChartPie from "lucide-svelte/icons/chart-pie";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChartSpline from "lucide-svelte/icons/chart-spline";
  import ChartBarStacked from "lucide-svelte/icons/chart-bar-stacked";
  import Layers from "lucide-svelte/icons/layers";
  import ChartScatter from "lucide-svelte/icons/chart-scatter";
  import Funnel from "lucide-svelte/icons/funnel";
  import Radar from "lucide-svelte/icons/radar";
  import Ellipsis from "lucide-svelte/icons/ellipsis";
  import Palette from "lucide-svelte/icons/palette";
  import Plus from "lucide-svelte/icons/plus";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import { CHART_TYPE_CONFIGS } from "./chart-types";
  import { PALETTE_CONFIGS } from "./echarts-generator";
  import { fieldSelectOptions, fieldColumns } from "../../shared/av/field-binding";
  import FieldSelect from "../../components/ui/FieldSelect.svelte";
  import FieldHelp from "../../components/ui/FieldHelp.svelte";
  import { PREVIEW_HEIGHT_PRESETS, heightPresetValue, isPreviewHeightPreset } from "../../components/ui/preview-height";
  import { DebouncedSettingsSaver } from "../timeline/ui/debounced-settings-saver";
  import NestedSelectMenu from "../../components/ui/NestedSelectMenu.svelte";
  import type { NestedSelectOption } from "../../components/ui/nested-select-types";
  import {
    chartYKind, defaultChartAggregation,
    chartAggregationIsFixed, effectiveChartAggregation,
  } from "./y-axis-fields";
  import {
    ChartAggregation,
    ChartBlockConfig,
    ChartMarkLine,
    ChartSortMode,
    SupportedChartType,
  } from "./types";


  /** Native database chart view settings. */
  export let databaseView: {
    load: () => Promise<{
      ok: boolean; message?: string; headers: string[]; columnIds: string[];
      columnNames: string[]; fieldTypes: string[]; chartType: SupportedChartType;
      config: ChartBlockConfig; sourceId: string; sourceFolded: boolean;
    }>;
    apply: (type: SupportedChartType, config: ChartBlockConfig) => Promise<{ success: boolean; message?: string }>;
    refresh: () => Promise<{ success: boolean; message?: string }>;
  } | undefined = undefined;

  interface PanelTypeDef {
    id: SupportedChartType;
    label: string;
    icon: any;
    fullLabel?: string;
  }

  const PANEL_TYPES: PanelTypeDef[] = [
    { id: "bar-basic", label: "柱状图", icon: ChartColumn },
    { id: "hbar-basic", label: "条形图", icon: BarChartHorizontal },
    { id: "line-basic", label: "折线图", icon: ChartLine },
    { id: "area-basic", label: "面积图", icon: ChartArea },
    { id: "pie-basic", label: "饼图", icon: ChartPie },
  ];

  /** 面板未直接展示的图表类型，收在「更多」二级列表中 */
  const MORE_TYPES: PanelTypeDef[] = [
    { id: "line-smooth", label: "平滑折线", fullLabel: "基础平滑折线图", icon: ChartSpline },
    { id: "line-stack", label: "堆叠折线", fullLabel: "基础堆叠折线图", icon: ChartBarStacked },
    { id: "area-stack", label: "堆叠面积", fullLabel: "基础堆叠面积图", icon: Layers },
    { id: "scatter-basic", label: "散点图", fullLabel: "基础散点图", icon: ChartScatter },
    { id: "funnel-basic", label: "漏斗图", fullLabel: "基础漏斗图", icon: Funnel },
    { id: "radar-basic", label: "雷达图", fullLabel: "基础雷达图", icon: Radar },
  ];

  const AGG_OPTIONS: Array<{ value: ChartAggregation; label: string }> = [
    { value: "value", label: "值" },
    { value: "sum", label: "总和" },
    { value: "avg", label: "平均数" },
    { value: "min", label: "最小值" },
    { value: "max", label: "最大值" },
    { value: "median", label: "中位数" },
    { value: "distinct", label: "不重复的值" },
  ];

  const SORT_OPTIONS: Array<{ value: ChartSortMode; label: string }> = [
    { value: "none", label: "默认顺序" },
    { value: "value-desc", label: "总数 大 → 小" },
    { value: "value-asc", label: "总数 小 → 大" },
    { value: "name", label: "按名称" },
  ];

  const GROUP_NONE = "__none__";

  const PALETTE_OPTIONS = [
    { value: "auto", label: "自动", colors: PALETTE_CONFIGS.colorful.colors,
      darkColors: PALETTE_CONFIGS.colorful.darkColors },
    ...Object.entries(PALETTE_CONFIGS).map(([value, conf]) => ({
      value,
      label: conf.label,
      colors: conf.colors,
      darkColors: conf.darkColors,
    })),
  ];

  let loading = true;
  let errorMsg = "";
  let headers: string[] = [];
  let columnIds: string[] = [];
  let columnNames: string[] = [];
  let fieldTypes: string[] = [];
  $: fieldOptions = fieldSelectOptions({ headers, columnIds, columnNames, fieldTypes });
  $: iconFieldOptions = fieldColumns({ headers, columnIds, columnNames, fieldTypes }).map(column => ({
    value: column.id || column.label, label: column.label, type: column.type,
  }));
  let chartType: SupportedChartType = "bar-basic";
  let config: ChartBlockConfig = {};
  let rangeMode: "auto" | "custom" = "auto";
  let saver: DebouncedSettingsSaver<{ type: SupportedChartType; config: ChartBlockConfig }> | null = null;
  let saving = false;
  let dirty = false;
  let saveError = "";
  let paletteOpen = false;
  let previewDark = false;
  let paletteThemeObserver: MutationObserver | null = null;
  let moreTypesOpen = false;
  let refreshing = false;

  $: xColumn = config.x?.column || "";
  let sortMode: ChartSortMode = "none";
  $: sortMode = config.x?.sort ?? "none";
  $: ignoreZero = config.x?.ignoreZero ?? false;
  $: yColumn = config.y?.column ?? "";
  $: yColumnIndex = fieldOptions.findIndex(option => option.value === yColumn);
  $: yFieldType = yColumnIndex >= 0 ? fieldTypes[yColumnIndex] || "" : "";
  // Multi-series applies to Cartesian charts; pie/funnel/scatter remain single metric.
  $: supportsMultiY = ["bar-basic", "hbar-basic", "line-basic", "line-smooth", "line-stack",
    "area-basic", "area-stack"].includes(chartType);
  $: extraYColumns = config.y?.columns || [];
  $: availableExtraY = fieldOptions.filter((option, index) => fieldTypes[index] === "number"
    && option.value !== xColumn && option.value !== yColumn && !extraYColumns.includes(option.value));
  $: showMultiY = Boolean(databaseView && supportsMultiY && yColumn && yFieldType === "number");
  // Only numeric and multi-select AV fields are usable Y metrics in database charts.
  // Legacy standalone Markdown charts have no AV type metadata; keep their old selector.
  $: yPickerOptions = fieldOptions.filter((option, index) => {
    const type = fieldTypes[index] || "";
    if (databaseView && type !== "number" && (type !== "mSelect" || chartType === "scatter-basic")) return false;
    if (chartType === "scatter-basic" && type && type !== "number" && type !== "lineNumber") return false;
    return true;
  });
  $: availableAggOptions = chartType === "scatter-basic"
    ? AGG_OPTIONS.filter(option => option.value === "value") : AGG_OPTIONS;
  $: yMenuOptions = yPickerOptions.map((option): NestedSelectOption => {
    const index = fieldOptions.findIndex(field => field.value === option.value);
    const type = fieldTypes[index] || "";
    return { value: option.value, label: option.label, type: type || "number",
      children: type === "mSelect" ? undefined : availableAggOptions };
  });
  $: extraYMenuOptions = extraYColumns.map(extra => fieldOptions.flatMap((option, i): NestedSelectOption[] =>
    fieldTypes[i] === "number" && option.value !== xColumn && option.value !== yColumn &&
      (option.value === extra || !extraYColumns.includes(option.value))
      ? [{ value: option.value, label: option.label, type: fieldTypes[i], children: availableAggOptions }]
      : []));
  let agg: ChartAggregation = "sum";
  $: agg = yColumn ? effectiveChartAggregation(yColumn, yFieldType, config.y?.agg) : config.y?.agg ?? "sum";
  $: groupBy = config.y?.groupBy ?? GROUP_NONE;
  let markLines: ChartMarkLine[] = [];
  $: markLines = config.y?.markLines ?? [];
  $: showBarValues = config.style?.showBarValues !== false;
  $: palette = config.style?.palette ?? "auto";
  $: currentPaletteOption =
    PALETTE_OPTIONS.find((option) => option.value === palette) ?? PALETTE_OPTIONS[0];
  $: activeMoreType = MORE_TYPES.find((panelType) => panelType.id === chartType);
  $: rangeMin = config.y?.range?.min ?? "";
  $: rangeMax = config.y?.range?.max ?? "";

  onMount(async () => {
    const readTheme = () => {
      const appearance = (window as any).siyuan?.config?.appearance;
      previewDark = typeof appearance?.mode === "number"
        ? appearance.mode === 1
        : document.documentElement.dataset.theme === "dark" ||
          document.documentElement.dataset.themeMode === "dark";
    };
    readTheme();
    paletteThemeObserver = new MutationObserver(readTheme);
    paletteThemeObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ["class", "style", "data-theme", "data-theme-mode"],
    });
    if (databaseView) {
      saver = new DebouncedSettingsSaver(
        draft => databaseView!.apply(draft.type, draft.config),
        (state, message) => {
          saving = state === "saving";
          dirty = state !== "saved";
          saveError = state === "error" ? message || "图表设置自动保存失败" : "";
          if (state === "error") showMessage(saveError, 5500, "error");
        },
      );
    }
    await loadContext();
  });

  async function loadContext() {
    if (!databaseView) { errorMsg = "请从数据库视图打开图表设置。"; loading = false; return; }
    try {
      const context = await databaseView.load();
      if (!context.ok) throw new Error(context.message || "读取图表设置失败");
      headers = context.headers;
      columnIds = context.columnIds;
      columnNames = context.columnNames;
      fieldTypes = context.fieldTypes;
      if (context.chartType && CHART_TYPE_CONFIGS[context.chartType]) chartType = context.chartType;
      config = context.config || {};
      rangeMode = config.y?.range ? "custom" : "auto";
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error);
    } finally { loading = false; }
  }

  onDestroy(() => {
    paletteThemeObserver?.disconnect();
    // Flush the last edit on close rather than cancelling its timer.
    void saver?.flush();
  });
  function updateConfig(mutate: (draft: ChartBlockConfig) => void) {
    const draft: ChartBlockConfig = JSON.parse(JSON.stringify(config || {}));
    mutate(draft);
    config = draft;
    scheduleApply();
  }

  function scheduleApply() {
    const snapshot = JSON.parse(JSON.stringify(config || {})) as ChartBlockConfig;
    saver?.schedule({ type: chartType, config: snapshot });
  }

  function setHeightPreset(raw: string) {
    const height = Number(raw);
    if (!isPreviewHeightPreset(height)) return;
    updateConfig(draft => { draft.height = height; });
  }
  function pickType(type: SupportedChartType) {
    if (!CHART_TYPE_CONFIGS[type]) {
      return;
    }
    chartType = type;
    moreTypesOpen = false;
    if (type === "scatter-basic") {
      const currentY = config.y?.column;
      const index = fieldOptions.findIndex(option => option.value === currentY);
      const currentType = index < 0 ? "" : fieldTypes[index] || "";
      if (!currentY || chartYKind(currentY, currentType) !== "numeric") {
        const numeric = fieldOptions.find((option, i) =>
          chartYKind(option.value, fieldTypes[i] || "") === "numeric" && option.value !== xColumn);
        config = { ...config, y: { ...config.y, column: numeric?.value, agg: "value" } };
      } else {
        config = { ...config, y: { ...config.y, agg: "value" } };
      }
    }
    scheduleApply();
  }

  async function refreshChart() {
    if (refreshing) {
      return;
    }
    refreshing = true;
    try {
      if (saver && !(await saver.flush())) return;
      if (!databaseView) throw new Error("数据库图表设置不可用。");
      const result = await databaseView.refresh();
      showMessage(result.success ? "已根据数据库视图刷新" : result.message || "刷新图表失败",
        4500, result.success ? "info" : "error");
    } catch (error) {
      showMessage("刷新图表失败：" + (error instanceof Error ? error.message : String(error)), 5500, "error");
    } finally {
      refreshing = false;
    }
  }

  function setXColumn(value: string) {
    updateConfig((draft) => {
      draft.x = { ...draft.x, column: value || undefined };
    });
  }

  function setSort(value: string) {
    updateConfig((draft) => {
      draft.x = { ...draft.x, sort: value as ChartSortMode };
    });
  }

  function setIgnoreZero(checked: boolean) {
    updateConfig((draft) => {
      draft.x = { ...draft.x, ignoreZero: checked };
    });
  }

  function setYColumn(value: string, calculation?: string) {
    const index = fieldOptions.findIndex(option => option.value === value);
    const type = index >= 0 ? fieldTypes[index] || "" : "";
    const kind = chartYKind(value, type);
    updateConfig((draft) => {
      const oldKind = chartYKind(draft.y?.column || "", fieldTypes[fieldOptions.findIndex(option => option.value === draft.y?.column)] || "");
      const agg = chartAggregationIsFixed(kind)
        ? defaultChartAggregation(kind)
        : calculation ? calculation as ChartAggregation
        : chartType === "scatter-basic" || oldKind !== "numeric" || !draft.y?.column
          ? "value" : draft.y?.agg || "value";
      // Replacing the primary metric must not leave duplicates or mixed numeric/multi-select series.
      const columns = kind === "numeric" && type === "number"
        ? (draft.y?.columns || []).filter(id => id !== value) : [];
      draft.y = { ...draft.y, column: value || undefined, columns, agg };
    });
  }

  function addYColumn() {
    const next = availableExtraY[0]?.value;
    if (!next) return;
    updateConfig((draft) => {
      draft.y = { ...draft.y, columns: [...(draft.y?.columns || []), next], groupBy: null };
    });
  }

  function setExtraYColumn(index: number, value: string, calculation?: string) {
    updateConfig((draft) => {
      const columns = [...(draft.y?.columns || [])];
      if (value === draft.y?.column || columns.some((id, i) => id === value && i !== index)) return;
      columns[index] = value;
      draft.y = { ...draft.y, columns, ...(calculation ? { agg: calculation as ChartAggregation } : {}) };
    });
  }

  function removeExtraYColumn(index: number) {
    updateConfig((draft) => {
      draft.y = { ...draft.y, columns: (draft.y?.columns || []).filter((_, i) => i !== index) };
    });
  }

  function setGroupBy(value: string) {
    updateConfig((draft) => {
      draft.y = { ...draft.y, groupBy: value === GROUP_NONE ? null : value };
    });
  }

  function setRangeMode(mode: "auto" | "custom") {
    rangeMode = mode;
    updateConfig((draft) => {
      draft.y = { ...draft.y, range: mode === "custom" ? draft.y?.range || {} : null };
    });
  }

  function handleRangeModeChange(value: string) {
    setRangeMode(value === "custom" ? "custom" : "auto");
  }

  function setRangeBound(bound: "min" | "max", raw: string) {
    const parsed = raw === "" ? null : Number(raw);
    updateConfig((draft) => {
      const range = { ...(draft.y?.range || {}) };
      range[bound] = Number.isFinite(parsed as number) ? (parsed as number) : null;
      draft.y = { ...draft.y, range };
    });
  }

  function addMarkLine() {
    updateConfig((draft) => {
      const lines = [...(draft.y?.markLines ?? [])];
      lines.push({ value: 0, label: "" });
      draft.y = { ...draft.y, markLines: lines };
    });
  }

  function setMarkLine(index: number, patch: Partial<ChartMarkLine>) {
    updateConfig((draft) => {
      const lines = [...(draft.y?.markLines ?? [])];
      lines[index] = { ...lines[index], ...patch };
      draft.y = { ...draft.y, markLines: lines };
    });
  }

  function removeMarkLine(index: number) {
    updateConfig((draft) => {
      const lines = (draft.y?.markLines ?? []).filter((_, i) => i !== index);
      draft.y = { ...draft.y, markLines: lines };
    });
  }

  function setShowBarValues(checked: boolean) {
    updateConfig((draft) => {
      draft.style = { ...draft.style, showBarValues: checked ? undefined : false };
      if (checked) delete draft.style.showBarValues;
    });
  }

  function setPalette(value: string) {
    paletteOpen = false;
    updateConfig((draft) => {
      draft.style = { ...draft.style, palette: value === "auto" ? undefined : value };
      if (!draft.style.palette) {
        delete draft.style.palette;
      }
    });
  }

  function currentPaletteColors(colors: string[], darkColors: string[], isDark: boolean, limit = 6): string[] {
    return (isDark ? darkColors : colors).slice(0, limit);
  }
</script>

<svelte:window on:click={() => { paletteOpen = false; moreTypesOpen = false; }} />

<div class="chart-settings">
  {#if loading}
    <div class="chart-settings__state">加载中…</div>
  {:else if errorMsg}
    <div class="chart-settings__state chart-settings__state--error">{errorMsg}</div>
  {:else}
    <div class="section-title">图表类型</div>
    <div class="type-more-wrap">
      <div class="type-row">
        {#each PANEL_TYPES as panelType (panelType.id)}
          <button
            class="type-btn"
            class:is-active={chartType === panelType.id}
            title={panelType.label}
            on:click={() => pickType(panelType.id)}
          >
            <svelte:component this={panelType.icon} size={20} strokeWidth={1.8} />
            <span>{panelType.label}</span>
          </button>
        {/each}
        <button
          class="type-btn"
          class:is-active={!!activeMoreType || moreTypesOpen}
          title="更多图表类型"
          on:click={(event) => {
            event.stopPropagation();
            moreTypesOpen = !moreTypesOpen;
          }}
        >
          {#if activeMoreType}
            <svelte:component this={activeMoreType.icon} size={20} strokeWidth={1.8} />
            <span>{activeMoreType.label}</span>
          {:else}
            <Ellipsis size={20} strokeWidth={1.8} />
            <span>更多</span>
          {/if}
        </button>
      </div>
      {#if moreTypesOpen}
        <div class="type-more-list" on:click|stopPropagation>
          {#each MORE_TYPES as moreType (moreType.id)}
            <button
              class="palette-row"
              class:is-active={chartType === moreType.id}
              on:click={() => pickType(moreType.id)}
            >
              <span class="row-label">
                <svelte:component this={moreType.icon} size={15} strokeWidth={2} />
                {moreType.fullLabel ?? moreType.label}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="section-title">预览设置</div>
    <div class="row">
      <span class="row-label">高度<FieldHelp description="选择当前图表视图的预览高度，仅影响此视图。" /></span>
      <select class="b3-select row-control" value={heightPresetValue(config.height)}
        on:change={event => setHeightPreset(event.currentTarget.value)}>
        {#each PREVIEW_HEIGHT_PRESETS as preset (preset.value)}
          <option value={preset.value}>{preset.label}</option>
        {/each}
      </select>
    </div>

    <div class="section-title">X 轴</div>
    <div class="row">
      <span class="row-label">显示内容</span>
      <FieldSelect options={iconFieldOptions} value={xColumn} allowEmpty={false}
        ariaLabel="选择 X 轴字段" placeholder="请选择 X 轴列"
        on:change={(event) => setXColumn(event.detail)}/>
    </div>
    <div class="row">
      <span class="row-label">排序方式</span>
      <select class="b3-select row-control" value={sortMode} on:change={(event) => setSort(event.currentTarget.value)}>
        {#each SORT_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <div class="row">
      <span class="row-label">忽略零值</span>
      <input
        type="checkbox"
        class="b3-switch"
        checked={ignoreZero}
        on:change={(event) => setIgnoreZero(event.currentTarget.checked)}
      />
    </div>

    {#if chartType !== "radar-basic"}
    <div class="section-title">Y 轴</div>
    <div class="row">
      <span class="row-label">显示内容</span>
      <NestedSelectMenu options={yMenuOptions} value={yColumn} subValue={agg}
        ariaLabel="选择 Y 轴字段与统计方式"
        placeholder={yColumn ? "原字段不可用，请重新选择" : "选择数字或多选列"}
        on:select={(event) => setYColumn(event.detail.value, event.detail.subValue)}/>
    </div>
    {#if showMultiY}
      {#each extraYColumns as extra, index (index)}
        <div class="row row--sub">
          <span class="row-label">数值列 {index + 2}</span>
          <div class="extra-y-control">
            <NestedSelectMenu compact options={extraYMenuOptions[index]} value={extra} subValue={agg}
              ariaLabel={`选择数值列 ${index + 2} 与统计方式`}
              placeholder="原字段不存在，请重新选择"
              on:select={(event) => setExtraYColumn(index, event.detail.value, event.detail.subValue)}/>
            <button type="button" class="extra-y-remove" title="移除这一列"
              aria-label="移除数值列" on:click={() => removeExtraYColumn(index)}>
              <Trash2 size={14} strokeWidth={1.8}/>
            </button>
          </div>
        </div>
      {/each}
      {#if availableExtraY.length > 0}
        <div class="row row--sub">
          <span class="row-label"></span>
          <button type="button" class="extra-y-add" on:click={addYColumn}>
            <Plus size={14} strokeWidth={1.8}/> 添加数值列
          </button>
        </div>
      {/if}
    {/if}
    {#if !showMultiY || extraYColumns.length === 0}
    <div class="row">
      <span class="row-label">分组方式</span>
      <FieldSelect options={iconFieldOptions} value={groupBy === GROUP_NONE ? "" : groupBy}
        placeholder="不使用" ariaLabel="选择分组字段" on:change={(event) => setGroupBy(event.detail)}/>
    </div>
    {/if}
    <div class="row">
      <span class="row-label">范围</span>
      <select class="b3-select row-control" value={rangeMode} on:change={(event) => handleRangeModeChange(event.currentTarget.value)}>
        <option value="auto">自动</option>
        <option value="custom">自定义</option>
      </select>
    </div>
    {#if rangeMode === "custom"}
      <div class="row row--sub">
        <span class="row-label">最小值 / 最大值</span>
        <span class="range-inputs">
          <input
            class="b3-text-field range-input"
            type="number"
            step="any"
            placeholder="自动"
            value={rangeMin}
            on:input={(event) => setRangeBound("min", event.currentTarget.value)}
          />
          <span class="range-sep">~</span>
          <input
            class="b3-text-field range-input"
            type="number"
            step="any"
            placeholder="自动"
            value={rangeMax}
            on:input={(event) => setRangeBound("max", event.currentTarget.value)}
          />
        </span>
      </div>
    {/if}
    <div class="row row--top">
      <span class="row-label">参考线（{markLines.length} 条）</span>
      <button class="b3-button b3-button--small add-markline" on:click={addMarkLine}>
        <Plus size={14} strokeWidth={2} />
        添加
      </button>
    </div>
    {#each markLines as markLine, index (index)}
      <div class="row row--sub markline-row">
        <input
          class="b3-text-field markline-value"
          type="number"
          step="any"
          placeholder="数值"
          value={markLine.value}
          on:input={(event) => setMarkLine(index, { value: Number(event.currentTarget.value) })}
        />
        <input
          class="b3-text-field markline-label"
          type="text"
          placeholder="名称（可选）"
          value={markLine.label ?? ""}
          on:input={(event) => setMarkLine(index, { label: event.currentTarget.value })}
        />
        <button class="markline-remove" title="删除参考线" on:click={() => removeMarkLine(index)}>
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    {/each}

    {/if}

    <div class="section-title">风格</div>
    {#if chartType === "bar-basic" || chartType === "hbar-basic"}
      <div class="row">
        <span class="row-label">显示数值</span>
        <input type="checkbox" class="b3-switch" checked={showBarValues}
          on:change={(event) => setShowBarValues(event.currentTarget.checked)}/>
      </div>
    {/if}
    <div class="palette-wrap">
      {#if paletteOpen}
        <div class="palette-list">
          {#each PALETTE_OPTIONS as option (option.value)}
            <button
              class="palette-row"
              class:is-active={palette === option.value}
              on:click|stopPropagation={() => setPalette(option.value)}
            >
              <span class="palette-label">{option.label}</span>
              <span class="swatches">
                {#each currentPaletteColors(option.colors, option.darkColors, previewDark) as color (color)}
                  <span class="swatch" style="background:{color}"></span>
                {/each}
              </span>
            </button>
          {/each}
        </div>
      {/if}
      <div
        class="row row--click"
        on:click={(event) => {
          event.stopPropagation();
          paletteOpen = !paletteOpen;
        }}
        on:keydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
            paletteOpen = !paletteOpen;
          }
        }}
        role="button"
        tabindex="0"
      >
        <span class="row-label"><Palette size={15} strokeWidth={2} /> 颜色</span>
        <span class="palette-trigger">
          <span class="swatches">
            {#each currentPaletteColors(currentPaletteOption.colors, currentPaletteOption.darkColors, previewDark, 4) as color (color)}
              <span class="swatch" style="background:{color}"></span>
            {/each}
          </span>
          {currentPaletteOption.label}
          <ChevronDown
            size={14}
            strokeWidth={2}
            class={"palette-chevron" + (paletteOpen ? " is-open" : "")}
          />
        </span>
      </div>
    </div>

    <div class="chart-settings__footer">
      <span class:chart-settings__save-error={Boolean(saveError)}>
        {saveError ? "自动保存失败：" + saveError : saving ? "保存中…" : dirty ? "等待自动保存…" : "修改后自动保存并刷新预览"}
      </span>
      <button class="footer-refresh" disabled={refreshing} on:click={refreshChart}>
        <RefreshCw size={13} strokeWidth={2} />
        刷新图表
      </button>
    </div>
  {/if}
</div>

<style>
  .chart-settings {
    padding: 4px 6px 12px;
    font-size: 14px;
    color: var(--b3-theme-on-surface);
    overflow: auto;
    height: 100%;
    box-sizing: border-box;
  }

  /* 主题/思源会把 svg fill 覆盖成 currentColor，lucide 是描边图标，强制恢复描边风格 */
  .chart-settings :global(svg:not(.dodo-field-select-icon):not(.dodo-ui-av-icon)) {
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  .chart-settings :global(svg:not(.dodo-field-select-icon):not(.dodo-ui-av-icon) *) {
    fill: none !important;
    stroke: inherit !important;
    stroke-linecap: inherit !important;
    stroke-linejoin: inherit !important;
  }

  .chart-settings__state {
    padding: 24px 12px;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
  }

  .chart-settings__save-error { color: var(--b3-theme-error, #d23f31); }

  .chart-settings__state--error {
    color: var(--b3-theme-error, #d23f31);
  }

  .section-title {
    margin: 14px 8px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface-light);
  }

  .source-fold-row {
    padding-top: 10px;
    padding-bottom: 2px;
  }

  .source-input {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }

  .type-row {
    display: flex;
    gap: 8px;
    padding: 0 8px;
  }

  .type-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 0 8px;
    font-size: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
  }

  .type-btn.is-active {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
    background: var(--b3-theme-primary-lightest, rgba(53, 117, 240, 0.1));
  }

  .type-more-wrap {
    position: relative;
  }

  .type-more-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 20;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    overflow-y: auto;
    max-height: 240px;
    background: var(--b3-theme-background);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .footer-refresh {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: var(--b3-theme-primary);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
  }

  .footer-refresh:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 8px;
  }

  .row--top {
    align-items: center;
  }

  .row--sub {
    padding-top: 0;
  }

  .row-label {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .extra-y-control { display: flex; align-items: center; gap: 6px; }
  .extra-y-control { width: 160px; justify-content: space-between; }
  .extra-y-remove, .extra-y-add {
    display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
    color: var(--b3-theme-on-surface-light); background: transparent; border: 0;
    padding: 4px; border-radius: 4px;
  }
  .extra-y-add { color: var(--b3-theme-primary); }
  .extra-y-remove:hover, .extra-y-add:hover { background: var(--b3-list-hover); }

  .row-control {
    width: 160px;
    flex-shrink: 0;
  }

  .range-inputs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .range-input {
    width: 72px;
    text-align: center;
  }

  .range-sep {
    color: var(--b3-theme-on-surface-light);
  }

  .add-markline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    height: 26px;
  }

  .markline-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .markline-value {
    width: 80px;
    flex-shrink: 0;
  }

  .markline-label {
    flex: 1;
    min-width: 0;
  }

  .markline-remove {
    border: none;
    background: transparent;
    color: var(--b3-theme-on-surface-light);
    cursor: pointer;
    padding: 4px;
    display: inline-flex;
  }

  .markline-remove:hover {
    color: var(--b3-theme-error, #d23f31);
  }

  .chart-settings__footer {
    margin: 16px 8px 0;
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  /* ---- 颜色色卡 ---- */
  .row--click {
    cursor: pointer;
    border-radius: 6px;
  }

  .row--click:hover {
    background: var(--b3-list-hover, rgba(0, 0, 0, 0.04));
  }

  .palette-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--b3-theme-on-surface);
    font-size: 13px;
  }

  .chart-settings :global(.palette-chevron) {
    transition: transform 0.15s ease;
    color: var(--b3-theme-on-surface-light);
  }

  .chart-settings :global(.palette-chevron.is-open) {
    transform: rotate(180deg);
  }

  .palette-wrap {
    position: relative;
  }

  /* 向上弹出：锚定在颜色行上方 */
  .palette-list {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 8px;
    right: 8px;
    z-index: 20;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    overflow-y: auto;
    max-height: 264px;
    background: var(--b3-theme-background);
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
  }

  .palette-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }

  .palette-row:hover {
    background: var(--b3-list-hover, rgba(0, 0, 0, 0.04));
  }

  .palette-row.is-active {
    color: var(--b3-theme-primary);
    background: var(--b3-theme-primary-lightest, rgba(53, 117, 240, 0.1));
  }

  .palette-label {
    white-space: nowrap;
  }

  .swatches {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
</style>
