<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { DropdownMenu } from "bits-ui";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import Check from "lucide-svelte/icons/check";
  import Plus from "lucide-svelte/icons/plus";
  import { siyuanAvIcon, siyuanAvIconIsSolid } from "./av-column-icons";
  import type { FieldSelectOption } from "./field-mapping-types";

  export let options: FieldSelectOption[] = [];
  export let value = "";
  export let invalidLabel = "原字段已失效，请重新选择";
  export let placeholder = "请选择字段";
  export let ariaLabel = "选择列";
  export let disabled = false;
  export let allowEmpty = true;
  export let canCreate = false;
  export let creating = false;

  let open = false;
  const dispatch = createEventDispatcher<{ change: string; create: void }>();
  $: selected = options.find(option => option.value === value);
  function choose(next: string) {
    open = false;
    dispatch("change", next);
  }
</script>

<DropdownMenu.Root bind:open portal closeOnEscape closeOnOutsideClick>
  <DropdownMenu.Trigger class="dodo-field-select-trigger" aria-label={ariaLabel} disabled={disabled || creating}>
    <span class="dodo-field-select-label" class:invalid={Boolean(value && !selected)}>
      {#if selected}
        <svg class="dodo-field-select-icon" class:is-solid={siyuanAvIconIsSolid(selected.type)} aria-hidden="true"><use href={`#${siyuanAvIcon(selected.type)}`}/></svg>
        <span class="dodo-field-select-ellipsis">{selected.label || "（空列名）"}</span>
      {:else if value}
        <svg class="dodo-field-select-icon" aria-hidden="true"><use href="#iconTriangleAlert"/></svg>
        <span class="dodo-field-select-ellipsis">{invalidLabel}</span>
      {:else}
        <span class="dodo-field-select-ellipsis">{placeholder}</span>
      {/if}
    </span>
    <ChevronDown size={14} strokeWidth={1.8}/>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="dodo-field-select-menu" align="start" sideOffset={5} collisionPadding={12}>
    {#if allowEmpty}
      <DropdownMenu.Item class="dodo-field-select-item" on:click={() => choose("")}>
        <span class="dodo-field-select-option"><span class="dodo-field-select-placeholder">{placeholder}</span></span>
        {#if !value}<Check size={15} strokeWidth={1.8}/>{/if}
      </DropdownMenu.Item>
      {#if options.length}<div class="dodo-field-select-divider"></div>{/if}
    {/if}
    {#each options as option (option.value)}
      <DropdownMenu.Item class="dodo-field-select-item" on:click={() => choose(option.value)}>
        <span class="dodo-field-select-option">
          <svg class="dodo-field-select-icon" class:is-solid={siyuanAvIconIsSolid(option.type)} aria-hidden="true"><use href={`#${siyuanAvIcon(option.type)}`}/></svg>
          <span class="dodo-field-select-ellipsis">{option.label || "（空列名）"}</span>
        </span>
        {#if value === option.value}<Check size={15} strokeWidth={1.8}/>{/if}
      </DropdownMenu.Item>
    {/each}
    {#if !options.length}
      {#if canCreate}
        <DropdownMenu.Item class="dodo-field-select-item" disabled={creating}
          on:click={() => { open = false; dispatch("create"); }}>
          <span class="dodo-field-select-option">
            <Plus size={15} strokeWidth={1.8}/>
            <span class="dodo-field-select-ellipsis">{creating ? "创建中…" : "添加字段"}</span>
          </span>
        </DropdownMenu.Item>
      {:else}
        <div class="dodo-field-select-empty">没有符合类型要求的列</div>
      {/if}
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  :global(.dodo-field-select-trigger) {
    display: flex; align-items: center; justify-content: space-between; gap: 7px;
    min-height: 30px; width: 160px; min-width: 0; box-sizing: border-box;
    border: 1px solid var(--b3-border-color); border-radius: 6px;
    padding: 5px 7px; background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface); font-size: 13px; cursor: pointer;
  }
  :global(.dodo-field-select-trigger:focus-visible) {
    outline: 2px solid var(--b3-theme-primary); outline-offset: 1px;
  }
  :global(.dodo-field-select-trigger:disabled) { cursor: not-allowed; opacity: .5; }
  :global(.dodo-field-select-label), :global(.dodo-field-select-option) {
    min-width: 0; display: inline-flex; flex: 1; gap: 8px; align-items: center;
  }
  :global(.dodo-field-select-label.invalid) { color: var(--b3-theme-error, #d23f31); }
  :global(.dodo-field-select-ellipsis) { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  :global(.dodo-field-select-menu) {
    z-index: 10050; box-sizing: border-box; min-width: 185px;
    max-height: min(420px, 65vh); overflow-y: auto; overflow-x: hidden;
    padding: 5px; border: 1px solid var(--b3-border-color); border-radius: 9px;
    background: var(--b3-theme-background); box-shadow: 0 12px 30px rgba(0,0,0,.17);
  }
  :global(.dodo-field-select-item) {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    width: 100%; box-sizing: border-box; min-height: 34px; padding: 6px 9px;
    font-size: 13px; color: var(--b3-theme-on-surface); border-radius: 6px;
    cursor: pointer; outline: none;
  }
  :global(.dodo-field-select-item[data-highlighted]), :global(.dodo-field-select-item:focus-visible) {
    background: var(--b3-list-hover, var(--b3-theme-primary-lightest));
  }
  :global(.dodo-field-select-icon) { width: 15px; height: 15px; flex: 0 0 15px; fill: none; stroke: currentColor; }
  /* iconListItem uses a filled path with no stroke. Important: inherited/global
     fill:none in chart settings must not erase SiYuan's native select icon. */
  :global(.dodo-field-select-icon.is-solid), :global(.dodo-field-select-icon.is-solid use) {
    fill: currentColor !important; stroke: none !important;
  }
  :global(.dodo-field-select-divider) { margin: 4px 3px; border-top: 1px solid var(--b3-border-color); }
  :global(.dodo-field-select-empty) { padding: 9px; color: var(--b3-theme-on-surface-light); font-size: 12px; }
  :global(.dodo-field-select-placeholder) { color: var(--b3-theme-on-surface-light); }
</style>
