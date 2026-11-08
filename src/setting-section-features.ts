/**
 * Module-level checkboxes have been replaced with SiYuan-style section
 * headings. These subfeatures are available whenever their parent plugin is
 * enabled; keep legacy false values from silently disabling hidden features.
 *
 * These are NOT per-feature options such as map-search-enabled, which must
 * remain independently configurable.
 */
export const ALWAYS_ON_SECTION_FLAGS: Readonly<Record<string, readonly string[]>> = {
  "custom-block": ["math-enabled", "toggle-enabled", "sql-enabled", "gallery-enabled"],
  "database-view": [
    "custom-view-enabled", "map-view-enabled", "chart-view-enabled",
    "gantt-view-enabled", "calendar-view-enabled", "timeline-view-enabled",
  ],
};

const GROUP_TO_SPACE: Readonly<Record<string, string>> = {
  "自定义块": "custom-block",
  "数据库视图": "database-view",
};

export function isSectionActivationItem(group: string, key: string): boolean {
  const space = GROUP_TO_SPACE[group];
  return Boolean(space && ALWAYS_ON_SECTION_FLAGS[space]?.includes(key));
}