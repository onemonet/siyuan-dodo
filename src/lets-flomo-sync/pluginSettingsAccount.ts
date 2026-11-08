import type { PluginSettingItem } from "@/types/plugin";
import { FLOMO_DEFAULT_TIME_FORMAT } from "../config/constants";

const authStatusLabels = {
  unknown: "未校验",
  success: "已连接",
  error: "未连通",
} as const;

export const ACCOUNT_SETTINGS: PluginSettingItem[] = [
  {
    key: "username",
    section: "账号认证",
    title: "账号",
    description: "Flomo 手机号/邮箱",
    sectionStatus: {
      state: "unknown",
      label: authStatusLabels.unknown,
      title: authStatusLabels.unknown,
      stateKey: "accountAuthStatus",
      messageKey: "accountAuthMessage",
      checkedAtKey: "accountAuthCheckedAt",
      labels: authStatusLabels,
    },
    sectionAction: {
      key: "validateAccount",
      label: "校验",
      title: "校验 Flomo 账号认证配置",
    },
    type: "textinput",
    value: "",
    placeholder: "手机号或邮箱",
  },
  {
    key: "password",
    section: "账号认证",
    title: "密码",
    description: "Flomo 密码",
    type: "textinput",
    value: "",
    placeholder: "密码",
  },
  {
    key: "lastSyncTime",
    section: "同步状态",
    title: "上次同步时间",
    description: "上次同步的时间点，之后的数据会被同步",
    type: "textinput",
    value: "",
    placeholder: FLOMO_DEFAULT_TIME_FORMAT,
  },
  {
    key: "syncSuccessTag",
    section: "同步状态",
    title: "同步成功标签",
    description: "同步成功后给 Flomo 笔记打的标签",
    type: "textinput",
    value: "",
    placeholder: "例如: siyuan-synced",
  },
];
