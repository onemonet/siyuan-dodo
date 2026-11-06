import { settings } from "../settings";
import {
  MAP_AMAP_API2_SETTING_KEY,
  MAP_AMAP_KEY_SETTING_KEY,
  MAP_GOOGLE_KEY_SETTING_KEY,
  MAP_GOOGLE_MAP_ID_SETTING_KEY,
  MAP_PROVIDER_SETTING_KEY,
  MAP_SEARCH_ENABLED_SETTING_KEY,
  MAP_MARKER_BG_SETTING_KEY,
  MAP_MARKER_TEXT_SETTING_KEY,
  normalizeMapGlobalSettings,
} from "./map/map-data";

export const MAP_SETTING_KEYS = [
  MAP_PROVIDER_SETTING_KEY, MAP_AMAP_KEY_SETTING_KEY,
  MAP_GOOGLE_KEY_SETTING_KEY, MAP_GOOGLE_MAP_ID_SETTING_KEY,
  MAP_AMAP_API2_SETTING_KEY, MAP_SEARCH_ENABLED_SETTING_KEY,
  MAP_MARKER_BG_SETTING_KEY, MAP_MARKER_TEXT_SETTING_KEY,
] as const;

export const MAP_GLOBAL_SETTINGS_CHANGED = "dodo:map-global-settings-changed";

/** Prefer the database-view namespace; keep old settings as a legacy fallback. */
function lookup(key: string) {
  return settings.getBySpace("database-view", key) ?? settings.getBySpace("custom-block", key);
}

export function getMapGlobalSettings() {
  return normalizeMapGlobalSettings({
    mapSource: lookup(MAP_PROVIDER_SETTING_KEY),
    amapKey: lookup(MAP_AMAP_KEY_SETTING_KEY),
    googleKey: lookup(MAP_GOOGLE_KEY_SETTING_KEY),
    googleMapId: lookup(MAP_GOOGLE_MAP_ID_SETTING_KEY),
    useAmapApi2: lookup(MAP_AMAP_API2_SETTING_KEY),
    searchEnabled: lookup(MAP_SEARCH_ENABLED_SETTING_KEY),
    markerBackgroundColor: lookup(MAP_MARKER_BG_SETTING_KEY),
    markerTextColor: lookup(MAP_MARKER_TEXT_SETTING_KEY),
  });
}
