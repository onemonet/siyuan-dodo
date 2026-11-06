import { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "quickInput",
  displayName: "快捷输入",
  description: "输入 @ 触发快捷输入菜单，支持语义时间解析和文档块搜索。",
  version: "0.1.0",
  author: "Codex",
  enabled: true,
  settings: [
    {
      type: "checkbox",
      title: "启用时间搜索",
      description: "识别今天、明天、下周五等语义时间。",
      section: "时间",
      key: "timeSearchEnabled",
      value: true,
    },
    {
      type: "number",
      title: "排序权重",
      description: "数字越小，结果越靠前。",
      section: "时间",
      key: "timeSearchWeight",
      value: 10,
      visibleWhen: { key: "timeSearchEnabled", equals: true },
    },
    {
      type: "checkbox",
      title: "启用文档搜索",
      description: "通过思源全文搜索接口查找文档块。",
      section: "文档",
      key: "documentSearchEnabled",
      value: true,
    },
    {
      type: "number",
      title: "排序权重",
      description: "数字越小，结果越靠前。",
      section: "文档",
      key: "documentSearchWeight",
      value: 20,
      visibleWhen: { key: "documentSearchEnabled", equals: true },
    },
  ],
};

export default pluginMetadata;
