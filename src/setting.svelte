<script lang="ts">
  import { settings } from "@/settings";
  import { showMessage } from "siyuan";
  import { onDestroy, tick } from "svelte";
  import SettingPanel from "./libs/setting-panel.svelte";
  import { searchSettingsGroups } from "./setting-search";
  // let groups: string[] = ["Default", "自动获取链接标题"];
  import { PluginRegistry } from "./plugin-registry";
  import { plugin } from "./utils";
  import { createLogger } from "@/logger";
  import { getErrorMessage } from "@/request-utils";
  import Blocks from "lucide-svelte/icons/blocks";
  import BookOpen from "lucide-svelte/icons/book-open";
  import Braces from "lucide-svelte/icons/braces";
  import CalendarClock from "lucide-svelte/icons/calendar-clock";
  import ChartNoAxesCombined from "lucide-svelte/icons/chart-no-axes-combined";
  import FileSearch from "lucide-svelte/icons/file-search";
  import Keyboard from "lucide-svelte/icons/keyboard";
  import Link2 from "lucide-svelte/icons/link-2";
  import LayoutDashboard from "lucide-svelte/icons/layout-dashboard";
  import MapPinned from "lucide-svelte/icons/map-pinned";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Share2 from "lucide-svelte/icons/share-2";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import ToggleLeft from "lucide-svelte/icons/toggle-left";
  import {
    coerceSettingValue,
    getSettingHydrationKeys,
    hydrateSettingItems,
  } from "@/setting-schema";
  import type { PluginSettingItem } from "@/types/plugin";

  const logger = createLogger("SettingPanel");

  type SidebarIcon = typeof ToggleLeft;

  const sidebarIcons: Record<string, SidebarIcon> = {
    开关: ToggleLeft,
    文档面包屑: BookOpen,
    文件块: FileSearch,
    "Flomo 同步": RefreshCw,
    主页: LayoutDashboard,
    自定义块: Blocks,
    数据库视图: MapPinned,
    链接图标: Link2,
    快捷输入: Keyboard,
    "分享到 Notion": Share2,
    符号自动替换: Braces,
    图表块: ChartNoAxesCombined,
    时间线预览: CalendarClock,
  };

  function getGroupIcon(groupName: string): SidebarIcon {
    return sidebarIcons[groupName] ?? SlidersHorizontal;
  }

  type SettingGroupMap = Record<string, ISettingItem[]>;

  function getSavedPluginSettings(pluginName: string, items: PluginSettingItem[]) {
    const savedSettings: Record<string, unknown> = {};
    for (const key of getSettingHydrationKeys(items)) {
      const savedValue = settings.getBySpace(pluginName, key);
      if (savedValue !== undefined) {
        savedSettings[key] = savedValue;
      }
    }
    return savedSettings;
  }

  const initData = (): SettingGroupMap => {
    const pluginRegistry = PluginRegistry.getInstance();
    const pluginConfigs = pluginRegistry.getPluginConfigs();

    // Generate dynamic settings from plugins
    const dynamicSettings: SettingGroupMap = {
      开关: [],

    };

    // Add plugin flags
    for (const pluginMeta of pluginConfigs) {
      dynamicSettings.开关.push({
        type: "checkbox",
        title: pluginMeta.displayName || pluginMeta.name,
        description: pluginMeta.description || "",
        key: pluginMeta.name,
        value:
          settings.getBySpace(pluginMeta.name, "enabled") ??
          pluginMeta.enabled ??
          false,
        hasSetting: pluginMeta.settings ? true : false,
      });
    
      // 创建新的设置数组，但不修改原对象
      const newSettings = hydrateSettingItems(
        pluginMeta.settings,
        getSavedPluginSettings(pluginMeta.name, pluginMeta.settings ?? [])
      );
    
      // 添加到 dynamicSettings
      if (newSettings?.length) {
        dynamicSettings[pluginMeta.displayName] = newSettings;
      }
    }

    return dynamicSettings;
  };

  let SettingItems = initData();

  $: groups = [
    "开关",
    // "移动端助手",
    ...SettingItems["开关"]
      .filter((item) => item.value === true && item.hasSetting)
      .map((item) => item.title),
  ];

  let focusGroup = "开关";
  let sidebarSearch = "";
  $: searchQuery = sidebarSearch.trim();
  $: searchResults = searchQuery
    ? searchSettingsGroups(groups, SettingItems, searchQuery, getGroupLabel)
    : [];
  $: visibleGroups = searchQuery
    ? searchResults.map((result) => result.group)
    : groups;
  let tabWrapEl: HTMLDivElement | undefined;
  function selectSettingGroup(group: string): void {
    sidebarSearch = "";
    focusGroup = group;
    if (tabWrapEl) tabWrapEl.scrollTop = 0;
    void settings.save();
  }

  async function locateSettingSection({ detail }: CustomEvent<{ group: string; sectionKey: string }>) {
    selectSettingGroup(detail.group);
    await tick();
    const sections = tabWrapEl?.querySelectorAll<HTMLElement>("[data-dodo-setting-section]");
    const target = Array.from(sections ?? []).find(
      (section) => section.dataset.dodoSettingSection === detail.sectionKey);
    target?.scrollIntoView({ block: "start" });
  }

  function onSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && sidebarSearch) {
      sidebarSearch = "";
      event.stopPropagation();
      event.preventDefault();
    }
  }
  let showBottomSheet = false;

  $: {
    if (groups && !groups.includes(focusGroup)) {
      focusGroup = "开关";
    }
  }

  function getGroupLabel(groupName: string): string {
    const mainKey = `settings.${groupName}`;
    const translatedMainLabel = plugin?.i18n?.[mainKey];
    if (translatedMainLabel) {
      return translatedMainLabel;
    }

    const pluginMeta = PluginRegistry.getInstance()
      .getPluginConfigs()
      .find((item) => item.displayName === groupName || item.name === groupName);
    if (pluginMeta) {
      return plugin?.i18n?.[pluginMeta.displayName] ||
        pluginMeta.displayName ||
        pluginMeta.name;
    }

    return groupName;
  }

  function findPluginKeyByDisplayGroup(group: string): string | undefined {
    return SettingItems["开关"]?.find((item) => item.title === group)?.key;
  }

  /********** Events **********/
  interface ChangeEvent {
    group: string;
    key: string;
    value: any;
  }

  const onClick = async ({ detail }: CustomEvent<ChangeEvent>) => {

    const pluginKey = findPluginKeyByDisplayGroup(detail.group);
    if (!pluginKey) {
      return;
    }

    const plugin = PluginRegistry.getInstance().getPlugin(pluginKey);
    if (!plugin?.onSettingAction) {
      return;
    }

    try {
      await settings.save();
      await plugin.onSettingAction(detail.key, {
        group: detail.group,
        value: detail.value,
      });
      SettingItems = initData();
    } catch (error) {
      logger.warn("onClick: plugin setting action failed", {
        group: detail.group,
        key: detail.key,
        reason: getErrorMessage(error),
      });
      showMessage(`设置操作失败：${getErrorMessage(error)}`, 5000, "error");
    }
  };

  const onChanged = async ({ detail }: CustomEvent<ChangeEvent>) => {
    if (detail.group === "开关") {
      settings.setBySpace(detail.key, "enabled", detail.value);

      if (!detail.value) {
        //卸载自己就行了
        await PluginRegistry.getInstance().unloadPlugin(detail.key);
      } else {
        //动态加载; addDock 有点问题，目前不能实时切换
        await PluginRegistry.getInstance().beginPlugin(detail.key);
        //应对动态生成设置项的情况，比如 代码片段托管v
        SettingItems = initData();
      }
      detail.value = PluginRegistry.getInstance().getPlugin(detail.key)?.enabled ?? false;
      settings.setBySpace(detail.key, "enabled", detail.value);
    } else {
      const opItem = SettingItems["开关"].filter((ele) => {
        return ele.title === detail.group;
      });
      logger.debug("设置项所属插件", opItem);
      if (!opItem[0]) {
        return;
      }

      const settingItem = SettingItems[detail.group]?.find(
        (item) => item.key === detail.key
      );
      const nextValue = settingItem
        ? coerceSettingValue(settingItem, detail.value)
        : detail.value;
      settings.setBySpace(opItem[0].key, detail.key, nextValue);
      // 子组件的配置修改了，立马刷新
      // 调用 onDataChanged 而不是 beginPlugin
      const plugin = PluginRegistry.getInstance().getPlugin(opItem[0].key);
      if (plugin?.onDataChanged) {
        await plugin.onDataChanged({
          group: detail.group,
          key: detail.key,
          value: nextValue,
        });
        SettingItems = initData();
      }
    }

    // Search results can edit a setting belonging to another category.
    const changedItems = SettingItems[detail.group] ?? [];
    for (let index = 0; index < changedItems.length; index++) {
      if (changedItems[index].key === detail.key) {
        changedItems[index].value =
          detail.group === "开关"
            ? detail.value
            : coerceSettingValue(changedItems[index], detail.value);
        break;
      }
    }
    SettingItems = { ...SettingItems };
    settings.save();
  };

  onDestroy(async () => {
    await settings.save();
  });

  const lreload = () => {
    location.reload();
  };
