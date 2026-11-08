<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { getSettingsSections } from "@/setting-search";
  import type { SettingSection } from "@/setting-schema";
  import { isSectionActivationItem } from "@/setting-section-features";
  import SettingItem from "./setting-item.svelte";
  import CustomAppManager from "../lets-database-view/custom/CustomAppManager.svelte";
  import FlomoNotebookSetting from "../lets-flomo-sync/FlomoNotebookSetting.svelte";

  export let group: string;
  export let settingItems: ISettingItem[] = [];
  export let display: boolean = true;
  export let searchSections: SettingSection<ISettingItem>[] | null = null;
  export let showLocate = false;

  const dispatch = createEventDispatcher();

  function onClick({detail}) {
    dispatch("click", {group, ...detail});
  }

  function onChanged({detail}) {
    dispatch("changed", {group, ...detail});
  }

  function locateSection(section: SettingSection<ISettingItem>) {
    dispatch("locate", { group, sectionKey: section.key });
  }

  function onSectionAction(section: SettingSection<ISettingItem>) {
    if (!section.action) return;
    dispatch("click", {
      group,
      key: section.action.key,
      value: section.key,
    });
  }


  $: sections = searchSections ?? getSettingsSections(group, settingItems);

  // The new settings layout uses headings, not module-enable switches. Other
  // controls (e.g. map search, plugin-level switches) are kept functional.
  // Keep field-level help text as in SiYuan's editor settings.
  // Only section-level explanatory paragraphs remain hidden.
  const showFieldDescriptions = true;
</script>

{#if display}
  <slot />
  {#each sections as section, index (section.key)}
    {@const visibleItems = section.items.filter(item => !isSectionActivationItem(group, item.key))}
    {@const hasAppManager = group === "数据库视图" && section.title === "AI 自定义视图"}
    <section
      class={"config-group dodo-setting-section" +
        (index === 0 ? " config-group--first" : "") +
        (index === sections.length - 1 ? " config-group--last" : "")}
      class:dodo-setting-section--default={!section.title}
      data-dodo-setting-section={section.key}
    >
      {#if section.title}
        <header class="config-title config-title--action dodo-setting-section__header">
          <h3 class="dodo-setting-section__title">{section.title}</h3>
          {#if section.status || section.action || showLocate}
            <div class="dodo-setting-section__tools">
              {#if section.status}
                <span
                  class="dodo-setting-section__status"
                  class:status-success={section.status.state === "success"}
                  class:status-error={section.status.state === "error"}
                  title={section.status.title || section.status.label || "状态未知"}
                  aria-label={section.status.label || "状态未知"}
                >
                  <span class="dodo-setting-section__status-dot"></span>
                </span>
              {/if}
              {#if showLocate}
                <button
                  class="b3-button b3-button--outline dodo-setting-section__action"
                  type="button"
                  aria-label={"定位到" + (section.title || "设置项") + "所在分类"}
                  on:click={() => locateSection(section)}
                >定位</button>
              {/if}
              {#if section.action}
                <button
                  class="b3-button b3-button--outline dodo-setting-section__action"
                  type="button"
                  title={section.action.title || section.action.label}
                  on:click={() => onSectionAction(section)}
                >
                  {section.action.label}
                </button>
              {/if}
            </div>
          {/if}
        </header>
      {/if}

      {#if visibleItems.length > 0 || hasAppManager}
      <div class="config-items dodo-setting-section__content">
        {#each visibleItems as item (item.key)}
          {#if group === "Flomo 同步" && item.key === "dailnoteNotebook"}
            <FlomoNotebookSetting
              settingValue={item.value}
              configItemId={group + "." + item.key}
              on:changed={onChanged}
            />
          {:else}
          <SettingItem
            type={item.type}
            title={item.title}
            description={item.description}
            showDescription={showFieldDescriptions}
            settingKey={item.key}
            configItemId={group + "." + item.key}
            settingValue={item.value}
            placeholder={item?.placeholder}
            preview={item?.preview}
            options={item?.options}
            slider={item?.slider}
            height={item?.height}
            on:click={onClick}
            on:changed={onChanged}
          />
          {/if}
        {/each}
        {#if hasAppManager}
          <CustomAppManager />
        {/if}
      </div>
      {/if}
    </section>
  {/each}
{/if}

<style lang="scss">
  /* Native SiYuan v3.8.9 supplies config-group/title/items and b3-label:
     spacing, font sizes, surface/background, radius and row separators. */

  /* A heading inside the native .config-title retains the host font size. */
  .dodo-setting-section__title {
    margin: 0;
    font: inherit;
    color: inherit;
    min-width: 0;
  }

  .dodo-setting-section__header { justify-content: space-between; gap: 8px; }
  .dodo-setting-section__tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .dodo-setting-section__status {
    --dodo-status-color: var(--b3-theme-on-surface-light);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }
  .dodo-setting-section__status.status-success {
    --dodo-status-color: var(--b3-theme-success, #16a34a);
  }
  .dodo-setting-section__status.status-error {
    --dodo-status-color: var(--b3-theme-error, #dc2626);
  }
  .dodo-setting-section__status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dodo-status-color);
  }
  .dodo-setting-section__action { flex: none; }
</style>