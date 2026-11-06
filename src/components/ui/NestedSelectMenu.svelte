<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { DropdownMenu } from "bits-ui";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Check from "lucide-svelte/icons/check";
  import { siyuanAvIcon, siyuanAvIconIsSolid } from "./av-column-icons";

  /** Shared shadcn-style menu. Bits UI handles keyboard focus and submenu positioning. */
  import type { NestedSelectOption, NestedSelectSelection } from "./nested-select-types";
  export let options: NestedSelectOption[] = [];
  export let value = "";
  export let subValue = "";
  export let placeholder = "请选择";
  export let ariaLabel = "选择字段";
  export let compact = false;
  let open = false;
  const dispatch = createEventDispatcher<{ select: NestedSelectSelection }>();
  $: selected = options.find(option => option.value === value);
  $: suffix = selected?.children?.find(item => item.value === subValue)?.label
    || (selected?.type === "mSelect" ? "计数" : "");

  function choose(id: string, calculation?: string) {
    open = false;
    dispatch("select", { value: id, subValue: calculation });
  }
</script>

<DropdownMenu.Root bind:open portal closeOnOutsideClick closeOnEscape>
  <DropdownMenu.Trigger class={compact ? "dodo-ui-nested-trigger compact" : "dodo-ui-nested-trigger"} aria-label={ariaLabel}>
    <span class="dodo-ui-nested-text">{selected ? `${selected.label}${suffix ? `（${suffix}）` : ""}` : placeholder}</span>
    <ChevronDown size={14} strokeWidth={1.8} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="dodo-ui-nested-content" align="start" sideOffset={5} collisionPadding={12}>
    {#each options as option (option.value)}
      {#if option.children?.length}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger class="dodo-ui-nested-item" aria-label={`选择${option.label}的统计方式`}>
            <span class="dodo-ui-nested-kind"><svg class="dodo-ui-av-icon" class:is-solid={siyuanAvIconIsSolid(option.type || "")} aria-hidden="true"><use href={`#${siyuanAvIcon(option.type || "number")}`}/></svg><span>{option.label}</span></span>
            <ChevronRight size={14} strokeWidth={1.8}/>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent class="dodo-ui-nested-content dodo-ui-nested-sub" sideOffset={5} collisionPadding={12}>
            <div class="dodo-ui-nested-heading">统计方式（数值列共用）</div>
            {#each option.children as child (child.value)}
              <DropdownMenu.Item class="dodo-ui-nested-item" on:click={() => choose(option.value, child.value)}>
                <span>{child.label}</span>
                {#if option.value === value && child.value === subValue}
                  <Check size={15} strokeWidth={1.8}/>
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      {:else}
        <DropdownMenu.Item class="dodo-ui-nested-item" on:click={() => choose(option.value)}>
          <span class="dodo-ui-nested-kind">
            <svg class="dodo-ui-av-icon" class:is-solid={siyuanAvIconIsSolid(option.type || "")} aria-hidden="true"><use href={`#${siyuanAvIcon(option.type || "")}`}/></svg>
            <span>{option.label}{option.type === "mSelect" ? "（计数）" : ""}</span>
          </span>
          {#if option.value === value}<Check size={15} strokeWidth={1.8}/>{/if}
        </DropdownMenu.Item>
      {/if}
    {/each}
    {#if options.length === 0}
      <div class="dodo-ui-nested-heading">暂无可选择的字段</div>
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  :global(.dodo-ui-nested-trigger) {
    box-sizing: border-box; display: inline-flex; align-items: center;
    justify-content: space-between; gap: 8px; width: 160px; max-width: 100%;
    min-height: 30px; padding: 5px 7px; border-radius: 6px;
    border: 1px solid var(--b3-border-color); background: var(--b3-theme-background);
    font-size: 13px; color: var(--b3-theme-on-surface); cursor: pointer;
  }
  :global(.dodo-ui-nested-trigger.compact) { width: 129px; }
  :global(.dodo-ui-nested-trigger:focus-visible) { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }
  :global(.dodo-ui-nested-text) { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  :global(.dodo-ui-nested-content) {
    z-index: 10050; box-sizing: border-box; min-width: 195px;
    /* Submenus are nested floating elements. Scrolling this parent creates
       an implicit overflow-x:auto and clips the entire right-side panel. */
    overflow: visible; padding: 5px; border: 1px solid var(--b3-border-color);
    border-radius: 9px; background: var(--b3-theme-background);
    box-shadow: 0 12px 30px rgba(0,0,0,.17);
  }
  :global(.dodo-ui-nested-sub) {
    min-width: 190px;
    max-height: min(420px, 70vh);
    overflow-y: auto;
    overflow-x: hidden;
  }
  :global(.dodo-ui-nested-item) {
    box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;
    gap: 12px; width: 100%; min-height: 33px; padding: 6px 9px;
    border-radius: 6px; outline: none; color: var(--b3-theme-on-surface);
    font: inherit; font-size: 13px; cursor: pointer; user-select: none;
  }
  :global(.dodo-ui-nested-item[data-highlighted]),
  :global(.dodo-ui-nested-item:focus-visible) { background: var(--b3-list-hover, var(--b3-theme-primary-lightest)); }
  :global(.dodo-ui-nested-kind) { display: flex; gap: 9px; align-items: center; min-width: 0; }
  :global(.dodo-ui-nested-kind span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.dodo-ui-nested-heading) { padding: 6px 9px; font-size: 11px; color: var(--b3-theme-on-surface-light); }
  :global(.dodo-ui-nested-content svg), :global(.dodo-ui-nested-trigger svg) { flex-shrink: 0; fill: none; stroke: currentColor; }
  :global(.dodo-ui-av-icon) { width: 15px; height: 15px; flex-shrink: 0; fill: none; stroke: currentColor; }
  :global(.dodo-ui-av-icon.is-solid), :global(.dodo-ui-av-icon.is-solid use) {
    fill: currentColor !important; stroke: none !important;
  }
</style>
