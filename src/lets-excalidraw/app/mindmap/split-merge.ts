import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { newId, selectElements } from "../tools/scene-commands";
import { branchStyleOf, childrenOf, descendantsOf, isMindNode, mindData, nodeFor, rootFor, type Side } from "./model";
import { connectorGeometry, layoutElements, makeMindArrow, revised, withMind } from "./elements";
import { centerGap, normalizedOverlap, rectGap, snapScene, type Rect } from "./drop-geometry";

/** Minimum edge-to-edge distance from the dragged node to its original tree,
 * excluding all descendants moving with it. A snapshot of the start gap is
 * kept for the whole gesture so live native positions cannot move the baseline. */
export function distanceToOriginalTree(elements: readonly any[], nodeId: string): number {
  const node = nodeFor(elements, nodeId);
  if (!node || !mindData(node)?.parentId) return Infinity;
  const excluded = new Set([nodeId, ...descendantsOf(elements, nodeId).map(el => el.id)]);
  const others = elements.filter(el => isMindNode(el) && mindData(el)?.mapId === mindData(node)?.mapId &&
    !excluded.has(el.id));
  return others.length ? Math.min(...others.map(el => rectGap(node, el))) : Infinity;
}

/** All inputs are screen/CSS pixels; the UI divides scene distance by zoom.
 * Asymmetric enter/exit thresholds prevent flickering at the boundary. */
export function isDetachmentCandidate(startGap: number, currentGap: number,
  travel: number, wasCandidate = false): boolean {
  if (!Number.isFinite(startGap) || !Number.isFinite(currentGap)) return false;
  return travel >= (wasCandidate ? 80 : 120) &&
    currentGap >= (wasCandidate ? 90 : 120) &&
    currentGap - startGap >= (wasCandidate ? 70 : 100);
}
/** Cross-tree merge uses the same moved rectangle as local reparenting.
 * Rank meaningful overlap above mere snap proximity, so side-grip gestures
 * and overlapping targets behave independently from the cursor position. */
export function resolveMindMerge(elements: readonly any[], sourceId: string,
  moving: Rect, zoom = 1): any | null {
  const source = nodeFor(elements, sourceId);
  if (!source || source.locked) return null;
  const sourceMapId = mindData(source)?.mapId;
  let best: any = null, rank = Infinity;
  for (const target of elements) {
    if (!isMindNode(target) || target.locked || target.id === sourceId ||
      mindData(target)?.mapId === sourceMapId || mindData(target)?.collapsedElements?.length) continue;
    const gap = rectGap(moving, target);
    if (gap > snapScene(24, zoom)) continue;
    const fraction = normalizedOverlap(moving, target);
    const currentRank = -fraction * 10000 + gap * zoom * 10 + centerGap(moving, target) * .001;
    if (currentRank >= rank) continue;
    rank = currentRank; best = target;
  }
  return best;
}

/** Rewrite folded archives too: a folded subtree must still expand inside
 * the new owning map, including all nested connector records. */
function remapArchived(elements: readonly any[], mapId: string): any[] {
  return elements.map(el => {
    let result = el;
    const data = mindData(el);
    if (data) {
      const archive = data.collapsedElements?.length ? remapArchived(data.collapsedElements, mapId) : undefined;
      result = withMind(result, { mapId, ...(archive ? {collapsedElements: archive} : {}) });
    }
    if (el.customData?.dodoMindEdge) {
      result = revised(result, { customData: {
        ...(result.customData || {}), dodoMindEdge: {
          ...el.customData.dodoMindEdge, mapId
        }
      } });
    }
    return result;
  });
}

const moveNode = (el: any, mapId: string, patch: Record<string, unknown> = {}): any => {
  const archive = mindData(el)?.collapsedElements;
  return withMind(el, { mapId, ...patch,
    ...(archive?.length ? {collapsedElements: remapArchived(archive, mapId)} : {}) });
};
const updateArrowMap = (el: any, mapId: string): any => revised(el, {customData: {
  ...el.customData, dodoMindEdge: {...el.customData.dodoMindEdge, mapId}
}});
const removeArrowRef = (el: any, arrowId: string): any => {
  const prior = el.boundElements || [];
  const rest = prior.filter((item: any) => item.id !== arrowId);
  return rest.length === prior.length ? el : revised(el, {boundElements: rest.length ? rest : null});
};

/** Split a native branch without cloning any of its shapes or labels.
 * Root keeps its dragged position; the remaining tree is tidied separately. */
