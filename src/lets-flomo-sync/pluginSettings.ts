import type { PluginSettingItem } from "@/types/plugin";
import {
  ACCOUNT_SETTINGS,
  CONTENT_SETTINGS,
  DASHBOARD_SETTINGS,
  FEATURE_SETTINGS,
  LOCATION_SETTINGS,
  TAG_FILTER_SETTINGS,
} from "./pluginSettingGroups";

export function createFlomoPluginSettings(): PluginSettingItem[] {
  return [
    ...ACCOUNT_SETTINGS,
    ...LOCATION_SETTINGS,
    ...TAG_FILTER_SETTINGS,
    ...CONTENT_SETTINGS,
    ...FEATURE_SETTINGS,
    ...DASHBOARD_SETTINGS,
  ];
}
