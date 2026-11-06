import type { PluginSettingItem } from "@/types/plugin";
import { FLOMO_DEFAULT_TIME_FORMAT } from "../config/constants";
import { FLOMO_DEFAULT_CONTENT_TEMPLATE } from "./config";

export const CONTENT_SETTINGS: PluginSettingItem[] = [
  {
    key: "contentTemplate",
    section: "内容格式",
    title: "内容模板",
    description: "同步笔记的内容模板，支持 ${time} 和 ${content} 变量",
    type: "textarea",
    value: FLOMO_DEFAULT_CONTENT_TEMPLATE,
    placeholder: FLOMO_DEFAULT_CONTENT_TEMPLATE,
    height: "150px",
  },
  {
    key: "timeFormat",
    section: "内容格式",
    title: "时间格式",
    description: "时间显示格式",
    type: "textinput",
    value: FLOMO_DEFAULT_TIME_FORMAT,
    placeholder: FLOMO_DEFAULT_TIME_FORMAT,
  },
  {
    key: "showMemoDate",
    section: "内容格式",
    title: "正文显示 memo 时间",
    description: "根据 custom-dodo-memo 按时间格式在正文中显示 memo 时间",
    type: "checkbox",
    value: false,
  },
  {
    key: "memosSort",
    section: "内容格式",
    title: "排序方式",
    description: "同步笔记的排序方式",
    type: "select",
    value: "asc",
    options: {
      asc: "正序（旧的在前）",
      desc: "倒序（新的在前）",
    },
  },
];
