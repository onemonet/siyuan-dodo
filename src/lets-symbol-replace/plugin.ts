import type { PluginMetadata } from "@/types/plugin";
import {
  DEFAULT_SYMBOL_REPLACE_RULES_TEXT,
  RULES_SETTING_KEY,
  SKIP_CODE_SETTING_KEY,
  SYMBOL_REPLACE_PLUGIN_NAME,
} from "./rules";

const pluginMetadata: PluginMetadata = {
  name: SYMBOL_REPLACE_PLUGIN_NAME,
  displayName: "符号自动替换",
  description: "在编辑区输入指定文本后自动替换为常用符号。",
  version: "0.1.0",
  author: "Codex",
  enabled: true,
  settings: [
    {
      type: "checkbox",
      section: "替换规则",
      title: "代码内不替换",
      description: "开启后，代码块和行内代码里的触发文本会保持原样。",
      key: SKIP_CODE_SETTING_KEY,
      value: true,
    },
    {
      type: "textarea",
      section: "替换规则",
      title: "规则",
      description: "一行一条，使用 | 分隔触发文本和替换文本，例如：-> | →。空行和 # 开头的行会忽略。",
      key: RULES_SETTING_KEY,
      value: DEFAULT_SYMBOL_REPLACE_RULES_TEXT,
      placeholder: DEFAULT_SYMBOL_REPLACE_RULES_TEXT,
      height: "140px",
    },
  ],
};

export default pluginMetadata;
