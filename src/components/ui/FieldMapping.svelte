<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fieldColumns, resolveFieldBinding } from "../../shared/av/field-binding";
  import type { FieldTable } from "../../shared/av/field-binding";
  import FieldSelect from "./FieldSelect.svelte";
  import SettingRow from "./SettingRow.svelte";
  import FieldHelp from "./FieldHelp.svelte";
  import { newFieldType } from "./av-create-field";
  import type { FieldMappingDefinition, FieldMappingChange, FieldSelectOption } from "./field-mapping-types";

  /** Pure UI: callers supply field schema, source columns and saved bindings. */
  export let definitions: FieldMappingDefinition[] = [];
  export let table: FieldTable = { headers: [] };
  export let mapping: Record<string, string | undefined> = {};
  export let restrictTypes = true;
  export let disabled = false;
  export let canCreate = false;
  export let creatingField = "";

  const dispatch = createEventDispatcher<{ change: FieldMappingChange; create: string }>();
  function optionsFor(field: FieldMappingDefinition, columns: FieldTable, typed: boolean): FieldSelectOption[] {
    return fieldColumns(columns, typed ? field.acceptedTypes : undefined)
      .map(column => ({ value: column.id || column.label, label: column.label, type: column.type }));
  }
  // Pass the stored value from markup: Svelte 4 cannot track a prop read
  // solely inside a called helper when the parent mapping object changes.
  function selectedValue(field: FieldMappingDefinition, stored: string, columns: FieldTable, typed: boolean): string {
    if (!stored) return "";
    const resolved = resolveFieldBinding(columns, stored,
      typed ? field.acceptedTypes : undefined);
    return resolved.status === "resolved" ? resolved.id || stored : stored;
  }
  function invalidLabel(field: FieldMappingDefinition, stored: string, columns: FieldTable, typed: boolean): string {
    const status = resolveFieldBinding(columns, stored,
      typed ? field.acceptedTypes : undefined).status;
    if (status === "invalid-type") return "原字段类型不匹配，请重新选择";
    if (status === "ambiguous") return "同名字段不唯一，请重新选择";
    return "原字段已失效，请重新选择";
  }
</script>

<div class="dodo-field-mapping">
  {#each definitions as field (field.key)}
    <SettingRow>
      <span slot="label" class="dodo-field-mapping-name">
        {field.label}{#if field.required}<span class="dodo-field-mapping-required" title="必填字段">*</span>{/if}
        {#if field.description}<FieldHelp description={field.description}/>{/if}
      </span>
      <FieldSelect options={optionsFor(field, table, restrictTypes)}
        value={selectedValue(field, mapping?.[field.key] || "", table, restrictTypes)}
        invalidLabel={invalidLabel(field, mapping?.[field.key] || "", table, restrictTypes)} placeholder={field.placeholder || (field.required ? "请选择字段" : "不使用")}
        canCreate={canCreate && restrictTypes && Boolean(newFieldType(field.acceptedTypes))}
        creating={creatingField === field.key}
        allowEmpty={!field.required}
        ariaLabel={`为${field.label}选择数据库列`}
        {disabled} on:change={event => dispatch("change", { field: field.key, value: event.detail })}
        on:create={() => dispatch("create", field.key)}/>
    </SettingRow>
  {/each}
</div>

<style>
  .dodo-field-mapping { display: flex; flex-direction: column; }

  .dodo-field-mapping-name { display: inline-flex; align-items: center; gap: 5px; line-height: 20px; white-space: nowrap; min-width: 0; }
  .dodo-field-mapping-required { color: var(--b3-theme-error, #d23f31); font-weight: 700; }
</style>
