import type { PluginSettingItem } from "@/types/plugin";

export const LOCATION_SETTINGS: PluginSettingItem[] = [
  {
    key: "locationMode",
    section: "存储位置",
    title: "存储位置",
    description: "同步笔记的存储方式",
    type: "select",
    value: "0",
    options: {
      "0": "DailyNote 模式",
      "1": "指定文档",
    },
  },
  {
    key: "dailnoteNotebook",
    section: "存储位置",
    visibleWhen: { key: "locationMode", equals: "0" },
    title: "DailyNote 笔记本",
    type: "select",
    value: "",
    // Options come from /api/notebook/lsNotebooks at view mount.
    // Do not set static options={} here: schema coercion must retain saved IDs.
  },
  {
    key: "pageId",
    section: "存储位置",
    visibleWhen: { key: "locationMode", equals: "1" },
    title: "指定文档 ID",
    description: "指定文档模式下的目标文档 ID",
    type: "textinput",
    value: "",
    placeholder: "文档块 ID",
  },
];
