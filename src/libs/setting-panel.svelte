<!--
 Copyright (c) 2023 by frostime All Rights Reserved.
 Author       : frostime
 Date         : 2023-07-01 19:23:50
 FilePath     : /src/libs/setting-panel.svelte
 LastEditTime : 2023-11-28 21:45:10
 Description  : 
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { buildSettingSections } from "@/setting-schema";
    import type { SettingSection } from "@/setting-schema";
    import SettingItem from "./setting-item.svelte";
    import CustomAppManager from "../lets-database-view/custom/CustomAppManager.svelte";

    export let group: string;
    export let settingItems: ISettingItem[] = [];
    export let display: boolean = true;

    const dispatch = createEventDispatcher();

    function onClick( {detail}) {
        dispatch("click", {group: group, ...detail});
    }
    function onChanged( {detail}) {
        dispatch("changed", {group: group, ...detail});
    }
    function onSectionAction(section) {
        dispatch("click", {
            group: group,
            key: section.action.key,
            value: section.key,
        });
    }

    $: fn__none = display ? "" : "fn__none";
    const DATABASE_SECTIONS = [
        "AI 自定义视图", "地图视图", "图表视图", "甘特视图", "日历视图", "时间线视图",
    ];
    function databaseSections(items: ISettingItem[]): SettingSection<ISettingItem>[] {
        const present = buildSettingSections(items);
        const byTitle = new Map(present.map(section => [section.title, section]));
        // Keep headings even if a view currently has no settings.
        // Retain any future/unknown sections after the standard ones.
        return [
            ...DATABASE_SECTIONS.map(title => byTitle.get(title) || {
                key: title, title, items: [] as ISettingItem[],
            }),
            ...present.filter(section => !DATABASE_SECTIONS.includes(section.title)),
        ];
    }
    $: sections = group === "数据库视图"
        ? databaseSections(settingItems)
        : buildSettingSections(settingItems);

    // 数据库视图常显、整页滚动；自定义块保持原有折叠行为。
    $: collapsible = group === "自定义块";
    let expandedSection: string | null = null;
    let previousGroup = group;
    $: if (group !== previousGroup) {
        previousGroup = group;
        expandedSection = null;
    }

    function toggleSection(key: string) {
        expandedSection = expandedSection === key ? null : key;
    }

    // 主开关移到标题右侧，其他复选设置仍留在展开区域中。
    function getSectionEnableItem(section: { items: ISettingItem[] }): ISettingItem | undefined {
        return (collapsible || group === "数据库视图")
            ? section.items.find(item =>
                item.type === "checkbox" &&
                item.key.endsWith("-enabled") &&
                item.title.startsWith("启用"))
            : undefined;
    }

    function onSectionEnabled(event: Event, item: ISettingItem) {
        dispatch("changed", {
            group,
            key: item.key,
            value: (event.currentTarget as HTMLInputElement).checked,
        });
    }

</script>

