import { CaptureUpdateAction, getCommonBounds } from "@excalidraw/excalidraw";

type SceneElement = { id: string; x: number; y: number; [key: string]: any };
type Point = { x: number; y: number; fixedPoint: number[] } | null;
const NONCE_LIMIT = 2147483647;
const version = (element: SceneElement, patch: Record<string, unknown>, updated: number) =>
  ({ ...element, ...patch, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * NONCE_LIMIT), updated });
const mind = (element: SceneElement) => element.customData?.dodoMind;

function boundPoint(element: SceneElement, binding: any, peer?: SceneElement, forced?: number[]): Point {
  let fixed = forced || binding?.fixedPoint;
  const a = mind(element), b = peer && mind(peer);
  if (a?.mapId && b?.mapId === a.mapId && (a.parentId === peer?.id || b.parentId === element.id)) {
    const side = a.parentId === peer?.id ? a.side : b?.side;
    const parent = b?.parentId === element.id;
    if (side === "down") fixed = parent ? [0.5001, 1] : [0.5001, 0];
    if (side === "left") fixed = parent ? [0, 0.5001] : [1, 0.5001];
    if (side === "right") fixed = parent ? [1, 0.5001] : [0, 0.5001];
  }
  if (!Array.isArray(fixed)) fixed = peer
    ? Math.abs(peer.x - element.x) >= Math.abs(peer.y - element.y)
      ? [peer.x >= element.x ? 1 : 0, 0.5001]
      : [0.5001, peer.y >= element.y ? 1 : 0]
    : [0.5001, 0.5001];
  const clamp = (value: unknown) => Math.max(0, Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 0.5));
  const [left, top, right, bottom] = getCommonBounds([element] as any);
  return { x: left + (right - left) * clamp(fixed[0]), y: top + (bottom - top) * clamp(fixed[1]), fixedPoint: fixed };
}

/** Force straight connectors between ordinary graph nodes, but never mind-map branches. */
function straightBindings(start: SceneElement, end: SceneElement) {
  const sx = start.x + (start.width || 0) / 2, sy = start.y + (start.height || 0) / 2;
  const ex = end.x + (end.width || 0) / 2, ey = end.y + (end.height || 0) / 2;
  const dx = ex - sx, dy = ey - sy;
  if (Math.abs(dy) >= Math.abs(dx) * 0.5) {
    return dy >= 0 ? { start: [0.5001, 1], end: [0.5001, 0] } : { start: [0.5001, 0], end: [0.5001, 1] };
  }
  return dx >= 0 ? { start: [1, 0.5001], end: [0, 0.5001] } : { start: [0, 0.5001], end: [1, 0.5001] };
}

function reshapePoints(arrow: SceneElement, width: number, height: number) {
  const points: number[][] = Array.isArray(arrow.points) && arrow.points.length > 1 ? arrow.points : [[0, 0], [arrow.width || 0, arrow.height || 0]];
  if (points.length === 2) return [[0, 0], [width, height]];
  const last = points[points.length - 1];
  return points.map((point, index) => index === 0 ? [0, 0] : index === points.length - 1 ? [width, height]
    : [Math.abs(last[0]) < .001 ? width / 2 : point[0] * width / last[0], Math.abs(last[1]) < .001 ? height / 2 : point[1] * height / last[1]]);
}

/** Moves elements together with bound labels and arrows, keeping updates undoable. */
export function applyScenePositions(api: any, positions: Map<string, { x: number; y: number }>, options: { straightenArrows?: boolean; captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction] } = {}): boolean {
  if (!api || positions.size === 0) return false;
  const before: SceneElement[] = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
  const deltas = new Map<string, { x: number; y: number }>();
  for (const [id, next] of positions) {
    const current = before.find(element => element.id === id);
    if (current) deltas.set(id, { x: next.x - current.x, y: next.y - current.y });
  }
  if (!deltas.size) return false;
  if ([...deltas.values()].every(delta => delta.x === 0 && delta.y === 0)) return false;
  const now = Date.now();
  let elements = before.map(element => {
    const next = positions.get(element.id);
    return next ? version(element, { x: next.x, y: next.y }, now) : element;
  }).map(element => {
    const delta = element.type === "text" && element.containerId ? deltas.get(element.containerId) : undefined;
    return delta ? version(element, { x: element.x + delta.x, y: element.y + delta.y }, now) : element;
  });
  const byId = new Map(elements.map(element => [element.id, element]));
  const moved = new Set(deltas.keys());
  elements = elements.map(element => {
    if (element.type !== "arrow") return element;
    const startId = element.startBinding?.elementId, endId = element.endBinding?.elementId;
    if (!startId || !endId || (!moved.has(startId) && !moved.has(endId))) return element;
    const start = byId.get(startId), end = byId.get(endId);
    if (!start || !end) return element;
    const startMind = mind(start), endMind = mind(end);
    const mindBranch = Boolean(startMind?.mapId && startMind.mapId === endMind?.mapId && (startMind.parentId === end.id || endMind.parentId === start.id));
    const straighten = Boolean(options.straightenArrows && moved.has(startId) && moved.has(endId) && !mindBranch);
    const flow = straighten ? straightBindings(start, end) : undefined;
    const a = boundPoint(start, element.startBinding, end, flow?.start), b = boundPoint(end, element.endBinding, start, flow?.end);
    if (!a || !b) return element;
    const width = b.x - a.x, height = b.y - a.y;
    return version(element, { x: a.x, y: a.y, width, height, points: straighten ? [[0, 0], [width, height]] : reshapePoints(element, width, height),
      ...(straighten ? { elbowed: false, roundness: null } : {}),
      startBinding: { ...element.startBinding, fixedPoint: a.fixedPoint, ...(straighten ? { focus: 0, gap: 1 } : {}) },
      endBinding: { ...element.endBinding, fixedPoint: b.fixedPoint, ...(straighten ? { focus: 0, gap: 1 } : {}) } }, now);
  });
  const arrows = new Map(elements.filter(element => element.type === "arrow").map(element => [element.id, element]));
  elements = elements.map(element => {
    if (element.type !== "text" || !element.containerId) return element;
    const previous = before.find(item => item.id === element.containerId), arrow = arrows.get(element.containerId);
    if (previous?.type !== "arrow" || !arrow || previous === arrow) return element;
    const points = Array.isArray(arrow.points) && arrow.points.length > 1 ? arrow.points : [[0, 0], [arrow.width || 0, arrow.height || 0]];
    const start = points[0], end = points[points.length - 1];
    return version(element, { x: arrow.x + (start[0] + end[0] - (element.width || 0)) / 2, y: arrow.y + (start[1] + end[1] - (element.height || 0)) / 2 }, now);
  });
  api.updateScene({ elements, captureUpdate: options.captureUpdate ?? CaptureUpdateAction.IMMEDIATELY });
  return true;
}
