import "./spacing-handles.css";
import { CaptureUpdateAction, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type { InteractionFeature } from "../toolbar/types";
import { applyScenePositions } from "../scene-positions";
import { mountDragDistanceGuides } from "./drag-distance-guides";

type Axis = "horizontal" | "vertical";
type Shape = { id: string; x: number; y: number; width: number; height: number; angle?: number; isDeleted?: boolean; locked?: boolean; type: string; [key: string]: any };
export type SpacingGroup = { orientation: Axis; items: Shape[]; gaps: number[]; crossStart: number; crossEnd: number };
const excluded = new Set(["arrow", "line", "freedraw", "frame", "magicframe"]);
const MAX_GAP = 5000;
const UNIFORM_GAP_TOLERANCE = 0.01;

/** Multi-gap drag is synchronized only if the starting gaps are identical. */
export const hasUniformGaps = (gaps: readonly number[]): boolean =>
  gaps.length > 0 && gaps.every(gap => Math.abs(gap - gaps[0]) <= UNIFORM_GAP_TOLERANCE);

/** Unequal gaps must retain all non-target distances as the target is edited. */
export const adjustedSpacingGaps = (
  gaps: readonly number[], activeIndex: number, nextGap: number, synchronized: boolean,
): number[] => gaps.map((gap, index) => synchronized || index === activeIndex ? nextGap : gap);

/** Detect an ordered, non-overlapping row or column. Gaps need NOT be equal. */
export function detectSpacingGroup(selection: readonly Shape[]): SpacingGroup | null {
  const items = selection.filter(el => el && !el.isDeleted && !el.locked && !el.containerId &&
    !excluded.has(el.type) && Math.abs(el.angle || 0) < 0.0001 && el.width > 0 && el.height > 0);
  if (items.length < 2) return null;
  const detect = (orientation: Axis): SpacingGroup | null => {
    const horizontal = orientation === "horizontal";
    const axis = horizontal ? "x" : "y", cross = horizontal ? "y" : "x";
    const size = horizontal ? "width" : "height", crossSize = horizontal ? "height" : "width";
    const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
    const crossStart = Math.max(...sorted.map(el => el[cross]));
    const crossEnd = Math.min(...sorted.map(el => el[cross] + el[crossSize]));
    // A shared visible cross-axis strip is required to draw continuous hatch bands.
    if (crossEnd - crossStart < Math.min(10, Math.min(...sorted.map(el => el[crossSize])) * 0.2)) return null;
    const gaps = sorted.slice(1).map((el, index) => el[axis] - (sorted[index][axis] + sorted[index][size]));
    if (gaps.some(gap => gap < 0.5)) return null;
    return { orientation, items: sorted, gaps, crossStart, crossEnd };
  };
  const x = detect("horizontal"), y = detect("vertical");
  if (!x || !y) return x || y;
  const span = (group: SpacingGroup) => {
    const axis = group.orientation === "horizontal" ? "x" : "y";
    return group.items.at(-1)![axis] - group.items[0][axis];
  };
  return span(x) >= span(y) ? x : y;
}

/** Keep the first selected element anchored; move subsequent shapes and bound items. */
export function spacingPositions(group: SpacingGroup, gaps: readonly number[]): Map<string, { x: number; y: number }> {
  const horizontal = group.orientation === "horizontal";
  const axis = horizontal ? "x" : "y", size = horizontal ? "width" : "height";
  const result = new Map<string, { x: number; y: number }>();
  let cursor = group.items[0][axis];
  for (let i = 1; i < group.items.length; i++) {
    cursor += group.items[i - 1][size] + Math.max(0, gaps[i - 1] ?? group.gaps[i - 1]);
    const item = group.items[i];
    result.set(item.id, { x: horizontal ? cursor : item.x, y: horizontal ? item.y : cursor });
  }
  return result;
}

const validGap = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_GAP ? parsed : null;
};