</script>

<div class="fn__flex-1 fn__flex config__panel">
  <!-- Use SiYuan's native b3-list sidebar and text input controls. -->
  <aside class="config__side b3-list b3-list--background dodo-settings-sidebar">
    <div class="config__tab-head">
      <div class="config__tab-title dodo-settings-sidebar__heading">
        <span class="b3-list-item__graphic sidebar-item__icon">
          <SlidersHorizontal size={17} strokeWidth={2} aria-hidden="true" />
        </span>
        <span class="b3-list-item__text">设置</span>
      </div>
      <input
        class="b3-text-field dodo-settings-sidebar__search"
        type="search"
        aria-label="搜索所有设置"
        placeholder="搜索设置..."
        bind:value={sidebarSearch}
        on:keydown={onSearchKeyDown}
        on:input={() => { if (tabWrapEl) tabWrapEl.scrollTop = 0; }}
      />
    </div>
    <ul class="config__tab-scroll sidebar-menu">
      {#each visibleGroups as group}
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <li
        class={!searchQuery && group === focusGroup
          ? "sidebar-item b3-list-item b3-list-item--focus active"
          : "sidebar-item b3-list-item"}
        on:click={() => selectSettingGroup(group)}
        on:keydown={() => {}}
      >
        <span class="b3-list-item__graphic sidebar-item__icon">
          <svelte:component
            this={getGroupIcon(group)}
            size={17}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
        <span class="b3-list-item__text sidebar-label">{getGroupLabel(group)}</span>
      </li>
      {/each}
    </ul>
  </aside>

  <!-- Mobile Selector Bar -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="mobile-selector-bar"
    role="button"
    tabindex="0"
    on:click={() => (showBottomSheet = true)}
    on:keydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        showBottomSheet = true;
      }
    }}
  >
    <span class="mobile-selector-bar__icon">
      <svelte:component
        this={getGroupIcon(focusGroup)}
        size={17}
        strokeWidth={2}
        aria-hidden="true"
      />
    </span>
    <span class="current-category">{searchQuery ? "搜索结果" : getGroupLabel(focusGroup)}</span>
    <span class="arrow-icon">▼</span>
  </div>

  <!-- The sidebar is hidden on narrow screens: keep global search available. -->
  <div class="mobile-settings-search">
    <input
      class="b3-text-field"
      type="search"
      aria-label="搜索所有设置"
      placeholder="搜索设置..."
      bind:value={sidebarSearch}
      on:keydown={onSearchKeyDown}
      on:input={() => { if (tabWrapEl) tabWrapEl.scrollTop = 0; }}
    />
  </div>

  <!-- Main Content Wrap -->
  <div class="config__tab-wrap">
    <div class="config__tab-container panel-content" bind:this={tabWrapEl}>
    <!-- Operational notice belongs to the plugin controls, not every setting section. -->
    {#if focusGroup === "开关"}
    <div class="global-banner">
      <div class="banner-left">
        <span class="dodo-notice-icon" aria-hidden="true">ⓘ</span>
        <span>{plugin?.i18n?.["settings.restartWarning"] || "部分功能设置后需重启插件生效."}</span>
      </div>
      <button
        class="b3-button b3-button--outline my-reload-button"
        on:click={lreload}
      >
        {plugin?.i18n?.["settings.reloadNow"] || "现在重载"}
      </button>
    </div>
    {/if}

    <!-- Global matches are editable; source category and section are preserved. -->
    {#if searchQuery}
        <div class="dodo-search-results" aria-label="全局设置搜索结果">
          {#if searchResults.length === 0}
            <div class="dodo-search-empty" role="status">
              没有找到与「{searchQuery}」相关的设置
            </div>
          {:else}
            {#each searchResults as result (result.group)}
              <div class="dodo-search-group">
                <div class="dodo-search-group__heading">
                  <h2>{result.label}</h2>
                  <button
                    type="button"
                    class="b3-button b3-button--outline"
                    on:click={() => selectSettingGroup(result.group)}
                  >查看全部</button>
                </div>
                <SettingPanel
                  group={result.group}
                  settingItems={SettingItems[result.group] ?? []}
                  searchSections={result.sections}
                  showLocate
                  on:changed={onChanged}
                  on:click={onClick}
                  on:locate={locateSettingSection}
                />
              </div>
            {/each}
          {/if}
        </div>
      {:else}
        <SettingPanel
          group={focusGroup}
          settingItems={SettingItems[focusGroup] ?? []}
          on:changed={onChanged}
          on:click={onClick}
        />
    {/if}
    </div>
  </div>

  <!-- Mobile Bottom Sheet Drawer -->
  <!-- 必须位于 .config__panel 内部，否则继承不到 --dodo-* 变量，背景会变透明 -->
  {#if showBottomSheet}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="bottom-sheet-backdrop"
    role="presentation"
    on:click={(event) => {
      if (event.target === event.currentTarget) {
        showBottomSheet = false;
      }
    }}
  >
    <div
      class="bottom-sheet-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-category-title"
    >
      <div class="bottom-sheet-header">
        <h3 id="settings-category-title">
          {plugin?.i18n?.["settings.selectCategory"] || "选择设置分类"}
        </h3>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <button class="close-btn" on:click={() => (showBottomSheet = false)}>
          &times;
        </button>
      </div>
      <ul class="bottom-sheet-list">
        {#each groups as group}
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          <li
            class:active={group === focusGroup}
            on:click={() => {
               selectSettingGroup(group);
               showBottomSheet = false;
             }}
          >
            <span class="bottom-sheet-list__icon">
              <svelte:component
                this={getGroupIcon(group)}
                size={17}
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
            {getGroupLabel(group)}
          </li>
        {/each}
      </ul>
    </div>
  </div>
  {/if}
</div>

<style lang="scss">
  .config__panel {
    --dodo-background: var(--b3-theme-background, #ffffff);
    --dodo-surface: var(--b3-theme-surface, var(--dodo-background));
    --dodo-foreground: var(
      --b3-theme-on-background,
      var(--b3-theme-on-surface, #09090b)
    );
    --dodo-muted-foreground: var(--b3-theme-on-surface-light, #71717a);
    --dodo-border: color-mix(in srgb, var(--dodo-foreground) 14%, transparent);
    --dodo-border-strong: color-mix(
      in srgb,
      var(--dodo-foreground) 22%,
      transparent
    );
    --dodo-muted: color-mix(
      in srgb,
      var(--dodo-surface) 94%,
      var(--dodo-foreground) 6%
    );
    /* Derive settings colors from SiYuan's active theme, not a second UI kit. */
    --dodo-accent: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    --dodo-hover: color-mix(in srgb, var(--b3-theme-primary) 5%, transparent);
    --dodo-primary: var(--b3-theme-primary);
    --dodo-primary-foreground: var(--b3-theme-on-primary);
    --dodo-ring: color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
    --dodo-success: #16a34a;
    --dodo-danger: var(--b3-theme-error, #dc2626);
    display: flex;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    /* Background, default font and text color are inherited from the native
       .config__panel and the active SiYuan theme. */
  }

  /* SiYuan's .config__side/.config__tab-title/.config__tab-head and
     .config__tab-scroll/.b3-list-item define the actual sidebar geometry.
     Only the Lucide stroke handling is plugin-specific. */
  .dodo-settings-sidebar__search {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
  }
  .sidebar-item__icon :global(svg),
  .mobile-selector-bar__icon :global(svg),
  .bottom-sheet-list__icon :global(svg) {
    display: block;
    flex: none;
    fill: none !important;
    stroke: currentColor !important;
  }
  .sidebar-item__icon :global(svg *),
  .mobile-selector-bar__icon :global(svg *),
  .bottom-sheet-list__icon :global(svg *) {
    fill: none !important;
    stroke: inherit !important;
    stroke-linecap: inherit !important;
    stroke-linejoin: inherit !important;
  }
  .mobile-settings-search { display: none; }
  .dodo-search-group { margin-bottom: 24px; }
  .dodo-search-group__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px 16px;
  }
  .dodo-search-group__heading h2 {
    margin: 0;
    font-size: var(--b3-font-size, 16px);
    font-weight: 600;
    line-height: 1.5;
    color: var(--b3-theme-on-background);
  }
  .dodo-search-empty {
    padding: 32px 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
    font-size: var(--b3-font-size, 16px);
  }
  .dodo-search-results .dodo-search-group:last-child { margin-bottom: 0; }
  .global-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0 14px;
    background-color: transparent;
    border: 0;
    border-bottom: 1px solid var(--dodo-border);
    border-radius: 0;
    margin-bottom: 18px;
    font-size: 13px;
    color: var(--dodo-muted-foreground);

    .banner-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .banner-left span:last-child {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .my-reload-button { flex-shrink: 0; }
  }

  .dodo-notice-icon {
    display: inline-flex;
    align-items: center;
    color: var(--dodo-primary);
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
  }
  .mobile-selector-bar {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-settings-search {
      display: block;
      margin: 0 16px 8px;
    }
    .mobile-settings-search .b3-text-field {
      width: 100%;
      box-sizing: border-box;
    }
    .config__panel {
      flex-direction: column;
      overflow-y: auto;
    }

    .dodo-settings-sidebar {
      display: none;
    }

    .mobile-selector-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 16px;
      margin: 16px 16px 8px;
      background-color: var(--dodo-surface);
      border: 1px solid var(--dodo-border);
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 1px 2px color-mix(in srgb, var(--dodo-foreground) 5%, transparent);

      .current-category {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .arrow-icon {
        flex: none;
        margin-left: 12px;
        font-size: 10px;
        color: var(--dodo-muted-foreground);
      }
    }

    .config__tab-wrap { flex: 1 1 auto; min-height: 0; }

    .global-banner {
      margin-bottom: 16px;
      padding: 10px 14px;
      flex-direction: row;
      align-items: center;
    }

    .my-reload-button {
      padding: 2px 10px;
      height: 26px;
    }

    .bottom-sheet-backdrop {
      position: fixed;
      inset: 0;
      background-color: color-mix(in srgb, #000000 50%, transparent);
      z-index: 9999;
      display: flex;
      align-items: flex-end;
    }

    .bottom-sheet-container {
      width: 100%;
      background-color: var(--dodo-surface);
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      max-height: 60%;
      display: flex;
      flex-direction: column;
      box-shadow: 0 -8px 24px color-mix(in srgb, #000000 16%, transparent);
      animation: slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .bottom-sheet-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--dodo-border);
      display: flex;
      align-items: center;
      justify-content: space-between;

      h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--dodo-foreground);
      }

      .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        color: var(--dodo-muted-foreground);
        line-height: 1;
      }
    }

    .bottom-sheet-list {
      margin: 0;
      padding: 8px 0 24px;
      overflow-y: auto;
      list-style: none;

      li {
        padding: 14px 24px;
        font-size: 14px;
        color: var(--dodo-foreground);
        border-bottom: 1px solid var(--dodo-border);
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        gap: 10px;

        &:last-child {
          border-bottom: none;
        }

        &:active {
          background-color: var(--dodo-accent);
        }

        &.active {
          color: var(--dodo-foreground);
          font-weight: 500;
          background-color: var(--dodo-accent);
        }
      }
    }
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
