/** Cross-device drawing initialization lives in SiYuan plugin preferences.
 * Browser-local "last used" drawing defaults use a separate localStorage key.
 * None of these keys alter the elements already persisted in a scene.
 */
export const DRAWING_STYLE_KEYS = [
  "currentItemStrokeWidth", "currentItemStrokeStyle", "currentItemRoughness",
  "currentItemFillStyle", "currentItemStrokeColor", "currentItemBackgroundColor",
  "currentItemOpacity", "currentItemRoundness", "currentItemFontFamily",
  "currentItemFontSize", "currentItemTextAlign", "currentItemStartArrowhead",
  "currentItemEndArrowhead",
] as const;

export type DrawingStyle = Partial<Record<typeof DRAWING_STYLE_KEYS[number], unknown>>;

// These two fixed, clean defaults apply even before a custom style is saved.
export const DEFAULT_DRAWING_INITIAL_STYLE: DrawingStyle = {
  currentItemRoughness: 0,
  currentItemRoundness: null,
};

const integer = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const number = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const color = (value: unknown) =>
  typeof value === "string" && (/^#[0-9a-f]{6}$/i.test(value) || value === "transparent");
const arrowhead = (value: unknown) =>
  value === null || typeof value === "string" && value.length <= 40 && /^[a-z_]+$/.test(value);

export function normalizeDrawingStyle(input: unknown): DrawingStyle {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: DrawingStyle = {};
  const put = (key: keyof DrawingStyle, ok: boolean, value: unknown) => {
    if (ok) result[key] = value;
  };
  put("currentItemStrokeWidth", number(source.currentItemStrokeWidth, 0.5, 50), source.currentItemStrokeWidth);
  put("currentItemStrokeStyle", ["solid", "dashed", "dotted"].includes(String(source.currentItemStrokeStyle)), source.currentItemStrokeStyle);
  put("currentItemRoughness", number(source.currentItemRoughness, 0, 10), source.currentItemRoughness);
  put("currentItemFillStyle", ["solid", "hachure", "cross-hatch", "zigzag"].includes(String(source.currentItemFillStyle)), source.currentItemFillStyle);
  put("currentItemStrokeColor", color(source.currentItemStrokeColor), source.currentItemStrokeColor);
  put("currentItemBackgroundColor", color(source.currentItemBackgroundColor), source.currentItemBackgroundColor);
  put("currentItemOpacity", number(source.currentItemOpacity, 0, 100), source.currentItemOpacity);
  if (source.currentItemRoundness === null) result.currentItemRoundness = null;
  else if (source.currentItemRoundness && typeof source.currentItemRoundness === "object" &&
    !Array.isArray(source.currentItemRoundness) &&
    integer((source.currentItemRoundness as Record<string, unknown>).type, 1, 3)) {
    result.currentItemRoundness = {type:(source.currentItemRoundness as Record<string, number>).type};
  }
  put("currentItemFontFamily", integer(source.currentItemFontFamily, 1, 100), source.currentItemFontFamily);
  put("currentItemFontSize", number(source.currentItemFontSize, 1, 500), source.currentItemFontSize);
  put("currentItemTextAlign", ["left", "center", "right"].includes(String(source.currentItemTextAlign)), source.currentItemTextAlign);
  put("currentItemStartArrowhead", arrowhead(source.currentItemStartArrowhead), source.currentItemStartArrowhead);
  put("currentItemEndArrowhead", arrowhead(source.currentItemEndArrowhead), source.currentItemEndArrowhead);
  return result;
}

/** Capture current drawing-tool defaults (not selected element properties). */
export function captureCurrentDrawingStyle(appState: Record<string, unknown>): DrawingStyle {
  return normalizeDrawingStyle(
    Object.fromEntries(DRAWING_STYLE_KEYS.filter(key => key in appState)
      .map(key => [key, appState[key]]))
  );
}
