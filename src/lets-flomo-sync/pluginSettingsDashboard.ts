import type { PluginSettingItem } from "@/types/plugin";

const REVIEW_COUNT_OPTIONS = {
  "4": "4条",
  "8": "8条",
  "12": "12条",
  "16": "16条",
  "20": "20条",
  "24": "24条",
} as const;

const REVIEW_TIME_RANGE_OPTIONS = {
  all: "全部时间",
  "1year": "1年内",
  "6months": "6个月内",
  "3months": "3个月内",
  "1month": "1个月内",
} as const;

export const DASHBOARD_SETTINGS: PluginSettingItem[] = [
  {
    key: "dashboardBlockId",
    section: "仪表盘",
    title: "仪表盘块 ID",
    description:
      "填写用于仪表盘的块 ID，打开时会转换为原生 SQL 查询嵌入块，筛选变化会更新它的 SQL",
    type: "textinput",
    value: "",
    placeholder: "例如：20240101123456-abcdefg",
  },
  {
    key: "reviewCount",
    section: "每日回顾",
    title: "每日回顾数量",
    description: "每次回顾随机展示的记录数",
    type: "select",
    value: "8",
    options: REVIEW_COUNT_OPTIONS,
  },
  {
    key: "reviewTimeRange",
    section: "每日回顾",
    title: "每日回顾时间范围",
    description: "只从此时间范围内的记录中随机抽取",
    type: "select",
    value: "6months",
    options: REVIEW_TIME_RANGE_OPTIONS,
  },
];
