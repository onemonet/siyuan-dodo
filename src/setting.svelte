<script lang="ts">
  import { settings } from "@/settings";
  import { showMessage } from "siyuan";
  import { onDestroy } from "svelte";
  import SettingPanel from "./libs/setting-panel.svelte";
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

    for (let index = 0; index < SettingItems[focusGroup].length; index++) {
      if (SettingItems[focusGroup][index].key === detail.key) {
        SettingItems[focusGroup][index].value =
          focusGroup === "开关"
            ? detail.value
            : coerceSettingValue(SettingItems[focusGroup][index], detail.value);
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
  <!-- Desktop Sidebar -->
  <ul class="sidebar-menu">
    {#each groups as group}
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <li
        class="sidebar-item"
        class:active={group === focusGroup}
        on:click={() => {
          focusGroup = group;
          settings.save();
        }}
        on:keydown={() => {}}
      >
        <span class="sidebar-item__icon">
          <svelte:component
            this={getGroupIcon(group)}
            size={17}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
        <span class="b3-list-item__text_my">{getGroupLabel(group)}</span>
      </li>
    {/each}
  </ul>

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
    <span class="current-category">{getGroupLabel(focusGroup)}</span>
    <span class="arrow-icon">▼</span>
  </div>

  <!-- Main Content Wrap -->
  <div class="config__tab-wrap">
    <!-- Global Persistent Warning Banner -->
    <div class="global-banner">
      <div class="banner-left">
        <span>💡</span>
        <span>{plugin?.i18n?.["settings.restartWarning"] || "部分功能设置后需重启插件生效."}</span>
      </div>
      <button
        class="b3-button b3-button--outline my-reload-button"
        on:click={lreload}
      >
        {plugin?.i18n?.["settings.reloadNow"] || "现在重载"}
      </button>
    </div>

    <!-- Active Setting Panel -->
    <div class="panel-content">
    <SettingPanel
      group={focusGroup}
      settingItems={SettingItems[focusGroup]}
      on:changed={onChanged}
      on:click={onClick}
    />
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
              focusGroup = group;
              settings.save();
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
    --dodo-accent: color-mix(
      in srgb,
      var(--dodo-surface) 90%,
      var(--dodo-foreground) 10%
    );
    --dodo-primary: var(--dodo-foreground);
    --dodo-primary-foreground: var(--dodo-background);
    --dodo-ring: color-mix(in srgb, var(--dodo-foreground) 24%, transparent);
    --dodo-success: #16a34a;
    --dodo-danger: var(--b3-theme-error, #dc2626);
    display: flex;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--dodo-foreground);
    background-color: var(--dodo-background);
  }

  .sidebar-menu {
    width: 200px;
    flex: 0 0 200px;
    border-right: 1px solid var(--dodo-border);
    padding: 16px 12px;
    margin: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    background-color: var(--dodo-muted);
  }

  .sidebar-item {
    list-style: none;
    padding: 10px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--dodo-foreground);
    display: flex;
    align-items: center;
    gap: 10px;

    &:hover {
      background-color: var(--dodo-accent);
    }

    &.active {
      background-color: var(--dodo-accent);
      color: var(--dodo-foreground);
      font-weight: 500;
    }
  }

  .b3-list-item__text_my {
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-item__icon,
  .mobile-selector-bar__icon,
  .bottom-sheet-list__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 17px;
    width: 17px;
    height: 17px;
    color: var(--dodo-muted-foreground);
    transition: color 0.2s ease;
  }

  .sidebar-item__icon :global(svg),
  .mobile-selector-bar__icon :global(svg),
  .bottom-sheet-list__icon :global(svg) {
    display: block;
    width: 17px;
    height: 17px;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  .sidebar-item__icon :global(svg *),
  .mobile-selector-bar__icon :global(svg *),
  .bottom-sheet-list__icon :global(svg *) {
    fill: none !important;
    stroke: inherit !important;
    stroke-linecap: inherit !important;
    stroke-linejoin: inherit !important;
  }

  .sidebar-item:hover .sidebar-item__icon,
  .sidebar-item.active .sidebar-item__icon,
  .mobile-selector-bar:focus-visible .mobile-selector-bar__icon,
  .bottom-sheet-list li.active .bottom-sheet-list__icon {
    color: var(--dodo-foreground);
  }

  .config__tab-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 24px;
    box-sizing: border-box;
  }

  .panel-content {
    flex: 1;
    min-width: 0;
  }

  .global-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background-color: var(--dodo-muted);
    border: 1px solid var(--dodo-border);
    border-radius: 8px;
    margin-bottom: 20px;
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

    .my-reload-button {
      flex-shrink: 0;
      border: 1px solid var(--dodo-border-strong) !important;
      color: var(--dodo-foreground) !important;
      background: transparent;
      padding: 4px 12px;
      font-size: 12px;
      height: 28px;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background-color: var(--dodo-primary) !important;
        color: var(--dodo-primary-foreground) !important;
      }
    }
  }

  .mobile-selector-bar {
    display: none;
  }

  @media (max-width: 768px) {
    .config__panel {
      flex-direction: column;
      overflow-y: auto;
    }

    .sidebar-menu {
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

    .config__tab-wrap {
      padding: 8px 16px 16px;
    }

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
