import { settings } from "@/settings";
import {
  FLOMO_DEFAULT_TIME_FORMAT,
} from "../../config/constants";
import {
  createDefaultFlomoConfig,
  FLOMO_PLUGIN_NAME,
} from "../config";
import type { FlomoConfig } from "../types";
import type { ReviewTimeRange } from "../utils/sql";

const DAILY_REVIEW_COUNT_SETTING_KEY = "reviewCount";
const DAILY_REVIEW_TIME_RANGE_SETTING_KEY = "reviewTimeRange";
const DAILY_REVIEW_COUNT_OPTIONS = [4, 8, 12, 16, 20, 24] as const;
const DAILY_REVIEW_TIME_RANGE_OPTIONS = [
  "all",
  "1year",
  "6months",
  "3months",
  "1month",
] as const satisfies readonly ReviewTimeRange[];
const DEFAULT_DAILY_REVIEW_CONFIG = {
  count: 8,
  timeRange: "6months" as ReviewTimeRange,
} as const;

export interface DailyReviewConfig {
  count: number;
  timeRange: ReviewTimeRange;
}

export class FlomoConfigStore {
  constructor(private readonly settingsSpace: string = FLOMO_PLUGIN_NAME) {}

  getConfig(): FlomoConfig {
    const defaults = createDefaultFlomoConfig();

    return {
      username: this.getText("username", defaults.username),
      password: this.getText("password", defaults.password),
      accessToken: this.getText("accessToken", defaults.accessToken),
      accountAuthStatus: this.getAccountAuthStatus(defaults.accountAuthStatus),
      accountAuthMessage: this.getText(
        "accountAuthMessage",
        defaults.accountAuthMessage,
      ),
      accountAuthCheckedAt: this.getText(
        "accountAuthCheckedAt",
        defaults.accountAuthCheckedAt,
      ),
      lastSyncTime: this.getText("lastSyncTime", defaults.lastSyncTime),
      syncSuccessTag: this.getText("syncSuccessTag", defaults.syncSuccessTag),
      locationMode: this.getLocationMode(defaults.locationMode),
      dailnoteNotebook: this.getText(
        "dailnoteNotebook",
        defaults.dailnoteNotebook,
      ),
      pageId: this.getText("pageId", defaults.pageId),
      syncTagMode: this.getSyncTagMode(defaults.syncTagMode),
      syncIncludeTags: this.getText(
        "syncIncludeTags",
        defaults.syncIncludeTags,
      ),
      syncExcludeTags: this.getText(
        "syncExcludeTags",
        defaults.syncExcludeTags,
      ),
      contentTemplate: this.getText(
        "contentTemplate",
        defaults.contentTemplate,
      ),
      timeFormat: this.getText("timeFormat", defaults.timeFormat),
      showMemoDate: this.getBoolean("showMemoDate", defaults.showMemoDate),
      memosSort: this.getMemosSort(defaults.memosSort),
      debugMode: this.getBoolean("debugMode", defaults.debugMode),
      enableQuickNote: this.getBoolean(
        "enableQuickNote",
        defaults.enableQuickNote,
      ),
      enableSilentSync: this.getBoolean(
        "enableSilentSync",
        defaults.enableSilentSync,
      ),
      showManualSyncMenu: this.getBoolean(
        "showManualSyncMenu",
        defaults.showManualSyncMenu,
      ),
    };
  }

  async saveConfig(config: Partial<FlomoConfig>): Promise<void> {
    for (const key of Object.keys(config) as Array<keyof FlomoConfig>) {
      settings.setBySpace(this.settingsSpace, key, config[key]);
    }

    await settings.save();
  }

  getMemoTimeFormat(): string {
    return this.getText("timeFormat", FLOMO_DEFAULT_TIME_FORMAT);
  }

  getDashboardBlockId(): string {
    const value = settings.getBySpace(this.settingsSpace, "dashboardBlockId");
    return typeof value === "string" ? value.trim() : "";
  }

  getDailyReviewConfig(): DailyReviewConfig {
    const savedCount = settings.getBySpace(
      this.settingsSpace,
      DAILY_REVIEW_COUNT_SETTING_KEY,
    );
    const savedTimeRange = settings.getBySpace(
      this.settingsSpace,
      DAILY_REVIEW_TIME_RANGE_SETTING_KEY,
    );

    return {
      count: this.resolveDailyReviewCount(savedCount),
      timeRange: this.resolveDailyReviewTimeRange(savedTimeRange),
    };
  }

  async setDailyReviewConfig(
    config: DailyReviewConfig,
  ): Promise<DailyReviewConfig> {
    const nextConfig = {
      count: this.resolveDailyReviewCount(config.count),
      timeRange: this.resolveDailyReviewTimeRange(config.timeRange),
    };

    settings.setBySpace(
      this.settingsSpace,
      DAILY_REVIEW_COUNT_SETTING_KEY,
      String(nextConfig.count),
    );
    settings.setBySpace(
      this.settingsSpace,
      DAILY_REVIEW_TIME_RANGE_SETTING_KEY,
      nextConfig.timeRange,
    );
    await settings.save();

    return nextConfig;
  }

  private getText(key: keyof FlomoConfig, fallback: string): string {
    const value = settings.getBySpace(this.settingsSpace, key);
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private getBoolean(key: keyof FlomoConfig, fallback: boolean): boolean {
    const value = settings.getBySpace(this.settingsSpace, key);
    return typeof value === "boolean" ? value : fallback;
  }

  private getLocationMode(fallback: FlomoConfig["locationMode"]) {
    const value = settings.getBySpace(this.settingsSpace, "locationMode");
    return value === "0" || value === "1" ? value : fallback;
  }

  private getSyncTagMode(fallback: FlomoConfig["syncTagMode"]) {
    const value = settings.getBySpace(this.settingsSpace, "syncTagMode");
    return value === "0" || value === "1" ? value : fallback;
  }

  private getMemosSort(fallback: FlomoConfig["memosSort"]) {
    const value = settings.getBySpace(this.settingsSpace, "memosSort");
    return value === "asc" || value === "desc" ? value : fallback;
  }

  private getAccountAuthStatus(fallback: FlomoConfig["accountAuthStatus"]) {
    const value = settings.getBySpace(this.settingsSpace, "accountAuthStatus");
    return value === "unknown" || value === "success" || value === "error"
      ? value
      : fallback;
  }

  private resolveDailyReviewCount(value: unknown): number {
    const parsedValue = Number(value);
    return DAILY_REVIEW_COUNT_OPTIONS.includes(
      parsedValue as (typeof DAILY_REVIEW_COUNT_OPTIONS)[number],
    )
      ? parsedValue
      : DEFAULT_DAILY_REVIEW_CONFIG.count;
  }

  private resolveDailyReviewTimeRange(value: unknown): ReviewTimeRange {
    return typeof value === "string" &&
      DAILY_REVIEW_TIME_RANGE_OPTIONS.includes(value as ReviewTimeRange)
      ? (value as ReviewTimeRange)
      : DEFAULT_DAILY_REVIEW_CONFIG.timeRange;
  }
}
