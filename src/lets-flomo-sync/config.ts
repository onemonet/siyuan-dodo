import moment from "moment";
import { FLOMO_DEFAULT_TIME_FORMAT } from "../config/constants";
import type { FlomoConfig } from "./types";

export const FLOMO_PLUGIN_NAME = "flomo-sync";
export const FLOMO_DASHBOARD_TAB_TYPE = "flomo-dashboard";
export const FLOMO_DASHBOARD_TAB_TITLE = "Flomo 仪表盘";
export const FLOMO_DEFAULT_CONTENT_TEMPLATE = "> ${time} \n\n> ${content}";
export const FLOMO_UPDATED_MEMOS_PAGE_SIZE = "200";

export function getDefaultLastSyncTime(): string {
  return moment().format("YYYY-MM-DD 00:00:00");
}

export function createDefaultFlomoConfig(): FlomoConfig {
  return {
    username: "",
    password: "",
    accessToken: "",
    accountAuthStatus: "unknown",
    accountAuthMessage: "",
    accountAuthCheckedAt: "",
    lastSyncTime: getDefaultLastSyncTime(),
    syncSuccessTag: "",
    locationMode: "0",
    dailnoteNotebook: "",
    pageId: "",
    syncTagMode: "0",
    syncIncludeTags: "",
    syncExcludeTags: "",
    contentTemplate: FLOMO_DEFAULT_CONTENT_TEMPLATE,
    timeFormat: FLOMO_DEFAULT_TIME_FORMAT,
    showMemoDate: false,
    memosSort: "asc",
    debugMode: false,
    enableQuickNote: true,
    enableSilentSync: false,
    showManualSyncMenu: true,
  };
}
