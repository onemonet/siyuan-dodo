import { DEFAULT_DRAWING_INITIAL_STYLE, normalizeDrawingStyle } from "./drawing-style";

export const MAX_PINNED_TOOLS = 30;

export const toolbarDefaults = {
  toolbarEnabled: true,
  toolbarMode: "follow" as "follow" | "fixed",
  toolbarShowLabels: false,
  toolbarPinnedIds: ["focus-selection", "align", "arrange", "shape-switch", "boolean", "edit-svg"] as string[],
  toolbarPosition: null as { left: number; top: number } | null,
  interactionEnabled: {} as Record<string, boolean>,
  drawingInitialStyle: { ...DEFAULT_DRAWING_INITIAL_STYLE },
};

export function normalizeToolbarPreferences(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, any> : {};
  const position = input.toolbarPosition;
  // One-time preference migration: the retired SVG engine may have been
  // explicitly enabled while the native mind map was disabled. Restore B as
  // the active editor and discard the obsolete setting key.
  const oldEnabled = input.interactionEnabled && typeof input.interactionEnabled === "object"
    ? input.interactionEnabled as Record<string, unknown> : {};
  const enabled = Object.fromEntries(Object.entries(oldEnabled)
    .filter(([key, value]) => key !== "plaitMindMap" && key.length < 100 && typeof value === "boolean")) as Record<string, boolean>;
  if (oldEnabled.plaitMindMap === true) enabled.mindMap = true;
  return {
    toolbarEnabled: typeof input.toolbarEnabled === "boolean" ? input.toolbarEnabled : true,
    toolbarMode: input.toolbarMode === "fixed" ? "fixed" as const : "follow" as const,
    toolbarShowLabels: input.toolbarShowLabels === true,
    // Preserve IDs for tools that have not been migrated yet.
    toolbarPinnedIds: Array.isArray(input.toolbarPinnedIds)
      ? [...new Set(input.toolbarPinnedIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 100).map(id => id === "align-left" ? "align" : id))].slice(0, MAX_PINNED_TOOLS)
      : [...toolbarDefaults.toolbarPinnedIds],
    toolbarPosition: position && typeof position.left === "number" && typeof position.top === "number"
      && Number.isFinite(position.left) && Number.isFinite(position.top)
      ? { left: Math.max(0, position.left), top: Math.max(0, position.top) } : null,
    interactionEnabled: enabled,
    drawingInitialStyle: {
      ...DEFAULT_DRAWING_INITIAL_STYLE,
      ...normalizeDrawingStyle(input.drawingInitialStyle),
    },
  };
}

export type ToolbarPreferences = ReturnType<typeof normalizeToolbarPreferences>;

export function toolbarPatch(value: unknown): Partial<ToolbarPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("工具栏设置格式无效。");
  const normalized = normalizeToolbarPreferences(value);
  return Object.fromEntries(Object.keys(toolbarDefaults).filter(key => Object.prototype.hasOwnProperty.call(value, key)).map(key => [key, normalized[key]]));
}
