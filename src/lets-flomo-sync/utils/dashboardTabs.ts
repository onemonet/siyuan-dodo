export const DASHBOARD_TABS = {
  main: "main",
  review: "review",
  stats: "stats",
} as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[keyof typeof DASHBOARD_TABS];

export const DASHBOARD_TAB_OPTIONS: Array<{
  id: DashboardTab;
  label: string;
}> = [
  { id: DASHBOARD_TABS.main, label: "主视图" },
  { id: DASHBOARD_TABS.review, label: "每日回顾" },
  { id: DASHBOARD_TABS.stats, label: "统计" },
];
