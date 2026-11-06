import { FLOMO_DEFAULT_SEARCH_LIMIT } from "../../config/constants";
import {
  buildDailyReviewStatement,
  DEFAULT_DAILY_REVIEW_COUNT,
  DEFAULT_DAILY_REVIEW_TIME_RANGE,
  parseDailyReviewCount,
  parseDailyReviewTimeRange,
} from "./dailyReview";
import {
  buildDayFilter,
  buildRangeFilter,
  clearDateFilter,
  getMonthRange,
  toDashedDate,
} from "./dashboard";
import { DASHBOARD_TABS, type DashboardTab } from "./dashboardTabs";
import {
  buildCustomMemoSQL,
  buildMemoSQL,
  validateReadonlyMemoSQL,
  type MemoFilter,
  type ReviewTimeRange,
} from "./sql";

export interface DashboardState {
  activeTab: DashboardTab;
  isFilterExpanded: boolean;
  isReviewSettingsExpanded: boolean;
  isStatsSettingsExpanded: boolean;
  heatmapExpanded: boolean;
  filter: MemoFilter;
  customSQL: string | null;
  reviewSaveError: string;
  reviewRefreshVersion: number;
  reviewCount: number;
  reviewTimeRange: ReviewTimeRange;
  statsYear: number;
  currentStatsYear: number;
}

export interface DashboardDerivedState {
  customSQLError: string;
  finalSQL: string;
  reviewSQL: string;
  selectedDay: string;
  selectedRangeStart: string;
  selectedRangeEnd: string;
  isAnySettingsExpanded: boolean;
}

export interface DashboardReviewConfig {
  count?: unknown;
  timeRange?: unknown;
}

export function createDefaultMemoFilter(): MemoFilter {
  return {
    dateMode: "all",
    tagMode: "all",
    orderBy: "desc",
    limit: FLOMO_DEFAULT_SEARCH_LIMIT,
    keyword: "",
  };
}

export function createDashboardState(now: Date = new Date()): DashboardState {
  const currentStatsYear = now.getFullYear();

  return {
    activeTab: DASHBOARD_TABS.main,
    isFilterExpanded: false,
    isReviewSettingsExpanded: false,
    isStatsSettingsExpanded: false,
    heatmapExpanded: false,
    filter: createDefaultMemoFilter(),
    customSQL: null,
    reviewSaveError: "",
    reviewRefreshVersion: 0,
    reviewCount: DEFAULT_DAILY_REVIEW_COUNT,
    reviewTimeRange: DEFAULT_DAILY_REVIEW_TIME_RANGE,
    statsYear: currentStatsYear,
    currentStatsYear,
  };
}

export function deriveDashboardState(state: DashboardState): DashboardDerivedState {
  const customSQLError = state.customSQL
    ? validateReadonlyMemoSQL(state.customSQL) || ""
    : "";
  const finalSQL = state.customSQL
    ? customSQLError
      ? ""
      : buildCustomMemoSQL(state.customSQL, state.filter.limit)
    : buildMemoSQL(state.filter);

  return {
    customSQLError,
    finalSQL,
    reviewSQL: buildDailyReviewStatement(
      state.reviewCount,
      state.reviewTimeRange,
      state.reviewRefreshVersion,
    ),
    selectedDay: state.filter.dateMode === "day" ? toDashedDate(state.filter.day) : "",
    selectedRangeStart:
      state.filter.dateMode === "range" ? toDashedDate(state.filter.rangeStart) : "",
    selectedRangeEnd:
      state.filter.dateMode === "range" ? toDashedDate(state.filter.rangeEnd) : "",
    isAnySettingsExpanded:
      state.isFilterExpanded ||
      state.isReviewSettingsExpanded ||
      state.isStatsSettingsExpanded,
  };
}

export function selectDashboardTab(
  state: DashboardState,
  activeTab: DashboardTab,
): DashboardState {
  return {
    ...state,
    activeTab,
    isFilterExpanded: false,
    isReviewSettingsExpanded: false,
    isStatsSettingsExpanded: false,
  };
}

