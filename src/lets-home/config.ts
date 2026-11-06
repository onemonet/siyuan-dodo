export type HomeLayoutTemplate = "balanced" | "focus" | "dense";

export const HOME_TAB_TYPE = "home";
export const HOME_LAYOUT_VERSION = 3;
export const HOME_GRID_COLUMNS = 12;
export const HOME_GRID_CELL_HEIGHT = 72;
export const HOME_GRID_MARGIN = 8;
export const HOME_GRID_MIN_ROWS = 10;

export type HomeLegacyWidgetId = "notes" | "quick" | "focus" | "life" | "ai";

export type HomeComponentId =
  | "recent-documents"
  | "favorite-documents"
  | "tasks"
  | "quick-note"
  | "sub-documents"
  | "conditional-documents"
  | "review-documents"
  | "sticky-note"
  | "reinforced-diary"
  | "heatmap"
  | "sql-query"
  | "visualization-chart"
  | "query-view"
  | "statistics-card"
  | "advanced-pomodoro"
  | "calendar"
  | "habit-tracker"
  | "anniversary"
  | "weather"
  | "clock"
  | "next-holiday"
  | "music"
  | "image-carousel"
  | "bookkeeping"
  | "hot-search"
  | "quote-of-day"
  | "news"
  | "horoscope"
  | "today-in-history"
  | "document-editor"
  | "text-content"
  | "web-browser";

export type HomeWidgetId = HomeLegacyWidgetId | HomeComponentId;

export type HomeWidgetCategory =
  | "notes-data"
  | "visualization"
  | "daily-tools"
  | "information"
  | "custom";

