export const FLOMO_MEMO_ATTR = "custom-dodo-memo";
export const FLOMO_MEMO_SLUG_ATTR = "custom-dodo-flomo-slug";
export const DODO_SHARE_ATTR = "custom-dodo-share";
export const FLOMO_SUPPORTED_LAYOUTS = ["list", "card", "masonry"] as const;
export const FLOMO_DEFAULT_LAYOUT = FLOMO_SUPPORTED_LAYOUTS[0];
export const FLOMO_DEFAULT_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
export const FLOMO_DASHBOARD_LIMIT_OPTIONS = [64, 128, 256, 512, 1024] as const;
export const FLOMO_DEFAULT_SEARCH_LIMIT = FLOMO_DASHBOARD_LIMIT_OPTIONS[2];
export const FLOMO_MAX_MEMO_LIMIT =
  FLOMO_DASHBOARD_LIMIT_OPTIONS[FLOMO_DASHBOARD_LIMIT_OPTIONS.length - 1];
export const FLOMO_LIST_PAGE_SIZE = 20;
export const FLOMO_LIST_LOAD_MORE_ROOT_MARGIN = "240px";
export const FLOMO_MEMO_PREVIEW_LENGTH = 180;
export const FLOMO_TAG_MATCH_REGEX = /#([^#]+)#/g;
export const FLOMO_QUERY_ERROR_PREFIX = "FlomoMemoQuery";
