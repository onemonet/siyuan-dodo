import { FLOMO_DEFAULT_LAYOUT } from "../../config/constants";
import type { DashboardLayout } from "../types";

export const FLOMO_MEMO_LIST_GAP = 12;
export const FLOMO_MEMO_LIST_MASONRY_MIN_COLUMN_WIDTH = 280;

const MEMO_LIST_LAYOUT_CLASSES: Record<DashboardLayout, string> = {
  list: "memo-list--list",
  card: "memo-list--card",
  masonry: "memo-list--masonry",
};

export function resolveMemoListLayout(
  value: DashboardLayout | string,
): DashboardLayout {
  if (value === "card" || value === "masonry") {
    return value;
  }

  return FLOMO_DEFAULT_LAYOUT;
}

export function getMemoListLayoutClassName(layout: DashboardLayout): string {
  return MEMO_LIST_LAYOUT_CLASSES[layout];
}

export function isMasonryMemoListLayout(layout: DashboardLayout): boolean {
  return layout === "masonry";
}

export function resolveMasonryColumnCount(
  containerWidth: number,
  minColumnWidth = FLOMO_MEMO_LIST_MASONRY_MIN_COLUMN_WIDTH,
  gap = FLOMO_MEMO_LIST_GAP,
): number {
  if (containerWidth <= 0) {
    return 1;
  }

  const columnUnit = minColumnWidth + gap;
  return Math.max(1, Math.floor((containerWidth + gap) / columnUnit));
}

export function buildMemoMasonryColumns<Item>(
  sourceItems: Item[],
  columnCount: number,
): Item[][] {
  const safeColumnCount = Math.max(1, columnCount);
  const columns = Array.from({ length: safeColumnCount }, () => [] as Item[]);

  sourceItems.forEach((item, index) => {
    const columnIndex = index % safeColumnCount;
    columns[columnIndex].push(item);
  });

  return columns;
}
