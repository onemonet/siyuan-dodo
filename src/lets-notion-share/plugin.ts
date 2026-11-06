import { PluginMetadata } from "@/types/plugin";
import {
  NOTION_SETTING_DATABASE_ID_KEY,
  NOTION_SETTING_TOKEN_KEY,
} from "./constants";

export const pluginMetadata: PluginMetadata = {
  name: "notionShare",
  displayName: "分享到 Notion",
  description: "将当前思源笔记分享到 Notion 数据库，并写入分享链接属性",
  version: "1.0.0",
  settings: [
    {
      type: "textinput",
      title: "Notion Integration Token",
      description: "Notion 官方集成令牌，格式通常以 secret_ 开头",
      key: NOTION_SETTING_TOKEN_KEY,
      value: "",
      placeholder: "secret_xxx",
    },
    {
      type: "textinput",
      title: "Notion Database ID",
      description: "用于接收分享页面的 Notion 数据库 ID",
      key: NOTION_SETTING_DATABASE_ID_KEY,
      value: "",
      placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  ],
};

export default pluginMetadata;
