import type { MemoFilter } from "./sql";

export type TagMode = "include_and" | "include_or" | "exclude";

export interface TagCloudItem {
  name: string;
  count: number;
}

export const TAG_CLOUD_VISIBLE_LIMIT = 20;

export function buildTagCloudFilterKey(filter: MemoFilter): string {
  return JSON.stringify({
    dateMode: filter.dateMode,
    recentDays: filter.recentDays,
    day: filter.day,
    rangeStart: filter.rangeStart,
    rangeEnd: filter.rangeEnd,
    keyword: filter.keyword,
    tagMode: filter.tagMode,
    tags: filter.tags,
    orderBy: filter.orderBy,
    limit: filter.limit,
  });
}

export function getVisibleTagItems(
  tagItems: TagCloudItem[],
  expanded: boolean,
  visibleLimit = TAG_CLOUD_VISIBLE_LIMIT,
): TagCloudItem[] {
  return expanded ? tagItems : tagItems.slice(0, visibleLimit);
}

export function toggleSelectedTag(
  selectedTags: string[],
  tagName: string,
): string[] {
  const hasSelectedTag = selectedTags.includes(tagName);
  if (hasSelectedTag) {
    return selectedTags.filter((item) => item !== tagName);
  }

  return [...selectedTags, tagName];
}