const feature: InteractionFeature = {
  id: "spacingHandles", label: "等距间隔手柄",
  description: "多选图形后悬浮显示间隔手柄，悬浮手柄可查看所有间距；仅当间距相同时同步拖动，间距不同时只修改当前间隔；按住 Shift 吸附至 10 的整数倍，双击可输入数值。",
  defaultEnabled: false,
  mount(api) {
    const root = document.createElement("div");
    root.className = "dodo-spacing-handles";
    root.setAttribute("aria-label", "元素间距控制");
    root.dataset.active = "false";
    root.dataset.hovered = "false";
    document.body.append(root);
    const editor = document.createElement("div");
    editor.className = "dodo-spacing-editor";
    editor.hidden = true;
    editor.innerHTML = '<input type="text" inputmode="decimal" aria-label="间距数值" autocomplete="off" spellcheck="false"/><button type="button" aria-label="统一间距">统一间距</button>';
    root.append(editor);
    const unmountDistanceGuides = mountDragDistanceGuides(api, root);
    const input = editor.querySelector<HTMLInputElement>("input")!;
    const unify = editor.querySelector<HTMLButtonElement>("button")!;
    let signature = "";
    let disposed = false;
    let editing: { group: SpacingGroup; index: number } | null = null;
    let dragging: { group: SpacingGroup; index: number; pointerId: number; start: number; gap: number; changed: boolean;
      last: number; synchronized: boolean; zone: HTMLDivElement;
      original: Map<string, { x: number; y: number }> } | null = null;
    let hoverBox: { left: number; right: number; top: number; bottom: number } | null = null;
    let lastPointer: { x: number; y: number } | null = null;

    const active = (on: boolean) => { root.dataset.active = String(on); };
    const hoverSelection = (x: number, y: number) => {
      const box = hoverBox;
      root.dataset.hovered = String(Boolean(box &&
        x >= box.left && x <= box.right && y >= box.top && y <= box.bottom));
    };
    const trackSelectionHover = (event: PointerEvent) => {
      lastPointer = { x: event.clientX, y: event.clientY };
      if (!editing && !dragging) hoverSelection(event.clientX, event.clientY);
    };
    const unhoverHandle = (zone: HTMLElement) => {
      zone.dataset.handleHover = "false";
      if (!dragging && !editing) active(false);
    };
    const closeEditor = () => { editing = null; editor.hidden = true; input.blur(); };
    const getOriginal = (group: SpacingGroup) => new Map(group.items.slice(1).map(el => [el.id, { x: el.x, y: el.y }]));
    const preview = (group: SpacingGroup, gaps: number[], capture: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction]) => {
      applyScenePositions(api, spacingPositions(group, gaps), { captureUpdate: capture });
    };
    const applyGaps = (group: SpacingGroup, gaps: number[]) => {
      if (gaps.every((gap, i) => Math.abs(gap - group.gaps[i]) < 0.001)) return;
      preview(group, gaps, CaptureUpdateAction.IMMEDIATELY);
      signature = "";
      render();
    };
    const submit = (all: boolean) => {
      if (!editing) return;
      const { group, index } = editing;
      const value = validGap(input.value);
      if (value === null) { input.setAttribute("aria-invalid", "true"); input.focus(); return; }
      const gaps = [...group.gaps];
      if (all) gaps.fill(value);
      else gaps[index] = value;
      closeEditor();
      applyGaps(group, gaps);
    };
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); submit(false); }
      if (event.key === "Escape") { event.preventDefault(); closeEditor(); active(false); }
    });
    // Preserve the input focus when pressing the adjacent uniform-spacing action.
    unify.addEventListener("pointerdown", event => event.preventDefault());
    unify.addEventListener("click", event => { event.stopPropagation(); submit(true); });
    const openEditor = (group: SpacingGroup, index: number, center: { x: number; y: number }) => {
      editing = { group, index };
      active(true);
      unify.hidden = group.gaps.length < 2;
      editor.hidden = false;
      input.value = String(Math.round(group.gaps[index] * 100) / 100);
      input.removeAttribute("aria-invalid");
      editor.style.left = `${Math.max(8, Math.min(center.x, innerWidth - 158))}px`;
      editor.style.top = `${Math.max(8, Math.min(center.y - 13, innerHeight - 40))}px`;
      input.focus(); input.select();
    };
    const point = (x: number, y: number) => sceneCoordsToViewportCoords({ sceneX: x, sceneY: y }, api.getAppState());
    // Reposition hit handles and pressed highlights with the live scene.
    // Moving labels without their gap regions would leave stale visual feedback.
    const updateZoneLayout = (group: SpacingGroup, gaps: readonly number[]) => {
      const positions = spacingPositions(group, gaps);
      const horizontal = group.orientation === "horizontal";
      group.gaps.forEach((_, index) => {
        const a = group.items[index], b = group.items[index + 1];
        const first = (horizontal ? positions.get(a.id)?.x ?? a.x : positions.get(a.id)?.y ?? a.y) + (horizontal ? a.width : a.height);
        const second = horizontal ? positions.get(b.id)?.x ?? b.x : positions.get(b.id)?.y ?? b.y;
        const min = point(horizontal ? first : group.crossStart, horizontal ? group.crossStart : first);
        const max = point(horizontal ? second : group.crossEnd, horizontal ? group.crossEnd : second);
        const zone = root.querySelector<HTMLElement>(`.dodo-spacing-zone[data-index="${index}"]`);
        if (!zone) return;
        zone.style.left = `${Math.min(min.x, max.x)}px`;
        zone.style.top = `${Math.min(min.y, max.y)}px`;
        zone.style.width = `${Math.max(2, Math.abs(max.x - min.x))}px`;
        zone.style.height = `${Math.max(2, Math.abs(max.y - min.y))}px`;
        zone.dataset.gap = String(Math.round(gaps[index] * 100) / 100);
      });
    };
    const cancelDrag = () => {
      const d = dragging;
      if (!d) return;
      dragging = null;
      if (d.changed) applyScenePositions(api, d.original, { captureUpdate: CaptureUpdateAction.NEVER });
      root.querySelectorAll<HTMLElement>(".dodo-spacing-zone").forEach(zone => { zone.dataset.pressed = "false"; });
      signature = ""; active(false); render();
    };
    const endDrag = () => {
      const d = dragging;
      if (!d) return;
      dragging = null;
      root.querySelectorAll<HTMLElement>(".dodo-spacing-zone").forEach(zone => { zone.dataset.pressed = "false"; });
      if (!d.changed) { active(false); return; } // Preserve the hit node across a dblclick.
      if (d.changed) {
        // Preview edits never enter the undo stack. Reset and then commit a
        // single undoable change on release (including bound arrows/text).
        applyScenePositions(api, d.original, { captureUpdate: CaptureUpdateAction.NEVER });
        preview(d.group, adjustedSpacingGaps(d.group.gaps, d.index, d.last, d.synchronized),
          CaptureUpdateAction.IMMEDIATELY);
      }
      signature = ""; active(false); render();
    };
    const render = () => {
      if (disposed || editing || dragging) return;
      const state = api.getAppState();
      const selected = new Set(Object.entries(state.selectedElementIds || {}).filter(([,on]) => on).map(([id]) => id));
      const elements = (api.getSceneElements?.() || []).filter((el: Shape) => selected.has(el.id));
      const group = detectSpacingGroup(elements);
      const key = JSON.stringify([group?.orientation, group?.gaps, group?.items.map(el => [el.id, el.x, el.y, el.width, el.height, el.version]),
        state.scrollX, state.scrollY, state.zoom?.value, state.offsetLeft, state.offsetTop]);
      if (key === signature) return;
      signature = key;
      // Keep the editor node stable for focus; only replace the gap hit regions.
      root.querySelectorAll(".dodo-spacing-zone").forEach(node => node.remove());
      if (!group) { hoverBox = null; root.dataset.hovered = "false"; active(false); return; }
      const horizontal = group.orientation === "horizontal";
      const bandStart = group.crossStart, bandEnd = group.crossEnd;
      const first = group.items[0], last = group.items[group.items.length - 1];
      const tl = point(horizontal ? first.x : bandStart, horizontal ? bandStart : first.y);
      const br = point(horizontal ? last.x + last.width : bandEnd, horizontal ? bandEnd : last.y + last.height);
      hoverBox = {
        left: Math.min(tl.x, br.x), right: Math.max(tl.x, br.x),
        top: Math.min(tl.y, br.y), bottom: Math.max(tl.y, br.y),
      };
      if (lastPointer) hoverSelection(lastPointer.x, lastPointer.y);
      group.gaps.forEach((gap, index) => {
        const a = group.items[index], b = group.items[index + 1];
        const first = horizontal ? a.x + a.width : a.y + a.height;
        const second = horizontal ? b.x : b.y;
        const min = point(horizontal ? first : bandStart, horizontal ? bandStart : first);
        const max = point(horizontal ? second : bandEnd, horizontal ? bandEnd : second);
        const left = Math.min(min.x, max.x), top = Math.min(min.y, max.y);
        const width = Math.max(2, Math.abs(max.x - min.x)), height = Math.max(2, Math.abs(max.y - min.y));
        const zone = document.createElement("div");
        zone.className = "dodo-spacing-zone";
        zone.dataset.index = String(index);
        zone.dataset.orientation = group.orientation;
        zone.dataset.gap = String(Math.round(gap * 100) / 100);
        zone.dataset.handleHover = "false";
        zone.dataset.pressed = "false";
        zone.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
        const handle = document.createElement("div");
        handle.className = "dodo-spacing-handle";
        handle.setAttribute("role", "button");
        handle.setAttribute("tabindex", "0");
        handle.setAttribute("aria-label", `调整${horizontal ? "水平" : "垂直"}间隔`);
        handle.setAttribute("aria-description", `当前间距 ${Math.round(gap)}；等距时同步调整，不等距时仅调整当前间隔，按住 Shift 吸附至 10 的整数倍，双击输入数值`);
        const marker = document.createElement("span"); marker.className = "dodo-spacing-marker";
        const number = document.createElement("span"); number.className = "dodo-spacing-value";
        number.textContent = String(Math.round(gap));
        handle.append(marker);
        zone.append(handle, number);
        handle.addEventListener("pointerenter", () => {
          if (!editing) { zone.dataset.handleHover = "true"; active(true); }
        });
        handle.addEventListener("pointerleave", () => {
          if (!dragging && !editing) unhoverHandle(zone);
        });
        handle.addEventListener("pointerdown", event => {
          if (event.button !== 0 || editing) return;
          event.preventDefault(); event.stopPropagation();
          const coord = horizontal ? event.clientX : event.clientY;
          const synchronized = hasUniformGaps(group.gaps);
          dragging = { group, index, pointerId: event.pointerId, start: coord, gap,
            last: gap, changed: false, synchronized, zone, original: getOriginal(group) };
          root.querySelectorAll<HTMLElement>(".dodo-spacing-zone").forEach((item, itemIndex) => {
            item.dataset.pressed = String(synchronized || itemIndex === index);
          });
          zone.dataset.handleHover = "true";
          active(true); handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener("pointermove", event => {
          const d = dragging;
          if (!d || d.zone !== zone || d.pointerId !== event.pointerId) return;
          const coord = horizontal ? event.clientX : event.clientY;
          const zoom = api.getAppState().zoom?.value || 1;
          const delta = (coord - d.start) / zoom;
          // Shift snaps the absolute gap to multiples of 10 (0, 10, 20, ...),
          // regardless of the original gap (e.g. 82 -> 80 / 90 / 100).
          const rawGap = d.gap + delta;
          const next = Math.max(0, Math.min(MAX_GAP,
            event.shiftKey ? Math.round(rawGap / 10) * 10 : Math.round(rawGap * 100) / 100));
          if (Math.abs(next - d.last) < .5) return;
          d.last = next;
          d.changed = true;
          // Preserve unequal neighboring gaps; equal gaps move together.
          const previewGaps = adjustedSpacingGaps(group.gaps, d.index, next, d.synchronized);
          preview(group, previewGaps, CaptureUpdateAction.NEVER);
          updateZoneLayout(group, previewGaps);
          root.querySelectorAll<HTMLElement>(".dodo-spacing-zone").forEach((item, itemIndex) => {
            const label = item.querySelector<HTMLElement>(".dodo-spacing-value");
            if (label) label.textContent = String(Math.round(previewGaps[itemIndex]));
          });
        });
        handle.addEventListener("pointerup", event => {
          if (dragging?.pointerId !== event.pointerId) return;
          event.stopPropagation();
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          endDrag();
        });
        handle.addEventListener("pointercancel", cancelDrag);
        handle.addEventListener("dblclick", event => {
          event.stopPropagation(); event.preventDefault();
          openEditor(group, index, { x: left + width / 2, y: top + height / 2 });
        });
        handle.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); event.stopPropagation();
            openEditor(group, index, { x: left + width / 2, y: top + height / 2 });
          }
        });
        root.append(zone);
      });
    };
    const outside = (event: PointerEvent) => {
      if (editing && !editor.contains(event.target as Node)) { closeEditor(); active(false); signature = ""; render(); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dragging) cancelDrag();
      else if (editing) { closeEditor(); active(false); signature = ""; render(); }
    };
    const blur = () => { if (dragging) cancelDrag(); };
    document.addEventListener("pointermove", trackSelectionHover, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    const unsubscribe = api.onChange(render);
    const timer = window.setInterval(render, 200);
    render();
    return () => {
      if (dragging) cancelDrag();
      disposed = true;
      clearInterval(timer); unsubscribe?.();
      document.removeEventListener("pointermove", trackSelectionHover, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
      unmountDistanceGuides();
      root.remove();
    };
  },
};
export default feature;
