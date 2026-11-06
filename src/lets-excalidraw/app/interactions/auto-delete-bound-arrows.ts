import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { InteractionFeature } from "../toolbar/types";

/** Port of auto-delete-bound-arrows.js: delete arrows only when an endpoint was tombstoned. */
export function removeDeletedElementArrows(elements: readonly any[]): any[] | null {
  const deletedNodes = new Set(elements.filter(el => el.isDeleted && el.type !== "arrow").map(el => el.id));
  const explicitArrows = new Set<string>();
  for (const node of elements) {
    if (!deletedNodes.has(node.id)) continue;
    for (const bound of node.boundElements || []) if (bound.type === "arrow") explicitArrows.add(bound.id);
  }
  const removed = new Set(elements.filter(el => el.isDeleted && el.type === "arrow").map(el => el.id));
  const now = Date.now();
  const version = (el: any, patch: any) => ({ ...el, ...patch, version: (el.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 0x7fffffff), updated: now });
  const first = elements.map(el => {
    if (el.isDeleted || el.type !== "arrow") return el;
    if (!explicitArrows.has(el.id) && ![el.startBinding?.elementId,el.endBinding?.elementId].some(id => deletedNodes.has(id))) return el;
    removed.add(el.id);
    return version(el, { isDeleted: true });
  });
  let changed = first.some((el,i) => el !== elements[i]);
  const second = first.map(el => {
    if (el.isDeleted || !Array.isArray(el.boundElements)) return el;
    const refs = el.boundElements.filter((bound: any) => bound.type !== "arrow" || !removed.has(bound.id));
    if (refs.length === el.boundElements.length) return el;
    changed = true;
    return version(el, { boundElements: refs.length ? refs : null });
  });
  return changed ? second : null;
}

const feature: InteractionFeature = {
  id: "autoDeleteBoundArrows", label: "删除元素时移除相关箭头",
  description: "删除形状后清理绑定的连接箭头，不清除未绑定的普通线条。",
  defaultEnabled: false,
  mount(api) {
    let updating = false;
    const update = () => {
      if (updating) return;
      const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      const next = removeDeletedElementArrows(elements);
      if (!next) return;
      updating = true;
      try { api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY }); }
      finally { updating = false; }
    };
    const unsubscribe = api.onChange(update);
    update();
    return () => { unsubscribe?.(); updating = false; };
  },
};
export default feature;
