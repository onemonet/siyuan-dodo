import type { PluginMetadata } from "../types/plugin";
import { defaults } from "./config";

const metadata: PluginMetadata = {
  name: "excalidraw",
  displayName: "Excalidraw",
  description: "可编辑手绘画布，支持 SVG/PNG、思源块嵌入及智能体绘图。启用前请停用独立 Excalidraw 插件。",
  enabled: false,
  settings: [
    { key: "toolbarEnabled", type: "checkbox", title: "显示悬浮工具栏", value: true, section: "悬浮工具栏" },
    { key: "toolbarMode", type: "select", title: "工具栏位置", value: "follow", options: { follow: "跟随选区", fixed: "固定位置" }, section: "悬浮工具栏" },
    { key: "toolbarShowLabels", type: "checkbox", title: "显示工具名称", value: false, section: "悬浮工具栏" },
    { key: "toolbar-customize", type: "button", title: "自定义工具栏", value: "管理画布增强", description: "在已打开的画布中调整常用工具与顺序。", section: "悬浮工具栏" },
    { key: "labelDisplay", type: "select", title: "标签显示", value: defaults.labelDisplay, options: { noLabel: "不显示", showLabelAlways: "始终显示", showLabelOnHover: "悬停显示" } },
    { key: "embedImageFormat", type: "select", title: "新画布格式", value: defaults.embedImageFormat, options: { svg: "SVG", png: "PNG" } },
    { key: "editWindow", type: "select", title: "编辑窗口", value: defaults.editWindow, options: { dialog: "弹窗", tab: "标签页" } },
    { key: "fullscreenEdit", type: "checkbox", title: "全屏编辑", value: defaults.fullscreenEdit },
    { key: "themeMode", type: "select", title: "主题", value: defaults.themeMode, options: { themeLight: "浅色", themeDark: "深色", themeOS: "跟随思源" } },
    { key: "enableAutoSave", type: "checkbox", title: "自动保存", value: defaults.enableAutoSave },
    { key: "autoSaveInterval", type: "number", title: "自动保存间隔（秒）", description: "0 表示即时保存。设置变更在下次打开画布时生效。", value: defaults.autoSaveInterval },
    { key: "fullSaveDelay", type: "number", title: "完全保存延迟（秒）", value: defaults.fullSaveDelay },
    { key: "snippet-settings", type: "button", title: "代码片段", value: "选择代码片段", description: "选择允许在画布中执行的思源 JS/CSS 代码片段。" },
  ],
};
export default metadata;
