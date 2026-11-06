import { getCommonBounds, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";

/** 1NX-inspired drag measurements. This is part of spacingHandles, not a new switch. */
type Rect = { left: number; top: number; right: number; bottom: number };
type Axis = "horizontal" | "vertical";
export type DistanceGuide = {
  axis: Axis; gap: number; from: { x: number; y: number }; to: { x: number; y: number }; referenceId: string;
};
type Reference = Rect & { id: string };
const ROUNDING = 0.001;

/** Return only the closest horizontal and vertical outside distances. The
 * perpendicular projections must overlap, as with 1NX's distance guides. */
export function closestDragDistances(moving: Rect, others: readonly Reference[]): DistanceGuide[] {
  const nearest: Partial<Record<Axis, DistanceGuide>> = {};
  for (const other of others) {
    const commonY1 = Math.max(moving.top, other.top), commonY2 = Math.min(moving.bottom, other.bottom);
    if (commonY2 > commonY1 + ROUNDING) {
      const y = (commonY1 + commonY2) / 2;
      let from = 0, to = 0;
      if (other.right <= moving.left) { from = other.right; to = moving.left; }
      else if (moving.right <= other.left) { from = moving.right; to = other.left; }
      const gap = to - from;
      if (gap > ROUNDING && (!nearest.horizontal || gap < nearest.horizontal.gap))
        nearest.horizontal = { axis: "horizontal", gap, from: { x: from, y }, to: { x: to, y }, referenceId: other.id };
    }
    const commonX1 = Math.max(moving.left, other.left), commonX2 = Math.min(moving.right, other.right);
    if (commonX2 > commonX1 + ROUNDING) {
      const x = (commonX1 + commonX2) / 2;
      let from = 0, to = 0;
      if (other.bottom <= moving.top) { from = other.bottom; to = moving.top; }
      else if (moving.bottom <= other.top) { from = moving.bottom; to = other.top; }
      const gap = to - from;
      if (gap > ROUNDING && (!nearest.vertical || gap < nearest.vertical.gap))
        nearest.vertical = { axis: "vertical", gap, from: { x, y: from }, to: { x, y: to }, referenceId: other.id };
    }
  }
  return [nearest.horizontal, nearest.vertical].filter((guide): guide is DistanceGuide => Boolean(guide));
}

const box = (elements: readonly any[]): Rect | null => {
  if (!elements.length) return null;
  const [left, top, right, bottom] = getCommonBounds(elements as any);
  return [left, top, right, bottom].every(Number.isFinite) ? { left, top, right, bottom } : null;
};
const excluded = new Set(["arrow", "line", "freedraw", "frame", "magicframe"]);
const relevant = (element: any) => !element.isDeleted && !element.containerId && !excluded.has(element.type);

/** Mount onto the existing spacing overlay. Never modifies the scene, captures
 * history, steals pointer events or interferes with Excalidraw native snapping. */
export function mountDragDistanceGuides(api: any, root: HTMLElement): () => void {
  const layer = document.createElement("div");
  layer.className = "dodo-distance-guides";
  layer.setAttribute("aria-label", "拖动元素距离");
  layer.dataset.visible = "false";
  root.append(layer);
  let disposed = false;
  let gesture: { pointerId: number; startX: number; startY: number; x: number; y: number;
    elementIds: string[]; startBounds: Rect | null; initialPositions: Map<string, { x: number; y: number }> } | null = null;
  let frame = 0;
  let signature = "";

  const hide = () => {
    signature = "";
    if (layer.dataset.visible !== "false") layer.replaceChildren();
    layer.dataset.visible = "false";
  };
  const snapshotSelection = (current: NonNullable<typeof gesture>) => {
    const selected = api.getAppState()?.selectedElementIds || {};
    const items = (api.getSceneElements?.() || []).filter((el: any) => selected[el.id] && relevant(el));
    current.elementIds = items.map((el: any) => el.id);
    current.initialPositions = new Map(items.map((el: any) => [el.id, { x: el.x, y: el.y }]));
    current.startBounds = box(items);
  };
  const render = () => {
    if (disposed || !gesture?.startBounds || !gesture.elementIds.length) { hide(); return; }
    const d = gesture;
    if (Math.hypot(d.x - d.startX, d.y - d.startY) < 5) { hide(); return; }
    const state = api.getAppState();
    if (state.activeTool?.type !== "selection" || state.resizingElement || state.editingElement || state.draggingElement && state.draggingElement.type === "selection") {
      hide(); return;
    }
    const selectedIds = new Set(d.elementIds);
    const elements = api.getSceneElements?.() || [];
    const selected = elements.filter((el: any) => selectedIds.has(el.id) && relevant(el));
    if (selected.length !== d.elementIds.length || selected.some((el: any) => !state.selectedElementIds?.[el.id])) { hide(); return; }
    const moving = box(selected);
    if (!moving) { hide(); return; }
    const dx = moving.left - d.startBounds.left, dy = moving.top - d.startBounds.top;
    const sameDimensions = Math.abs((moving.right - moving.left) - (d.startBounds.right - d.startBounds.left)) < 0.5 &&
      Math.abs((moving.bottom - moving.top) - (d.startBounds.bottom - d.startBounds.top)) < 0.5;
    // Only show during translation. Resize/rotate/selection gestures are not moves.
    if (!sameDimensions || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) ||
      selected.some((el: any) => { const original = d.initialPositions.get(el.id); return !original ||
        Math.abs((el.x - original.x) - dx) > 1 || Math.abs((el.y - original.y) - dy) > 1; })) { hide(); return; }
    const otherRects: Reference[] = [];
    for (const el of elements) {
      if (selectedIds.has(el.id) || !relevant(el)) continue;
      const bounds = box([el]);
      if (bounds) otherRects.push({ ...bounds, id: el.id });
    }
    const guides = closestDragDistances(moving, otherRects);
    const key = JSON.stringify([guides, state.scrollX, state.scrollY, state.zoom?.value, state.offsetLeft, state.offsetTop]);
    if (signature === key) return;
    signature = key;
    layer.replaceChildren();
    layer.dataset.visible = String(guides.length > 0);
    for (const guide of guides) {
      const start = sceneCoordsToViewportCoords({ sceneX: guide.from.x, sceneY: guide.from.y }, state);
      const end = sceneCoordsToViewportCoords({ sceneX: guide.to.x, sceneY: guide.to.y }, state);
      const line = document.createElement("div");
      line.className = "dodo-distance-guide";
      line.dataset.axis = guide.axis;
      line.dataset.gap = String(Math.round(guide.gap * 100) / 100);
      line.dataset.referenceId = guide.referenceId;
      line.setAttribute("aria-label", `${guide.axis === "horizontal" ? "水平" : "垂直"}距离 ${Math.round(guide.gap)}`);
      line.style.left = `${Math.min(start.x, end.x)}px`;
      line.style.top = `${Math.min(start.y, end.y)}px`;
      line.style.width = `${Math.max(1, Math.abs(end.x - start.x))}px`;
      line.style.height = `${Math.max(1, Math.abs(end.y - start.y))}px`;
      const label = document.createElement("span");
      label.className = "dodo-distance-label";
      label.textContent = String(Math.round(guide.gap));
      line.append(label);
      layer.append(line);
    }
  };
  const schedule = () => {
    if (frame || !gesture || disposed) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element) ||
      !event.target.closest(".excalidraw") ||
      event.target.closest("button, input, textarea, select, [contenteditable=true], .dodo-spacing-zone")) return;
    gesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, elementIds: [], startBounds: null, initialPositions: new Map() };
    const current = gesture;
    // Let Excalidraw select the target before freezing the starting geometry.
    setTimeout(() => { if (gesture === current) snapshotSelection(current); }, 0);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    schedule();
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture = null; hide();
  };
  const cancel = () => { gesture = null; hide(); };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerEnd, true);
  document.addEventListener("pointercancel", onPointerEnd, true);
  document.addEventListener("keydown", escape, true);
  window.addEventListener("blur", cancel);
  const change = api.onChange(schedule);
  return () => {
    disposed = true; cancel();
    if (frame) cancelAnimationFrame(frame);
    change?.();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerEnd, true);
    document.removeEventListener("pointercancel", onPointerEnd, true);
    document.removeEventListener("keydown", escape, true);
    window.removeEventListener("blur", cancel);
    layer.remove();
  };
}