export interface HomeWidget {
  id: HomeWidgetId;
  instanceId?: string;
  config?: HomeWidgetConfig;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HomeWidgetBackgroundMode = "default" | "solid" | "gradient";

export interface HomeWidgetBackground {
  mode: HomeWidgetBackgroundMode;
  color?: string;
  gradient?: string;
  blendMode?: string;
}

export interface HomeWidgetConfig {
  title?: string;
  content?: string;
  background?: HomeWidgetBackground;
}

export interface HomeLayout {
  version: typeof HOME_LAYOUT_VERSION;
  template: HomeLayoutTemplate;
  widgets: HomeWidget[];
}

export interface HomeWidgetDefinition {
  id: HomeWidgetId;
  title: string;
  eyebrow: string;
  description: string;
  category?: HomeWidgetCategory;
  implemented: boolean;
  legacy?: boolean;
}

export interface HomeWidgetCategoryDefinition {
  id: HomeWidgetCategory;
  title: string;
  description: string;
}

export const HOME_CANVAS_WIDTH = 1280;
export const HOME_CANVAS_HEIGHT = 960;
export const HOME_CANVAS_PADDING = 40;
export const HOME_WIDGET_MIN_WIDTH = 3;
export const HOME_WIDGET_MIN_HEIGHT = 2;
export const HOME_WIDGET_DEFAULT_WIDTH = 4;
export const HOME_WIDGET_DEFAULT_HEIGHT = 3;
export const HOME_CLOCK_MIN_WIDTH = 1;
export const HOME_CLOCK_MIN_HEIGHT = 1;
export const HOME_CLOCK_DEFAULT_WIDTH = 2;
export const HOME_CLOCK_DEFAULT_HEIGHT = 2;
export const HOME_HOLIDAY_DEFAULT_WIDTH = 2;
export const HOME_HOLIDAY_DEFAULT_HEIGHT = 2;

export function getHomeWidgetMinWidth(id: HomeWidgetId): number {
  return id === "clock" || id === "next-holiday"
    ? HOME_CLOCK_MIN_WIDTH
    : HOME_WIDGET_MIN_WIDTH;
}

export function getHomeWidgetMinHeight(id: HomeWidgetId): number {
  return id === "clock" || id === "next-holiday"
    ? HOME_CLOCK_MIN_HEIGHT
    : HOME_WIDGET_MIN_HEIGHT;
}

export const HOME_WIDGET_CATEGORIES: HomeWidgetCategoryDefinition[] = [
  {
    id: "notes-data",
    title: "笔记数据",
    description: "汇总和操作思源中的文档、任务与日记",
  },
  {
    id: "visualization",
    title: "可视化",
    description: "把笔记数据和自定义数据转成图表或统计结果",
  },
  {
    id: "daily-tools",
    title: "日常工具",
    description: "在主页中完成计时、日期、媒体和生活管理",
  },
  {
    id: "information",
    title: "信息资讯",
    description: "从互联网或 AI 获取每日内容",
  },
  {
    id: "custom",
    title: "自定义",
    description: "展示插件预设之外的文档、文字或网页",
  },
];

export const HOME_LEGACY_WIDGET_IDS: HomeLegacyWidgetId[] = [
  "notes",
  "quick",
  "focus",
  "life",
  "ai",
];

export const HOME_WIDGET_CATALOG: HomeWidgetDefinition[] = [
  {
    id: "notes",
    title: "今日笔记",
    eyebrow: "笔记入口",
    description: "把今天要留下的东西放在一个顺手的位置。",
    implemented: true,
    legacy: true,
  },
  {
    id: "quick",
    title: "常用入口",
    eyebrow: "工作台",
    description: "常用文档、收藏与最近打开的内容。",
    implemented: true,
    legacy: true,
  },
  {
    id: "focus",
    title: "效率工具",
    eyebrow: "效率工具",
    description: "把重复动作收进一个更短的路径。",
    implemented: true,
    legacy: true,
  },
  {
    id: "life",
    title: "生活数据",
    eyebrow: "生活数据",
    description: "睡眠、运动、心情与日常记录。",
    implemented: true,
    legacy: true,
  },
  {
    id: "ai",
    title: "AI 工作台",
    eyebrow: "AI",
    description: "把思考整理成可以反复使用的工作流。",
    implemented: true,
    legacy: true,
  },
  {
    id: "recent-documents",
    title: "最近文档",
    eyebrow: "笔记数据",
    description: "查看最近打开或编辑的文档。",
    category: "notes-data",
    implemented: true,
  },
  {
    id: "favorite-documents",
    title: "收藏文档",
    eyebrow: "笔记数据",
    description: "集中访问收藏的文档。",
    category: "notes-data",
    implemented: false,
  },
  {
    id: "tasks",
    title: "任务",
    eyebrow: "笔记数据",
    description: "汇总和处理笔记中的任务。",
    category: "notes-data",
    implemented: true,
  },
  {
    id: "quick-note",
    title: "快速笔记",
    eyebrow: "笔记数据",
    description: "从主页快速留下新笔记。",
    category: "notes-data",
    implemented: false,
  },
  {
    id: "sub-documents",
    title: "子文档",
    eyebrow: "笔记数据",
    description: "查看当前文档的子文档。",
    category: "notes-data",
    implemented: false,
  },
  {
    id: "conditional-documents",
    title: "条件文档",
    eyebrow: "笔记数据",
    description: "按条件筛选和汇总文档。",
    category: "notes-data",
    implemented: false,
  },
  {
    id: "review-documents",
    title: "复习文档",
    eyebrow: "笔记数据",
    description: "集中处理需要复习的内容。",
    category: "notes-data",
    implemented: false,
  },
  {
    id: "sticky-note",
    title: "便签",
    eyebrow: "笔记数据",
    description: "放置短期提醒和临时内容。",
    category: "notes-data",
    implemented: true,
  },
  {
    id: "reinforced-diary",
    title: "强化日记",
    eyebrow: "笔记数据",
    description: "把日记和复盘流程放在主页。",
    category: "notes-data",
    implemented: false,
  },
  {
    id: "heatmap",
    title: "热力图",
    eyebrow: "可视化",
    description: "用热力图观察笔记和活动趋势。",
    category: "visualization",
    implemented: false,
  },
  {
    id: "sql-query",
    title: "SQL 查询",
    eyebrow: "可视化",
    description: "将 SQL 查询结果放进主页。",
    category: "visualization",
    implemented: false,
  },
  {
    id: "visualization-chart",
    title: "可视化图表",
    eyebrow: "可视化",
    description: "把查询结果转成图表。",
    category: "visualization",
    implemented: false,
  },
  {
    id: "query-view",
    title: "Query 视图",
    eyebrow: "可视化",
    description: "渲染 Query & View 插件的 //!js 查询嵌入块。",
    category: "visualization",
    implemented: true,
  },
  {
    id: "statistics-card",
    title: "统计卡片",
    eyebrow: "可视化",
    description: "突出显示关键统计数字。",
    category: "visualization",
    implemented: true,
  },
  {
    id: "advanced-pomodoro",
    title: "高级番茄钟",
    eyebrow: "日常工具",
    description: "在主页进行专注和休息计时。",
    category: "daily-tools",
    implemented: true,
  },
  {
    id: "calendar",
    title: "全局日历",
    eyebrow: "日常工具",
    description: "查看和管理日程日期。",
    category: "daily-tools",
    implemented: true,
  },
  {
    id: "habit-tracker",
    title: "习惯打卡",
    eyebrow: "日常工具",
    description: "记录每天的习惯完成情况。",
    category: "daily-tools",
    implemented: false,
  },
  {
    id: "anniversary",
    title: "纪念日",
    eyebrow: "日常工具",
    description: "记录重要日期和倒计时。",
    category: "daily-tools",
    implemented: false,
  },
  {
    id: "weather",
    title: "天气",
    eyebrow: "日常工具",
    description: "查看当前位置的天气信息。",
    category: "daily-tools",
    implemented: false,
  },
  {
    id: "clock",
    title: "时钟",
    eyebrow: "日常工具",
    description: "显示当前时间和时区。",
    category: "daily-tools",
    implemented: true,
  },
  {
    id: "next-holiday",
    title: "下一个假期",
    eyebrow: "日常工具",
    description: "查看距离下一个假期还有多少天。",
    category: "daily-tools",
    implemented: true,
  },
  {
    id: "music",
    title: "音乐",
    eyebrow: "日常工具",
    description: "在主页控制和播放音乐。",
    category: "daily-tools",
    implemented: false,
  },
  {
    id: "image-carousel",
    title: "图片轮播",
    eyebrow: "日常工具",
    description: "轮播显示指定的图片内容。",
    category: "daily-tools",
    implemented: false,
  },
  {
    id: "bookkeeping",
    title: "记账",
    eyebrow: "日常工具",
    description: "记录和查看日常收支。",
    category: "daily-tools",
    implemented: false,
  },
  {
    id: "hot-search",
    title: "热搜",
    eyebrow: "信息资讯",
    description: "查看当日热门搜索内容。",
    category: "information",
    implemented: false,
  },
  {
    id: "quote-of-day",
    title: "每日一言",
    eyebrow: "信息资讯",
    description: "每天展示一句精选内容。",
    category: "information",
    implemented: false,
  },
  {
    id: "news",
    title: "新闻资讯",
    eyebrow: "信息资讯",
    description: "聚合你关注的新闻内容。",
    category: "information",
    implemented: false,
  },
  {
    id: "horoscope",
    title: "星座运势",
    eyebrow: "信息资讯",
    description: "查看每日星座运势。",
    category: "information",
    implemented: false,
  },
  {
    id: "today-in-history",
    title: "历史上的今天",
    eyebrow: "信息资讯",
    description: "了解今天发生过的历史事件。",
    category: "information",
    implemented: false,
  },
  {
    id: "document-editor",
    title: "文档编辑器",
    eyebrow: "自定义",
    description: "在主页直接编辑指定文档。",
    category: "custom",
    implemented: false,
  },
  {
    id: "text-content",
    title: "文字内容",
    eyebrow: "自定义",
    description: "展示一段可配置的文字内容。",
    category: "custom",
    implemented: false,
  },
  {
    id: "web-browser",
    title: "网页浏览器",
    eyebrow: "自定义",
    description: "在主页嵌入指定网页。",
    category: "custom",
    implemented: false,
  },
];

export const HOME_COMPONENT_CATALOG = HOME_WIDGET_CATALOG.filter(
  (widget) => !widget.legacy,
);

const TEMPLATE_POSITIONS: Record<
  HomeLayoutTemplate,
  Record<HomeLegacyWidgetId, Omit<HomeWidget, "id">>
> = {
  balanced: {
    notes: { x: 0, y: 0, w: 7, h: 4 },
    quick: { x: 7, y: 0, w: 5, h: 4 },
    focus: { x: 0, y: 4, w: 4, h: 4 },
    life: { x: 4, y: 4, w: 4, h: 4 },
    ai: { x: 8, y: 4, w: 4, h: 4 },
  },
  focus: {
    notes: { x: 0, y: 0, w: 8, h: 5 },
    focus: { x: 8, y: 0, w: 4, h: 5 },
    quick: { x: 0, y: 5, w: 4, h: 3 },
    ai: { x: 4, y: 5, w: 8, h: 3 },
    life: { x: 0, y: 8, w: 12, h: 3 },
  },
  dense: {
    notes: { x: 0, y: 0, w: 5, h: 4 },
    quick: { x: 5, y: 0, w: 7, h: 4 },
    focus: { x: 0, y: 4, w: 3, h: 4 },
    life: { x: 3, y: 4, w: 3, h: 4 },
    ai: { x: 6, y: 4, w: 6, h: 4 },
  },
};

export function createHomeLayout(template: HomeLayoutTemplate): HomeLayout {
  return {
    version: HOME_LAYOUT_VERSION,
    template,
    widgets: HOME_LEGACY_WIDGET_IDS.map((id) => ({
      id,
      ...TEMPLATE_POSITIONS[template][id],
    })),
  };
}

export function getHomeWidgetDefinition(
  id: HomeWidgetId,
): HomeWidgetDefinition {
  return (
    HOME_WIDGET_CATALOG.find((widget) => widget.id === id) ??
    HOME_WIDGET_CATALOG[0]
  );
}

export function getWidgetInstanceId(
  widget: Pick<HomeWidget, "id" | "instanceId">,
): string {
  return widget.instanceId?.trim() || widget.id;
}

export function parseHomeLayout(
  raw: unknown,
  fallbackTemplate: HomeLayoutTemplate,
): HomeLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createHomeLayout(fallbackTemplate);
  }

  const data = raw as Partial<HomeLayout> & { version?: number };
  const template = isHomeLayoutTemplate(data.template)
    ? data.template
    : fallbackTemplate;
  const knownIds = new Set(HOME_WIDGET_CATALOG.map((widget) => widget.id));
  const widgets = Array.isArray(data.widgets)
    ? data.widgets
        .filter((widget): widget is HomeWidget => {
          return Boolean(
            widget &&
              typeof widget === "object" &&
              knownIds.has((widget as HomeWidget).id) &&
              Number.isFinite((widget as HomeWidget).x) &&
              Number.isFinite((widget as HomeWidget).y) &&
              Number.isFinite((widget as HomeWidget).w) &&
              Number.isFinite((widget as HomeWidget).h),
          );
        })
        .map((widget) => {
          if (data.version === HOME_LAYOUT_VERSION) {
            return normalizeWidget(widget);
          }
          return data.version === 2
            ? migratePixelWidget(widget)
            : migrateLegacyWidget(widget);
        })
    : [];

  const uniqueWidgets: HomeWidget[] = [];
  const usedInstanceIds = new Set<string>();
  widgets.forEach((widget, index) => {
    const baseInstanceId = getWidgetInstanceId(widget);
    let instanceId = baseInstanceId;

    if (usedInstanceIds.has(instanceId)) {
      instanceId = `${baseInstanceId}-${index + 1}`;
      while (usedInstanceIds.has(instanceId)) {
        instanceId += "-1";
      }
      uniqueWidgets.push({ ...widget, instanceId });
    } else {
      uniqueWidgets.push(widget);
    }

    usedInstanceIds.add(instanceId);
  });

  return uniqueWidgets.length > 0
    ? { version: HOME_LAYOUT_VERSION, template, widgets: uniqueWidgets }
    : createHomeLayout(template);
}

