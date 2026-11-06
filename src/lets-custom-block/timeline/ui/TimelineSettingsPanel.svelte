<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { showMessage } from "siyuan";

  import type { TimelineBlockConfig, TimelineFieldMapping } from "../types";

  import { TIMELINE_FIELD_DEFINITIONS } from "../services/field-mapping";
  import FieldMapping from "../../../components/ui/FieldMapping.svelte";
  import FieldHelp from "../../../components/ui/FieldHelp.svelte";
  import { createAvField } from "../../../components/ui/av-create-field";
  import { PREVIEW_HEIGHT_PRESETS, heightPresetValue, isPreviewHeightPreset } from "../../../components/ui/preview-height";
  import type { FieldTable } from "../../../shared/av/field-binding";

  import type { DatabaseTimelineViewSettings } from "./database-view-settings";
  import { DebouncedSettingsSaver } from "./debounced-settings-saver";

  export let timelineBlockId: string;
  export let databaseView: DatabaseTimelineViewSettings | undefined = undefined;

  let loading = true;
  let errorMsg = "";
  let headers: string[] = [];
  let columnIds: string[] = [];
  let columnNames: string[] = [];
  let fieldTypes: string[] = [];
  $: mappingTable = { headers, columnIds, columnNames, fieldTypes } satisfies FieldTable;
  $: mapping = config.fieldMapping || {};
  let config: TimelineBlockConfig = {};
  let sourceName = "";
  let dirty = false;
  let saveError = "";
  let databaseSaver: DebouncedSettingsSaver<TimelineBlockConfig> | null = null;
  let saving = false;
  let refreshing = false;
  let creatingField = "";

  onMount(async () => {
    if (databaseView) {
      databaseSaver = new DebouncedSettingsSaver(
        draft => databaseView!.apply(draft),
        (state, message) => {
          saving = state === "saving";
          dirty = state !== "saved";
          saveError = state === "error" ? message || "自动保存失败" : "";
          if (state === "error") showMessage(saveError, 5500, "error");
        },
      );
    }
    await loadContext();
  });

  async function loadContext() {
    if (!databaseView) {
      errorMsg = "请从数据库时间线视图打开设置。";
      loading = false;
      return;
    }
    try {
      const data = await databaseView.load();
      headers = data.headers;
      columnIds = data.columnIds;
      columnNames = data.columnNames;
      fieldTypes = data.fieldTypes;
      sourceName = data.sourceName || "时间线";
      config = { ...data.config, sourceType: "database" };
      dirty = false;
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }
  onDestroy(() => {
    // A quick close must not discard the last field or appearance change.
    // The adapter remains valid after the dialog component is destroyed.
    void databaseSaver?.flush();
  });

  function updateConfig(mutate: (draft: TimelineBlockConfig) => void) {
    const draft: TimelineBlockConfig = JSON.parse(JSON.stringify(config || {}));
    mutate(draft);
    config = draft;
    databaseSaver?.schedule(draft);
  }

  function setHeightPreset(raw: string) {
    const height = Number(raw);
    if (!isPreviewHeightPreset(height)) return;
    updateConfig((draft) => {
      draft.height = height;
    });
  }

  function setTimenavHeightPercent(raw: string) {
    const parsed = Number(raw);
    updateConfig((draft) => {
      draft.timenavHeightPercent = raw !== "" && Number.isFinite(parsed)
        ? Math.min(100, Math.max(0, Math.round(parsed)))
        : 50;
    });
  }

  function setStartPosition(value: string) {
    updateConfig((draft) => {
      draft.startPosition = value === "last" ? "last" : "first";
    });
  }

  function handleMappingChange(detail: { field: string; value: string }) {
    setMappingField(detail.field as keyof TimelineFieldMapping, detail.value);
  }

  function setMappingField(field: keyof TimelineFieldMapping, value: string) {
    updateConfig((draft) => {
      const mapping: TimelineFieldMapping = { ...(draft.fieldMapping || {}) };
      mapping[field] = value;
      // Empty means explicitly not in use; never delete and silently rematch.
      draft.fieldMapping = mapping;
    });
  }

  async function createMappingField(key: string) {
    if (creatingField || config.sourceType !== "database" || !config.sourceAvID) return;
    const definition = TIMELINE_FIELD_DEFINITIONS.find(field => field.key === key);
    if (!definition) return;
    creatingField = key;
    let createdName = "";
    try {
      // Save any pending database edits before creating and binding a new field.
      if (databaseView && databaseSaver && !(await databaseSaver.flush())) return;
      const created = await createAvField({
        avID: config.sourceAvID,
        blockID: config.sourceBlockId,
        viewID: config.sourceViewID,
        field: definition,
        existingNames: columnNames,
      });
      createdName = created.name;
      // Update the dropdown without discarding other unsaved settings.
      headers = [...headers, created.name];
      columnNames = [...columnNames, created.name];
      columnIds = [...columnIds, created.id];
      fieldTypes = [...fieldTypes, created.type];
      setMappingField(definition.key, created.id);
      // Creation is explicit: commit now instead of relying on the debounce
      // if the user immediately closes the settings dialog.
      if (databaseSaver && !(await databaseSaver.flush())) {
        throw new Error("绑定字段自动保存失败，请重试。");
      }
      showMessage("已创建并绑定字段「" + created.name + "」");
    } catch (error) {
      showMessage((createdName ? "字段已创建，请手动绑定：" : "添加字段失败：") +
        (error instanceof Error ? error.message : String(error)), 5500, "error");
    } finally {
      creatingField = "";
    }
  }
  async function refreshTimeline() {
    if (refreshing) {
      return;
    }
    refreshing = true;
    try {
      // Refresh must not preview stale settings while a debounce is pending.
      if (databaseView && databaseSaver && !(await databaseSaver.flush())) return;
      if (!databaseView) throw new Error("数据库时间线视图不可用。");
      const result = await databaseView.refresh();
      showMessage(
        result.success ? "已根据数据库视图刷新" : result.message || "刷新时间线失败",
        4500, result.success ? "info" : "error"
      );
    } catch (error) {
      showMessage("刷新时间线失败：" +
        (error instanceof Error ? error.message : String(error)), 5500, "error");
    } finally {
      refreshing = false;
    }
  }

</script>

<div class="timeline-settings">
  {#if loading}
    <div class="timeline-settings__state">加载中…</div>
  {:else if errorMsg}
    <div class="timeline-settings__state timeline-settings__state--error">{errorMsg}</div>
  {:else}
    <div class="section-title">外观</div>
    <div class="row">
      <span class="row-label">开场标题<FieldHelp description="自动使用当前数据库名称。"/></span>
      <span class="row-readonly" title="自动同步数据库名称">{sourceName}（自动）</span>
    </div>
    <div class="row">
      <span class="row-label">高度<FieldHelp description="设置时间线预览高度：小、中、大、特大。"/></span>
      <select class="b3-select row-control" value={heightPresetValue(config.height)}
        on:change={(event) => setHeightPreset(event.currentTarget.value)}>
        {#each PREVIEW_HEIGHT_PRESETS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <span class="row-label">时间线占比（%）<FieldHelp description="底部时间轴占画面高度的比例。"/></span>
      <input
        class="b3-text-field row-control"
        type="number"
        min="0"
        max="100"
        step="1"
        value={config.timenavHeightPercent ?? 50}
        on:input={(event) => setTimenavHeightPercent(event.currentTarget.value)}
      />
    </div>
    <div class="row">
      <span class="row-label">开始位置<FieldHelp description="打开时显示第一条或最后一条。"/></span>
      <select
        class="b3-select row-control"
        value={config.startPosition === "last" ? "last" : "first"}
        on:change={(event) => setStartPosition(event.currentTarget.value)}
      >
        <option value="first">开头</option>
        <option value="last">结尾</option>
      </select>
    </div>

    <div class="section-title">字段映射</div>
    <FieldMapping definitions={TIMELINE_FIELD_DEFINITIONS} table={mappingTable} {mapping}
      canCreate={config.sourceType === "database" && Boolean(config.sourceAvID)} {creatingField}
      restrictTypes={config.sourceType === "database" && fieldTypes.length > 0}
      on:change={event => handleMappingChange(event.detail)}
      on:create={event => createMappingField(event.detail)}/>
    <div class="mapping-hint">
      <span class="field-required">*</span> 必填项。字段按 ID 绑定，改名不影响；失效后请手动重新选择。悬浮信息图标可查看各字段的作用。
    </div>

    <div class="timeline-settings__footer">
      <span class:timeline-settings__save-error={Boolean(saveError)}>
        {saveError ? '自动保存失败：' + saveError : saving ? "保存中…" : dirty ? "等待自动保存…" : "修改后自动保存并刷新预览"}
      </span>
      <button class="footer-refresh" disabled={refreshing} on:click={refreshTimeline}>刷新时间线</button>
    </div>
  {/if}
</div>

<style>
  .timeline-settings {
    padding: 4px 6px 12px;
    font-size: 14px;
    color: var(--b3-theme-on-surface);
    overflow: auto;
    height: 100%;
    box-sizing: border-box;
  }

  .timeline-settings__state {
    padding: 24px 12px;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
  }

  .timeline-settings__state--error, .timeline-settings__save-error {
    color: var(--b3-theme-error, #d23f31);
  }

  .section-title {
    margin: 14px 8px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface-light);
  }

  .field-required { color: var(--b3-theme-error, #d23f31); font-weight: 700; padding-left: 2px; }

  .row-readonly { max-width: 64%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--b3-theme-on-surface-light); font-size: 12px; }

  .mapping-hint {
    margin: 4px 8px 0;
    font-size: 12px;
    line-height: 1.6;
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

  .row-label {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .row-control {
    width: 160px;
    flex-shrink: 0;
  }

  .timeline-settings__footer {
    display: flex; gap: 9px; justify-content: flex-end; align-items: center; flex-wrap: wrap;
    margin: 16px 8px 0;
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
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
</style>
