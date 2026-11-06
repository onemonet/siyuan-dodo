import type { ToolbarPreferences } from "../../toolbar-preferences";
import type { SelectionContext, ToolbarTool } from "./types";

export function partitionTools(tools: readonly ToolbarTool[], context: SelectionContext, pinnedIds: readonly string[]) {
  const available = tools.filter(tool => (!tool.when || tool.when(context)) && (!tool.items || tool.items.some(item => !item.when || item.when(context))));
  const byId = new Map(available.map(tool => [tool.id, tool]));
  const pinned = [...new Set(pinnedIds)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const pinnedSet = new Set(pinnedIds);
  return { pinned, more: available.filter(tool => !pinnedSet.has(tool.id)) };
}

export function placeToolbar(bounds: { left: number; right: number; top: number; bottom: number } | null,
  size: { width: number; height: number }, viewport: { width: number; height: number }, preferences: ToolbarPreferences) {
  // Excalidraw draws its rotate handle above the selection (about 28-40px).
  // Leave breathing room so the toolbar never blocks the handle.
  const margin = 8, gap = 56;
  let left = preferences.toolbarPosition?.left ?? 16;
  let top = preferences.toolbarPosition?.top ?? 64;
  if (preferences.toolbarMode === "follow" && bounds) {
    left = (bounds.left + bounds.right - size.width) / 2;
    top = bounds.top - size.height - gap;
    if (top < margin) top = bounds.bottom + gap;
  }
  return {
    left: Math.max(margin, Math.min(left, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - size.height - margin)),
  };
}

export function selectionKey(context: SelectionContext) {
  return context.elements.map(element => element.id).sort().join("|");
}