<div class="config__tab-container {fn__none}" data-name={group}>
    <slot />
    {#each sections as section (section.key)}
            {@const enableItem = getSectionEnableItem(section)}
            <section
                class="dodo-setting-section"
                class:dodo-setting-section--default={!section.title}
            >
                {#if section.title}
                <div
                    class="dodo-setting-section__header"
                    class:collapsed={collapsible && expandedSection !== section.key}
                >
                    <div class="dodo-setting-section__title-row">
                        {#if collapsible}
                            <button
                                type="button"
                                class="dodo-setting-section__toggle"
                                aria-expanded={expandedSection === section.key}
                                aria-controls={"dodo-setting-section-" + section.key}
                                on:click={() => toggleSection(section.key)}
                            >
                                <span
                                    class="dodo-setting-section__chevron"
                                    class:is-expanded={expandedSection === section.key}
                                    aria-hidden="true"
                                ></span>
                                <span class="dodo-setting-section__title">{section.title}</span>
                            </button>
                        {:else}
                            <div class="dodo-setting-section__title">{section.title}</div>
                        {/if}
                        <div class="dodo-setting-section__tools">
                            {#if enableItem}
                                <label class="dodo-setting-section__enable" title={enableItem.title}>
                                    <span class="dodo-setting-section__enable-label">{enableItem.value === true ? "已启用" : "已关闭"}</span>
                                    <input
                                        class="b3-switch"
                                        type="checkbox"
                                        checked={enableItem.value === true}
                                        aria-label={enableItem.title}
                                        on:change={(event) => onSectionEnabled(event, enableItem)}
                                    />
                                </label>
                            {/if}
                            {#if section.status}
                                <span
                                    class:status-success={section.status.state === "success"}
                                    class:status-error={section.status.state === "error"}
                                    class="dodo-setting-section__status"
                                    title={section.status.title || section.status.label || "状态未知"}
                                    aria-label={section.status.label || "状态未知"}
                                >
                                    <span class="dodo-setting-section__status-dot"></span>
                                </span>
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
                    </div>
                    {#if !collapsible || expandedSection === section.key}
                    <div class="dodo-setting-section__header-main">
                        {#if section.description}
                            <div class="dodo-setting-section__description">
                                {@html section.description}
                            </div>
                        {/if}
                    </div>
                    {/if}
                </div>
                {/if}
                <div
                    id={"dodo-setting-section-" + section.key}
                    class="dodo-setting-section__content"
                    hidden={collapsible && !!section.title && expandedSection !== section.key}
                >
                {#if !collapsible || !section.title || expandedSection === section.key}
                {#each section.items as item (item.key)}
                    {#if !enableItem || item.key !== enableItem.key}
                    <SettingItem
                        type={item.type}
                        title={item.title}
                        description={item.description}
                        settingKey={item.key}
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
                {#if group === "数据库视图" && section.title === "AI 自定义视图"}
                    <CustomAppManager />
                {/if}
                {/if}
                </div>
            </section>
    {/each}
</div>

<style lang="scss">
    .dodo-setting-section {
        margin: 0 0 16px;
        background-color: var(--dodo-surface, var(--b3-theme-surface));
        border: 1px solid var(--dodo-border, var(--b3-theme-outline-variant));
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 2px color-mix(in srgb, var(--dodo-foreground, #09090b) 5%, transparent);
    }

    .dodo-setting-section--default {
        overflow: visible;
    }

    .dodo-setting-section__header {
        padding: 14px 18px 10px;
        border-bottom: 1px solid var(--dodo-border, var(--b3-theme-outline-variant));
    }

    .dodo-setting-section__header.collapsed {
        padding-bottom: 14px;
        border-bottom: none;
    }

    .dodo-setting-section__toggle {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
        padding: 0;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        border: 0;
        background: transparent;
    }

    .dodo-setting-section__toggle:hover .dodo-setting-section__title {
        color: var(--dodo-primary, var(--b3-theme-primary));
    }

    .dodo-setting-section__toggle:focus-visible {
        outline: 2px solid var(--dodo-primary, var(--b3-theme-primary));
        outline-offset: 4px;
        border-radius: 3px;
    }

    .dodo-setting-section__chevron {
        width: 7px;
        height: 7px;
        flex: none;
        border-right: 1.5px solid currentColor;
        border-bottom: 1.5px solid currentColor;
        transform: rotate(-45deg);
        transition: transform 150ms ease;
        color: var(--dodo-muted-foreground, var(--b3-theme-on-surface-light));
    }

    .dodo-setting-section__chevron.is-expanded {
        transform: rotate(45deg);
    }

    .dodo-setting-section__title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .dodo-setting-section__header-main {
        min-width: 0;
    }

    .dodo-setting-section__title {
        color: var(--dodo-foreground, var(--b3-theme-on-background));
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        min-width: 0;
    }

    .dodo-setting-section__tools {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
    }

    .dodo-setting-section__enable {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        white-space: nowrap;
        margin: 0;
    }

    .dodo-setting-section__enable-label {
        font-size: 12px;
        font-weight: 400;
        color: var(--dodo-muted-foreground, var(--b3-theme-on-surface-light));
    }

    .dodo-setting-section__enable .b3-switch {
        margin: 0;
        flex: none;
    }

    .dodo-setting-section__status {
        --dodo-section-status-color: var(--dodo-muted-foreground, #71717a);
        display: inline-flex;
        align-items: center;
        color: var(--dodo-muted-foreground, var(--b3-theme-on-surface-light));
        width: 20px;
        height: 20px;
        justify-content: center;
    }

    .dodo-setting-section__status.status-success {
        --dodo-section-status-color: var(--dodo-success, #16a34a);
    }

    .dodo-setting-section__status.status-error {
        --dodo-section-status-color: var(--dodo-danger, var(--b3-theme-error, #dc2626));
    }

    .dodo-setting-section__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--dodo-section-status-color);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--dodo-section-status-color) 18%, transparent);
    }

    .dodo-setting-section__description {
        color: var(--dodo-muted-foreground, var(--b3-theme-on-surface-light));
        font-size: 12px;
        line-height: 18px;
        margin-top: 2px;
        overflow-wrap: anywhere;
    }

    .dodo-setting-section__action {
        flex: none;
        min-width: 48px;
        height: 24px;
        padding: 0 10px;
        font-size: 12px;
        line-height: 22px;
        border-color: var(--dodo-border-strong, var(--b3-theme-outline-variant));
        color: var(--dodo-foreground, var(--b3-theme-on-background));
    }
</style>