export function setFilter(state: DashboardState, filter: MemoFilter): DashboardState {
  return {
    ...state,
    filter: { ...filter },
  };
}

export function setCustomSQL(state: DashboardState, sql: string | null | undefined): DashboardState {
  const nextSQL = sql?.trim();
  return {
    ...state,
    customSQL: nextSQL ? nextSQL : null,
  };
}

export function setDashboardExpandedState(
  state: DashboardState,
  key: "isFilterExpanded" | "isReviewSettingsExpanded" | "isStatsSettingsExpanded",
  expanded: boolean,
): DashboardState {
  return {
    ...state,
    [key]: expanded,
  };
}

export function setStatsYear(state: DashboardState, year: number): DashboardState {
  const nextYear = Math.floor(year);
  if (!Number.isFinite(nextYear) || nextYear > state.currentStatsYear) {
    return state;
  }

  return {
    ...state,
    statsYear: nextYear,
  };
}

export function toggleDashboardHeatmap(state: DashboardState): DashboardState {
  const heatmapExpanded = !state.heatmapExpanded;

  return {
    ...state,
    heatmapExpanded,
    filter: heatmapExpanded ? state.filter : clearDateFilter(state.filter),
  };
}

export function applyHeatmapDaySelection(
  state: DashboardState,
  selection: {
    dayKey?: string;
    rangeStart?: string;
    rangeEnd?: string;
  },
): DashboardState {
  const { dayKey, rangeStart, rangeEnd } = selection;

  if (rangeStart && rangeEnd) {
    return {
      ...state,
      filter: buildRangeFilter(state.filter, rangeStart, rangeEnd),
    };
  }

  if (dayKey) {
    return {
      ...state,
      filter: buildDayFilter(state.filter, dayKey),
    };
  }

  return {
    ...state,
    filter: clearDateFilter(state.filter),
  };
}

export function showStatsDayInMain(
  state: DashboardState,
  dayKey: string,
): DashboardState {
  return {
    ...state,
    activeTab: DASHBOARD_TABS.main,
    filter: buildDayFilter(state.filter, dayKey),
  };
}

export function showStatsMonthInMain(
  state: DashboardState,
  year: number,
  month: number,
): DashboardState {
  const monthRange = getMonthRange(year, month);
  return {
    ...state,
    activeTab: DASHBOARD_TABS.main,
    filter: buildRangeFilter(state.filter, monthRange.start, monthRange.end),
  };
}

export function applyReviewConfigToState(
  state: DashboardState,
  config: DashboardReviewConfig | null | undefined,
  options: { refresh?: boolean; saveError?: string } = {},
): DashboardState {
  return {
    ...state,
    reviewCount: parseDailyReviewCount(config?.count),
    reviewTimeRange: parseDailyReviewTimeRange(config?.timeRange),
    reviewSaveError: options.saveError ?? state.reviewSaveError,
    reviewRefreshVersion: options.refresh
      ? state.reviewRefreshVersion + 1
      : state.reviewRefreshVersion,
  };
}

export function setReviewCount(
  state: DashboardState,
  count: unknown,
  options: { refresh?: boolean; saveError?: string } = {},
): DashboardState {
  return {
    ...state,
    reviewCount: parseDailyReviewCount(count),
    reviewSaveError: options.saveError ?? state.reviewSaveError,
    reviewRefreshVersion: options.refresh
      ? state.reviewRefreshVersion + 1
      : state.reviewRefreshVersion,
  };
}

export function setReviewTimeRange(
  state: DashboardState,
  timeRange: unknown,
  options: { refresh?: boolean; saveError?: string } = {},
): DashboardState {
  return {
    ...state,
    reviewTimeRange: parseDailyReviewTimeRange(timeRange),
    reviewSaveError: options.saveError ?? state.reviewSaveError,
    reviewRefreshVersion: options.refresh
      ? state.reviewRefreshVersion + 1
      : state.reviewRefreshVersion,
  };
}

export function rerollDailyReview(state: DashboardState): DashboardState {
  return {
    ...state,
    reviewSaveError: "",
    reviewRefreshVersion: state.reviewRefreshVersion + 1,
  };
}
