<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import Plus from "lucide-svelte/icons/plus";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import { SqlBlockService } from "./sql-block-service";
  import type {
    SqlBlockConfig,
    SqlFilter,
    SqlFilterField,
    SqlFilterOperator,
    SqlSortField,
    SqlSortOrder,
  } from "./sql-block-service";
  import {
    SQL_FILTER_OPERATORS,
    SQL_MAX_FILTERS,
  } from "./sql-block-service";

  export let sqlBlockId: string;

  const FIELD_OPTIONS: Array<{ value: SqlFilterField; label: string }> = [
    { value: "content", label: "内容" },
    { value: "type", label: "块类型" },
    { value: "created", label: "创建时间" },
    { value: "updated", label: "更新时间" },
    { value: "id", label: "块 ID" },
    { value: "parent_id", label: "父块 ID" },
    { value: "root_id", label: "文档 ID" },
    { value: "attribute", label: "自定义属性" },
  ];
  const FIELD_LABELS = new Map(FIELD_OPTIONS.map((option) => [option.value, option.label]));
  const OPERATOR_LABELS: Record<SqlFilterOperator, string> = {
    contains: "包含",
    equals: "等于",
    not_equals: "不等于",
    starts_with: "开头为",
    ends_with: "结尾为",
    before: "早于",
    after: "晚于",
    last_days: "最近 N 天",
    is_empty: "为空",
    is_not_empty: "不为空",
  };
  const TYPE_OPTIONS = [
    { value: "d", label: "文档" },
    { value: "h", label: "标题" },
    { value: "p", label: "段落" },
    { value: "l", label: "列表" },
    { value: "i", label: "列表项" },
    { value: "t", label: "表格" },
    { value: "c", label: "代码" },
    { value: "m", label: "公式" },
    { value: "b", label: "引述" },
    { value: "s", label: "超级块" },
  ];
  const SORT_OPTIONS: Array<{ value: SqlSortField; label: string }> = [
    { value: "updated", label: "更新时间" },
    { value: "created", label: "创建时间" },
    { value: "content", label: "内容" },
    { value: "attribute_value", label: "属性值" },
    { value: "random", label: "随机" },
  ];

  let loading = true;
  let errorMsg = "";
  let saving = false;
  let saveQueued = false;
  let dirty = false;
  let config: SqlBlockConfig = SqlBlockService.getDefaultConfig();
  let statement = "";

  onMount(() => {
    void loadContext();
  });

  async function loadContext(): Promise<void> {
    const result = await SqlBlockService.getSQLSettings(sqlBlockId);
    if (!result.ok) {
      errorMsg = result.message || "读取 SQL 设置失败";
    } else {
      config = result.config;
      statement = result.statement;
    }
    dirty = false;
    loading = false;
  }

  function updateConfig(patch: Partial<SqlBlockConfig>): void {
    config = SqlBlockService.normalizeConfig({ ...config, ...patch });
    dirty = true;
  }

  async function saveSettings(): Promise<void> {
    if (saving) {
      saveQueued = true;
      return;
    }
    saving = true;
    try {
      const result = await SqlBlockService.applySQLSettings(sqlBlockId, config);
      if (!result.success) {
        showMessage(result.message || "保存 SQL 设置失败");
        return;
      }
      statement = SqlBlockService.buildStatement(config);
      dirty = false;
    } finally {
      saving = false;
      if (saveQueued) {
        saveQueued = false;
        void saveSettings();
      }
    }
  }

  function applySql(): void {
    dirty = true;
    void saveSettings();
  }

  function addFilter(): void {
    if (config.filters.length >= SQL_MAX_FILTERS) {
      return;
    }
    const filters = [
      ...config.filters,
      { field: "content", operator: "contains", value: "" } as SqlFilter,
    ];
    updateConfig({ filters });
  }

  function updateFilter(index: number, patch: Partial<SqlFilter>): void {
    const filters = config.filters.map((filter, filterIndex) =>
      filterIndex === index ? { ...filter, ...patch } : filter,
    );
    updateConfig({ filters });
  }

  function setFilterField(index: number, field: SqlFilterField): void {
    const operator = SQL_FILTER_OPERATORS[field][0];
    updateFilter(index, { field, operator, value: "" });
  }

  function removeFilter(index: number): void {
    updateConfig({ filters: config.filters.filter((_filter, filterIndex) => filterIndex !== index) });
  }

  function isUnary(operator: SqlFilterOperator): boolean {
    return operator === "is_empty" || operator === "is_not_empty";
  }

  function filterOperators(field: SqlFilterField): SqlFilterOperator[] {
    return [...SQL_FILTER_OPERATORS[field]];
  }

  function fieldPlaceholder(filter: SqlFilter): string {
    if (filter.field === "type") {
      return "选择块类型";
    }
    if (filter.field === "attribute") {
      return filter.operator === "contains"
        ? `属性名="属性值"，属性值用包含匹配`
        : `属性名="属性值"，只填属性名则只按属性名查询`;
    }
    if (filter.field === "created" || filter.field === "updated") {
      return filter.operator === "last_days" ? "天数" : "YYYYMMDDhhmmss";
    }
    return `输入${FIELD_LABELS.get(filter.field) || "值"}`;
  }

  function fieldValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
  }

  function setBlockTypeValue(index: number, event: Event): void {
    updateFilter(index, { value: fieldValue(event) });
  }

  function setFieldFromEvent(index: number, event: Event): void {
    setFilterField(index, fieldValue(event) as SqlFilterField);
  }

  function setOperatorFromEvent(index: number, event: Event): void {
    updateFilter(index, { operator: fieldValue(event) as SqlFilterOperator });
  }

  function setSortFieldFromEvent(event: Event): void {
    updateConfig({ sortField: fieldValue(event) as SqlSortField });
  }

  function setSortOrderFromEvent(event: Event): void {
    updateConfig({ sortOrder: fieldValue(event) as SqlSortOrder });
  }
