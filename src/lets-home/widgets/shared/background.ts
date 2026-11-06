import type { HomeWidgetConfig } from "../../config";

export const DEFAULT_SOLID_BACKGROUND = "#ffffff";
export const DEFAULT_GRADIENT_BACKGROUND =
  "linear-gradient(135deg, #26313d 0%, #101820 100%)";

const CSS_BLEND_MODES = new Set([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

function getSafeBackgroundValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && !/[;{}]/.test(normalized) ? normalized : undefined;
}

function getSafeBlendMode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const modes = normalized.split(",").map((mode) => mode.trim());
  return modes.every((mode) => CSS_BLEND_MODES.has(mode))
    ? modes.join(", ")
    : undefined;
}

export function getWidgetBackgroundValue(
  config?: HomeWidgetConfig,
): string | undefined {
  const background = config?.background;
  if (!background || background.mode === "default") {
    return undefined;
  }

  return background.mode === "solid"
    ? getSafeBackgroundValue(background.color)
    : getSafeBackgroundValue(background.gradient);
}

export function getWidgetBackgroundBlendMode(
  config?: HomeWidgetConfig,
): string | undefined {
  const background = config?.background;
  if (!background || background.mode !== "gradient") {
    return undefined;
  }

  return getSafeBlendMode(background.blendMode);
}