export function patchMindSplit(elements: readonly any[], nodeId: string,
  newMapId: string): any[] | null {
  const node = nodeFor(elements, nodeId), data = mindData(node);
  if (!node || !data?.parentId || node.locked || !newMapId ||
    elements.some(el => mindData(el)?.mapId === newMapId)) return null;
  const root = rootFor(elements, nodeId), parent = nodeFor(elements, data.parentId);
  if (!root || !parent) return null;
  const moved = new Set([nodeId, ...descendantsOf(elements, nodeId).map(el => el.id)]);
  const movedArrows = new Set<string>();
  let incoming: any = null;
  for (const el of elements) {
    if (el.isDeleted || el.type !== "arrow" ||
      el.customData?.dodoMindEdge?.mapId !== data.mapId) continue;
    const child = el.customData.dodoMindEdge.childId;
    if (child === nodeId) incoming = el;
    else if (moved.has(child)) movedArrows.add(el.id);
  }
  const incomingId = incoming?.id;
  const direction = mindData(root)?.direction === "both"
    ? data.side : (mindData(root)?.direction || "right");
  const oldSiblings = childrenOf(elements, parent.id).filter(el =>
    el.id !== nodeId && (mindData(root)?.direction !== "both" || parent.id !== root.id ||
      mindData(el)?.side === data.side));
  const orders = new Map(oldSiblings.map((el, i) => [el.id, i]));
  let next = elements.map(el => {
    if (incomingId && el.id === incomingId) return revised(el, {isDeleted: true});
    if (moved.has(el.id)) {
      const patch = el.id === nodeId
        ? {parentId: null, order: 0, direction, branchStyle: branchStyleOf(root)}
        : {};
      const updated = moveNode(el, newMapId, patch);
      return incomingId && el.id === nodeId ? removeArrowRef(updated, incomingId) : updated;
    }
    if (movedArrows.has(el.id)) return updateArrowMap(el, newMapId);
    if (incomingId && el.id === parent.id) return removeArrowRef(el, incomingId);
    if (orders.has(el.id) && mindData(el)?.order !== orders.get(el.id))
      return withMind(el, {order: orders.get(el.id)!});
    return el;
  });
  next = layoutElements(next, root.id);
  return layoutElements(next, nodeId);
}
export function commitMindSplit(api: any, id: string): boolean {
  const source = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements();
  const result = patchMindSplit(source, id, newId());
  if (!result) return false;
  api.updateScene({elements: result, appState: {...selectElements(result, [id])},
    captureUpdate: CaptureUpdateAction.IMMEDIATELY});
  return true;
}

/** Transfer a whole subtree across maps. Preserve its incoming arrow when
 * possible; a former root gets a new native bound arrow. */
export function patchMindMerge(elements: readonly any[], nodeId: string,
  targetId: string, state: any = {}): any[] | null {
  const node = nodeFor(elements, nodeId), target = nodeFor(elements, targetId);
  const sourceData = mindData(node), targetData = mindData(target);
  if (!node || !target || !sourceData || !targetData ||
    sourceData.mapId === targetData.mapId || node.locked || target.locked ||
    targetData.collapsedElements?.length) return null;
  const oldRoot = rootFor(elements, nodeId), targetRoot = rootFor(elements, targetId);
  if (!oldRoot || !targetRoot) return null;
  const moved = new Set([nodeId, ...descendantsOf(elements, nodeId).map(el => el.id)]);
  const newSide: Side = target.id === targetRoot.id
    ? (mindData(targetRoot)?.direction === "both"
      ? (node.x + node.width / 2 < target.x + target.width / 2 ? "left" : "right")
      : (mindData(targetRoot)?.direction || "right") as Side)
    : targetData.side;
  const oldParentId = sourceData.parentId;
  const oldParent = oldParentId ? nodeFor(elements, oldParentId) : null;
  const oldSiblings = oldParentId ? childrenOf(elements, oldParentId).filter(el =>
    el.id !== nodeId && (mindData(oldRoot)?.direction !== "both" ||
      oldParentId !== oldRoot.id || mindData(el)?.side === sourceData.side)) : [];
  const orders = new Map(oldSiblings.map((el, i) => [el.id, i]));
  const childOrder = childrenOf(elements, target.id).filter(el =>
    target.id !== targetRoot.id || mindData(targetRoot)?.direction !== "both" ||
    mindData(el)?.side === newSide).length;
  const incoming = elements.find(el => !el.isDeleted && el.type === "arrow" &&
    el.customData?.dodoMindEdge?.mapId === sourceData.mapId &&
    el.customData?.dodoMindEdge?.childId === nodeId);
  const movedArrows = new Set(elements.filter(el => !el.isDeleted && el.type === "arrow" &&
    el.customData?.dodoMindEdge?.mapId === sourceData.mapId &&
    moved.has(el.customData.dodoMindEdge.childId) && el.id !== incoming?.id)
    .map(el => el.id));
  let next = elements.map(el => {
    if (moved.has(el.id)) {
      const patch = el.id === nodeId
        ? {parentId: targetId, order: childOrder, side: newSide,
          direction: undefined, branchStyle: undefined}
        : {side: newSide};
      return moveNode(el, targetData.mapId, patch);
    }
    if (movedArrows.has(el.id)) return updateArrowMap(el, targetData.mapId);
    if (incoming && el.id === incoming.id) return updateArrowMap(el, targetData.mapId);
    if (incoming && el.id === oldParentId) return removeArrowRef(el, incoming.id);
    if (orders.has(el.id) && mindData(el)?.order !== orders.get(el.id))
      return withMind(el, {order: orders.get(el.id)!});
    return el;
  });
  const movedNode = next.find(el => el.id === nodeId);
  const destination = next.find(el => el.id === targetId);
  const edge = incoming
    ? revised(next.find(el => el.id === incoming.id),
      connectorGeometry(incoming, destination, movedNode, branchStyleOf(targetRoot)))
    : makeMindArrow(destination, movedNode, branchStyleOf(targetRoot), state);
  next = next.map(el => {
    if (incoming && el.id === incoming.id) return edge;
    if (el.id === targetId || el.id === nodeId) {
      const refs = (el.boundElements || []).filter((item: any) => item.id !== edge.id);
      return revised(el, {boundElements: [...refs, {id: edge.id, type: "arrow"}]});
    }
    return el;
  });
  if (!incoming) next.push(edge);
  if (oldParent && oldRoot.id !== nodeId) next = layoutElements(next, oldRoot.id);
  return layoutElements(next, targetRoot.id);
}
export function commitMindMerge(api: any, id: string, targetId: string): boolean {
  const source = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements();
  const result = patchMindMerge(source, id, targetId, api.getAppState());
  if (!result) return false;
  api.updateScene({elements: result, appState: {...selectElements(result, [id])},
    captureUpdate: CaptureUpdateAction.IMMEDIATELY});
  return true;
}

