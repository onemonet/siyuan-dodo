import { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "docBreadcrumb",
  displayName: "文档面包屑",
  description: "在当前编辑器顶部显示当前文档的层级路径，并支持点击跳转。",
  version: "0.1.0",
  author: "Codex",
  enabled: true,
  settings: [
    {
      type: "checkbox",
      title: "显示笔记本名称",
      description: "在路径最前面显示当前文档所属笔记本。",
      key: "showNotebook",
      value: true,
    },
  ],
};

export default pluginMetadata;
