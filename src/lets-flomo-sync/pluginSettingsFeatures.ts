import type { PluginSettingItem } from "@/types/plugin";

export const FEATURE_SETTINGS: PluginSettingItem[] = [
  {
    key: "enableQuickNote",
    section: "功能开关",
    title: "启用速记",
    description: "启用 F10 快捷键速记功能",
    type: "checkbox",
    value: true,
  },
  {
    key: "enableSilentSync",
    section: "功能开关",
    title: "启动时自动同步",
    description: "思源启动时自动在后台同步 Flomo 笔记",
    type: "checkbox",
    value: false,
  },
  {
    key: "showManualSyncMenu",
    section: "功能开关",
    title: "显示立即同步入口",
    description: "在插件菜单中显示手动同步 Flomo 的入口",
    type: "checkbox",
    value: true,
  },
  {
    key: "debugMode",
    section: "功能开关",
    title: "调试模式",
    description: "开启后同步不会更新上次同步时间",
    type: "checkbox",
    value: false,
  },
];
