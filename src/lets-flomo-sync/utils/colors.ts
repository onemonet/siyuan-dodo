export const FLOMO_HEAT_COLORS = [
  "#EFEFEF",
  "#DEF0E4",
  "#B5E0C6",
  "#7DCC9E",
  "#4EA87A",
  "#2E8B57",
] as const;

export const FLOMO_ACCENT_COLOR = FLOMO_HEAT_COLORS[5];
export const FLOMO_ACCENT_MUTED = FLOMO_HEAT_COLORS[4];
export const FLOMO_ACCENT_SOFT = FLOMO_HEAT_COLORS[1];
export const FLOMO_ACCENT_SURFACE = FLOMO_HEAT_COLORS[2];
export const FLOMO_ACCENT_CONTRAST = "#FFFFFF";

export const FLOMO_DASHBOARD_COLOR_VARS = [
  `--flomo-heat-0:${FLOMO_HEAT_COLORS[0]}`,
  `--flomo-heat-1:${FLOMO_HEAT_COLORS[1]}`,
  `--flomo-heat-2:${FLOMO_HEAT_COLORS[2]}`,
  `--flomo-heat-3:${FLOMO_HEAT_COLORS[3]}`,
  `--flomo-heat-4:${FLOMO_HEAT_COLORS[4]}`,
  `--flomo-heat-5:${FLOMO_HEAT_COLORS[5]}`,
  `--flomo-accent:${FLOMO_ACCENT_COLOR}`,
  `--flomo-accent-muted:${FLOMO_ACCENT_MUTED}`,
  `--flomo-accent-soft:${FLOMO_ACCENT_SOFT}`,
  `--flomo-accent-surface:${FLOMO_ACCENT_SURFACE}`,
  `--flomo-accent-contrast:${FLOMO_ACCENT_CONTRAST}`,
].join(";");

export function getFlomoHeatColor(count: number, maxCount: number): string {
  if (!count || !maxCount) {
    return `var(--flomo-heat-0, ${FLOMO_HEAT_COLORS[0]})`;
  }

  const maxLevel = FLOMO_HEAT_COLORS.length - 1;
  const ratio = Math.max(0, Math.min(1, count / maxCount));
  const level = Math.max(1, Math.min(maxLevel, Math.ceil(ratio * maxLevel)));

  return `var(--flomo-heat-${level}, ${FLOMO_HEAT_COLORS[level]})`;
}