export function isHomeLayoutTemplate(
  value: unknown,
): value is HomeLayoutTemplate {
  return value === "balanced" || value === "focus" || value === "dense";
}

function normalizeWidget(widget: HomeWidget): HomeWidget {
  const minWidth = getHomeWidgetMinWidth(widget.id);
  const minHeight = getHomeWidgetMinHeight(widget.id);
  const w = Math.min(
    HOME_GRID_COLUMNS,
    Math.max(minWidth, Math.round(widget.w)),
  );
  const h = Math.max(minHeight, Math.round(widget.h));

  return {
    id: widget.id,
    instanceId: widget.instanceId?.trim() || undefined,
    config: widget.config ? { ...widget.config } : undefined,
    x: Math.max(0, Math.min(HOME_GRID_COLUMNS - w, Math.round(widget.x))),
    y: Math.max(0, Math.round(widget.y)),
    w,
    h,
  };
}

function migratePixelWidget(widget: HomeWidget): HomeWidget {
  const columnWidth = HOME_CANVAS_WIDTH / HOME_GRID_COLUMNS;

  return normalizeWidget({
    id: widget.id,
    instanceId: widget.instanceId,
    config: widget.config,
    x: Math.round(widget.x / columnWidth),
    y: Math.round(widget.y / HOME_GRID_CELL_HEIGHT),
    w: Math.max(1, Math.round(widget.w / columnWidth)),
    h: Math.max(1, Math.round(widget.h / HOME_GRID_CELL_HEIGHT)),
  });
}

function migrateLegacyWidget(widget: HomeWidget): HomeWidget {
  const columnWidth = 100;
  const columnGap = 14;
  const rowHeight = 88;
  const rowGap = 14;
  const width = Math.max(1, Math.round(widget.w));
  const height = Math.max(1, Math.round(widget.h));

  return migratePixelWidget({
    id: widget.id,
    instanceId: widget.instanceId,
    config: widget.config,
    x: HOME_CANVAS_PADDING + Math.round(widget.x) * (columnWidth + columnGap),
    y: HOME_CANVAS_PADDING + Math.round(widget.y) * (rowHeight + rowGap),
    w: width * columnWidth + (width - 1) * columnGap,
    h: height * rowHeight + (height - 1) * rowGap,
  });
}