</script>

<div class="dodo-sql-settings-panel">
  {#if loading}
    <div class="state">加载中…</div>
  {:else if errorMsg}
    <div class="state error">{errorMsg}</div>
  {:else}
    <div class="section-title">
      筛选条件
      <span class="count">{config.filters.length}/{SQL_MAX_FILTERS}</span>
    </div>

    {#if config.filters.length === 0}
      <div class="empty-filter">未设置筛选条件，将显示除嵌入块外的所有块。</div>
    {/if}

    {#each config.filters as filter, index (index)}
      <div class="filter-row">
        <select
          class="b3-select filter-field"
          value={filter.field}
          aria-label="筛选字段"
          on:change={(event) => setFieldFromEvent(index, event)}
        >
          {#each FIELD_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <select
          class="b3-select filter-operator"
          value={filter.operator}
          aria-label="筛选操作"
          on:change={(event) => setOperatorFromEvent(index, event)}
        >
          {#each filterOperators(filter.field) as operator (operator)}
            <option value={operator}>{OPERATOR_LABELS[operator]}</option>
          {/each}
        </select>
        {#if filter.field === "type" && !isUnary(filter.operator)}
          <select
            class="b3-select filter-value"
            value={filter.value}
            aria-label="块类型"
            on:change={(event) => setBlockTypeValue(index, event)}
          >
            <option value="">选择类型</option>
            {#each TYPE_OPTIONS as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else if !isUnary(filter.operator)}
          <input
            class="b3-text-field filter-value"
            value={filter.value}
            placeholder={fieldPlaceholder(filter)}
            aria-label="筛选值"
            on:input={(event) => updateFilter(index, { value: fieldValue(event) })}
          />
        {/if}
      <button
          type="button"
          class="icon-button"
          title="删除条件"
          aria-label="删除条件"
          on:click={() => removeFilter(index)}
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      </div>
    {/each}

    <button
      type="button"
      class="b3-button b3-button--outline add-filter"
      disabled={config.filters.length >= SQL_MAX_FILTERS}
      on:click={addFilter}
    >
      <Plus size={14} strokeWidth={2} />
      添加条件
    </button>

    <div class="section-title">排序与数量</div>
    <div class="field-row">
      <label class="field">
        <span>排序字段</span>
        <select
          class="b3-select"
          value={config.sortField}
          on:change={setSortFieldFromEvent}
        >
          {#each SORT_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>方向</span>
        <select
          class="b3-select"
          value={config.sortOrder}
          on:change={setSortOrderFromEvent}
        >
          <option value="DESC">降序</option>
          <option value="ASC">升序</option>
        </select>
      </label>
    </div>
    <label class="field">
      <span>最多显示</span>
      <input
        class="b3-text-field"
        type="number"
        min="1"
        max="200"
        step="1"
        value={config.limit}
        on:change={(event) => updateConfig({ limit: Number(fieldValue(event)) })}
      />
    </label>

    <div class="section-title">生成的 SQL</div>
    <pre class="sql-preview">{statement}</pre>
    <div class="sql-actions">
      <button
        type="button"
        class="b3-button apply-sql"
        disabled={saving}
        on:click={applySql}
      >
        <RefreshCw size={14} strokeWidth={2} />
        生成并应用 SQL
      </button>
    </div>
    <div class="footer">
      {saving
        ? "保存中…"
        : dirty
          ? "已修改，点击按钮后写入"
          : "SQL 已同步到原生嵌入块"}
    </div>
  {/if}
</div>

<style>
  .dodo-sql-settings-panel {
    display: flex;
    min-height: 0;
    height: 100%;
    box-sizing: border-box;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding: 8px 10px 12px;
    color: var(--b3-theme-on-surface);
    font-size: 13px;
  }

  .dodo-sql-settings-panel :global(svg) {
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  .dodo-sql-settings-panel :global(svg *) {
    fill: none !important;
    stroke: inherit !important;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    font-weight: 600;
  }

  .count,
  .footer {
    color: var(--b3-theme-on-surface-light);
    font-size: 11px;
    font-weight: 400;
  }

  .empty-filter {
    padding: 7px 8px;
    border: 1px dashed var(--b3-border-color);
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.5;
  }

  .filter-row {
    display: grid;
    grid-template-columns: minmax(74px, 0.9fr) minmax(74px, 0.9fr) minmax(92px, 1.2fr) 24px;
    align-items: center;
    gap: 5px;
  }

  .filter-field,
  .filter-operator,
  .filter-value {
    min-width: 0;
    width: 100%;
    height: 28px;
    box-sizing: border-box;
    font-size: 12px;
  }

  .filter-value {
    padding: 0 6px;
    text-align: center;
  }

  .icon-button {
    display: inline-flex;
    width: 24px;
    height: 28px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--b3-theme-on-surface-light);
    cursor: pointer;
  }

  .icon-button:hover {
    color: var(--b3-theme-error, #d23f31);
  }

  .add-filter {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    font-size: 12px;
  }

  .sql-actions {
    display: flex;
    justify-content: flex-end;
  }

  .apply-sql {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    font-size: 12px;
  }

  .field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr);
    gap: 8px;
  }

  .field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .field .b3-select,
  .field .b3-text-field {
    width: 100%;
    height: 28px;
    box-sizing: border-box;
  }

  .sql-preview {
    max-height: 150px;
    margin: 0;
    padding: 8px;
    overflow: auto;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);
    font: 11px/1.5 monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .footer {
    text-align: center;
  }

  .state {
    display: grid;
    min-height: 180px;
    place-items: center;
    color: var(--b3-theme-on-surface-light);
  }

  .state.error {
    color: var(--b3-theme-error);
  }
</style>
