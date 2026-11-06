/**
 * Flomo 同步插件元数据
 */
import type { PluginMetadata } from "@/types/plugin";
import { createFlomoPluginSettings } from "./pluginSettings";

const pluginMetadata: PluginMetadata = {
  name: "flomo-sync",
  displayName: "Flomo 同步",
  description: "将 Flomo 笔记同步到思源笔记",
  version: "1.0.0",
  enabled: false,
  settings: createFlomoPluginSettings(),
};

export default pluginMetadata;
