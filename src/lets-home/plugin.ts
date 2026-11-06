import type { PluginMetadata } from "../types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "home",
  displayName: "主页",
  description: "可拖拽、缩放、分区的思源个人工作台。",
  version: "0.1.0",
  author: "Codex",
  enabled: true,
  settings: [
    {
      type: "checkbox",
      title: "启动时打开主页",
      description: "思源启动完成后自动打开主页标签。",
      key: "auto-open",
      value: false,
      section: "主页",
      sectionDescription: "主页首版提供工作台框架，具体模块后续逐步接入。",
    },
    {
      type: "select",
      title: "默认布局模板",
      description: "没有保存过布局时使用的初始排列方式。",
      key: "default-template",
      value: "balanced",
      options: {
        balanced: "平衡",
        focus: "聚焦",
        dense: "密集",
      },
      section: "主页",
    },
  ],
};

export default pluginMetadata;
