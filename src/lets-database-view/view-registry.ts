import type { ViewMode } from "./view-config-schema";

/** Static built-ins: one place for picker identity and renderer entry URLs. */
export const DATABASE_VIEW_DEFINITIONS = [
  { id: "table", label: "表格", path: "", icon: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18"/>' },
  { id: "map", label: "地图", path: "/plugins/siyuan-dodo/preview/map/index.html", icon: '<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/>' },
  { id: "chart", label: "图表", path: "/plugins/siyuan-dodo/preview/chart/chart-iframe.html", icon: '<path d="M5 21v-6M12 21V3M19 21V9"/>' },
  { id: "timeline", label: "时间线", path: "/plugins/siyuan-dodo/preview/timeline/iframe/index.html", icon: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M3 10h18M8 2v4"/>' },
  { id: "gantt", label: "甘特", path: "/plugins/siyuan-dodo/preview/gantt/gantt-iframe.html", icon: '<path d="M6 3v12M12 3v3M18 3v6M6 8h6M12 11h6M4 21h16"/>' },
  { id: "calendar", label: "日历", path: "/plugins/siyuan-dodo/preview/calendar/index.html", icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h2M14 15h2"/>' },
  { id: "custom", label: "AI 自定义", path: "about:blank", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 8 5 12l4 4m6-8 4 4-4 4M13 7l-2 10"/>' },
] as const satisfies ReadonlyArray<{ id: ViewMode; label: string; path: string; icon: string }>;

export function databaseViewDefinition(kind: ViewMode) {
  return DATABASE_VIEW_DEFINITIONS.find(item => item.id === kind)!;
}
