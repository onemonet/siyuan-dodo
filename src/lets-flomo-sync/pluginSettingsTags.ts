import type { PluginSettingItem } from "@/types/plugin";

export const TAG_FILTER_SETTINGS: PluginSettingItem[] = [
  {
    key: "syncTagMode",
    section: "标签过滤",
    title: "标签筛选模式",
    description: "按标签筛选要同步的笔记",
    type: "select",
    value: "0",
    options: {
      "0": "排除标签",
      "1": "包含标签",
    },
  },
  {
    key: "syncIncludeTags",
    section: "标签过滤",
    visibleWhen: { key: "syncTagMode", equals: "1" },
    title: "包含标签",
    description: "只同步包含这些标签的笔记（逗号分隔）",
    type: "textinput",
    value: "",
    placeholder: "tag1,tag2",
  },
  {
    key: "syncExcludeTags",
    section: "标签过滤",
    visibleWhen: { key: "syncTagMode", equals: "0" },
    title: "排除标签",
    description: "排除包含这些标签的笔记（逗号分隔）",
    type: "textinput",
    value: "",
    placeholder: "tag1,tag2",
  },
];
