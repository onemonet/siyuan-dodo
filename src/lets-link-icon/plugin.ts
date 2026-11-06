import type { PluginMetadata } from "@/types/plugin";
import { linkIconSettings } from "./settings";

const pluginMetadata: PluginMetadata = {
  name: "link-icon",
  displayName: "链接图标",
  description: "为外链与文档引用显示图标，提供自定义图标管理能力，并支持通过块属性渲染 Open Graph 链接卡片。",
  version: "0.1.0",
  author: "frostime",
  enabled: false,
  settings: linkIconSettings,
};

export default pluginMetadata;
