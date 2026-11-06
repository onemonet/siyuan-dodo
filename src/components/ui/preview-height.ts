/** Shared preview heights for map and timeline; medium matches the old 520px default. */
export const PREVIEW_HEIGHT_PRESETS = [
  { label: "小", value: 320 },
  { label: "中", value: 520 },
  { label: "大", value: 720 },
  { label: "特大", value: 960 },
] as const;

export const DEFAULT_PREVIEW_HEIGHT = 520;

/** Keep legacy custom pixel values until the user explicitly selects a preset. */
export function normalizePreviewHeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(1200, Math.max(320, Math.round(value)))
    : DEFAULT_PREVIEW_HEIGHT;
}

/** Find the nearest visible preset for legacy saved heights. */
export function heightPresetValue(value: unknown): number {
  const height = normalizePreviewHeight(value);
  return PREVIEW_HEIGHT_PRESETS.reduce((best, item) =>
    Math.abs(item.value - height) < Math.abs(best - height) ? item.value : best,
  DEFAULT_PREVIEW_HEIGHT);
}

/** Only preset values are accepted from the settings dropdown. */
export function isPreviewHeightPreset(value: number): boolean {
  return PREVIEW_HEIGHT_PRESETS.some(option => option.value === value);
}