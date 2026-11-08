import {
  buildSettingSections,
  type SettingItem,
  type SettingSection,
} from "./setting-schema";
import { isSectionActivationItem } from "./setting-section-features";

/** These database views must remain discoverable even without global fields. */
export const DATABASE_VIEW_SECTION_TITLES = [
  "地图视图",
  "图表视图",
  "甘特视图",
  "日历视图",
  "时间线视图",
  "AI 自定义视图",
] as const;

export interface SettingsSearchResult<T extends SettingItem = SettingItem> {
  group: string;
  label: string;
  sections: SettingSection<T>[];
}

export function getSettingsSections<T extends SettingItem>(
  group: string,
  items: T[] = [],
): SettingSection<T>[] {
  const sections = buildSettingSections(items);
  if (group !== "数据库视图") return sections;
  const byTitle = new Map(sections.map(section => [section.title, section]));
  const orderedViews = DATABASE_VIEW_SECTION_TITLES.map(
    title => byTitle.get(title) ?? {
      key: title,
      title,
      items: [] as T[],
    },
  );
  // AI app management is always the last section, including when another
  // database setting section is added later.
  return [
    ...orderedViews.slice(0, -1),
    ...sections.filter(section =>
      !DATABASE_VIEW_SECTION_TITLES.some(title => title === section.title)),
    orderedViews[orderedViews.length - 1],
  ];
}

/** Index labels and explanatory copy, never user-entered values/credentials. */
function searchable(text: string | undefined): string {
  return (text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|ensp|emsp);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function includesAllTokens(text: string, tokens: string[]): boolean {
  const haystack = searchable(text);
  return tokens.every(token => haystack.includes(token));
}

/** Search every available setting; sidebar and right pane share the results. */
export function searchSettingsGroups<T extends SettingItem>(
  groups: string[],
  settings: Record<string, T[]>,
  query: string,
  groupLabel: (group: string) => string,
): SettingsSearchResult<T>[] {
  const tokens = searchable(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];

  const results: SettingsSearchResult<T>[] = [];
  for (const group of groups) {
    const label = groupLabel(group);
    const groupMatch = includesAllTokens(group + " " + label, tokens);
    const sections: SettingSection<T>[] = [];
    for (const section of getSettingsSections(group, settings[group] ?? [])) {
      const sectionText = section.title + " " + (section.description ?? "");
      const sectionMatch = section.title !== "" &&
        includesAllTokens(sectionText, tokens);
      const available = section.items.filter(
        item => !isSectionActivationItem(group, item.key),
      );
      const matched = groupMatch || sectionMatch
        ? available
        : available.filter(item => includesAllTokens(
          group + " " + label + " " + sectionText + " " +
          item.title + " " + (item.description ?? ""),
          tokens,
        ));
      if (groupMatch || sectionMatch || matched.length > 0) {
        sections.push({ ...section, items: matched });
      }
    }
    if (sections.length > 0) results.push({ group, label, sections });
  }
  return results;
}