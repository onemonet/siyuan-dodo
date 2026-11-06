import { nanoid } from 'nanoid';
import { alignAgentElements, distributeAgentElements, groupAgentElements, ungroupAgentElements, duplicateAgentElements } from "./agent-advanced";
import { CaptureUpdateAction, convertToExcalidrawElements, FONT_FAMILY, getCommonBounds, newElementWith } from '@excalidraw/excalidraw';

type CanvasElement = { id: string; [key: string]: any };
const ALLOWED_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'frame']);
const UPDATE_FIELDS = new Set([
  'x', 'y', 'width', 'height', 'angle', 'strokeColor', 'backgroundColor', 'fillStyle', 'strokeWidth',
  'strokeStyle', 'roughness', 'opacity', 'text', 'fontSize', 'fontFamily', 'textAlign', 'verticalAlign',
  'lineHeight', 'containerId', 'boundElements', 'groupIds', 'points', 'startBinding', 'endBinding',
  'startArrowhead', 'endArrowhead', 'roundness', 'locked', 'frameId', 'elbowed', 'link', 'name',
]);
const getAPI = () => window.excalidrawAPI;
const currentElements = (): CanvasElement[] => getAPI().getSceneElements().filter((element: CanvasElement) => !element.isDeleted);
function finite(value: unknown, min = -1000000, max = 1000000): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function safeLink(value: unknown): unknown {
  if (typeof value !== 'string') return value === null ? null : undefined;
  const link = value.trim();
  if (link.length > 2048) return undefined;
  if (/^https?:\/\//i.test(link) || /^siyuan:\/\/blocks\/[\w-]+$/i.test(link) || /^(element|group)=[\w-]+$/i.test(link)) return link;
  return undefined;
}

function safePatch(update: CanvasElement): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (!UPDATE_FIELDS.has(key)) continue;
    if (key === 'angle' && !finite(value, -Math.PI * 2, Math.PI * 2)) throw new Error('angle 无效');
    if (key === 'name' && (typeof value !== 'string' || value.length > 500)) throw new Error('name 无效');
    if (['x', 'y'].includes(key) && !finite(value)) throw new Error(`字段 ${key} 无效`);
    if (['width', 'height'].includes(key) && !finite(value, 0, 50000)) throw new Error(`字段 ${key} 无效`);
    if (['strokeWidth', 'roughness', 'opacity', 'fontSize', 'fontFamily', 'lineHeight'].includes(key) && !finite(value, 0, 10000)) throw new Error(`字段 ${key} 无效`);
    if (key === 'fontFamily' && !Object.values(FONT_FAMILY).includes(value as any)) throw new Error('fontFamily 无效');
    if (key === 'fontSize' && !finite(value, 1, 512)) throw new Error('fontSize 无效');
    if (key === 'lineHeight' && !finite(value, 0.1, 10)) throw new Error('lineHeight 无效');
    if (key === 'opacity' && !finite(value, 0, 100)) throw new Error('opacity 无效');
    if (['strokeColor', 'backgroundColor', 'fillStyle', 'strokeStyle', 'textAlign', 'verticalAlign'].includes(key) && (typeof value !== 'string' || value.length > 80)) throw new Error(`字段 ${key} 无效`);
    if (['text', 'originalText'].includes(key) && (typeof value !== 'string' || value.length > 20000)) throw new Error(`字段 ${key} 无效`);
    const enums: Record<string, unknown[]> = { fillStyle: ['solid', 'hachure', 'cross-hatch', 'zigzag'], strokeStyle: ['solid', 'dashed', 'dotted'], textAlign: ['left', 'center', 'right'], verticalAlign: ['top', 'middle', 'bottom'], startArrowhead: [null, 'arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many'], endArrowhead: [null, 'arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many'] };
    if (enums[key] && !enums[key].includes(value)) throw new Error(`字段 ${key} 无效`);
    if (key === 'link') {
      const link = safeLink(value);
      if (typeof link === 'undefined') throw new Error(`字段 ${key} 无效`);
      patch.link = link;
      continue;
    }
    if (key === 'points') {
      if (!Array.isArray(value) || value.length < 2 || value.length > 1000 || !value.every((point) => Array.isArray(point) && point.length === 2 && finite(point[0]) && finite(point[1]))) throw new Error(`字段 ${key} 无效`);
    }
    if (key === 'groupIds') {
      if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) throw new Error(`字段 ${key} 无效`);
    }
    if (key === 'boundElements') {
      if (value !== null && (!Array.isArray(value) || !value.every((item) => item && typeof item.id === 'string' && ['text', 'arrow'].includes(item.type)))) throw new Error(`字段 ${key} 无效`);
    }
    if (key === 'startBinding' || key === 'endBinding') {
      if (value === null) { patch[key] = null; continue; }
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as any).elementId !== 'string' || !(value as any).elementId.trim()) throw new Error(`字段 ${key} 无效`);
      const binding = value as any;
      const safeBinding: Record<string, unknown> = {
        elementId: binding.elementId,
        focus: finite(binding.focus, -1, 1) ? binding.focus : 0,
        gap: finite(binding.gap, 0, 1000) ? binding.gap : 1,
      };
      if (Array.isArray(binding.fixedPoint) && binding.fixedPoint.length === 2
        && finite(binding.fixedPoint[0], 0, 1) && finite(binding.fixedPoint[1], 0, 1)) {
        safeBinding.fixedPoint = [binding.fixedPoint[0], binding.fixedPoint[1]];
      }
      patch[key] = safeBinding;
      continue;
    }
    if (key === 'containerId' || key === 'frameId') {
      if (value !== null && typeof value !== 'string') throw new Error(`字段 ${key} 无效`);
    }
    if (key === 'locked' || key === 'elbowed') {
      if (typeof value !== 'boolean') throw new Error(`字段 ${key} 无效`);
    }
    if (key === 'roundness') {
      if (value !== null && (typeof value !== 'object' || Array.isArray(value) || ![1, 2, 3].includes((value as any).type))) throw new Error(`字段 ${key} 无效`);
    }
    patch[key] = value;
  }
  if (Array.isArray(patch.points)) {
    const xs = patch.points.map((point: number[]) => point[0]);
    const ys = patch.points.map((point: number[]) => point[1]);
    patch.width = Math.max(...xs) - Math.min(...xs);
    patch.height = Math.max(...ys) - Math.min(...ys);
    if (!finite(patch.width, 0, 50000) || !finite(patch.height, 0, 50000)) throw new Error('points 超出允许的尺寸范围');
  }
  return patch;
}

function batch(value: unknown, field: string): any[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error(`${field} 必须包含 1–100 项`);
  return value;
}

function labelId(element: CanvasElement): string | undefined {
  return element.boundElements?.find((item: any) => item.type === 'text')?.id;
}

function reconcileBindings(elements: CanvasElement[]): CanvasElement[] {
  const refs = new Map(elements.map((element) => [element.id, [] as any[]]));
  const bind = (target: string | undefined, id: string, type: string) => {
    const list = target ? refs.get(target) : undefined;
    if (list && !list.some((item) => item.id === id)) list.push({ id, type });
  };
  for (const element of elements) {
    if (element.type === 'text') bind(element.containerId, element.id, 'text');
    if (element.type === 'arrow') {
      bind(element.startBinding?.elementId, element.id, 'arrow');
      bind(element.endBinding?.elementId, element.id, 'arrow');
    }
  }
  return elements.map((element) => {
    const next = refs.get(element.id)!;
    const previous = element.boundElements ?? [];
    if (previous.length === next.length && previous.every((item: any) => next.some((ref) => ref.id === item.id && ref.type === item.type))) return element;
    return newElementWith(element as any, { boundElements: next.length ? next : null });
  });
}

function commit(elements: CanvasElement[]): void {
  const api = getAPI();
  const next = new Map(reconcileBindings(repairCanvasBindings(elements)).map((element) => [element.id, element]));
  const previous: CanvasElement[] = api.getSceneElementsIncludingDeleted();
  const previousIds = new Set(previous.map((element) => element.id));
  // Preserve tombstones so native undo can restore deleted elements.
  const scene = previous.map((element) => next.get(element.id) ?? (element.isDeleted ? element : newElementWith(element as any, { isDeleted: true })));
  scene.push(...Array.from(next.values()).filter((element) => !previousIds.has(element.id)));
  api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

function assertIdle(ids: Set<string>): void {
  const state = getAPI().getAppState();
  for (const element of [state.editingTextElement, state.resizingElement, { id: state.editingLinearElement?.elementId }]) {
    if (element && ids.has(element.id)) throw new Error(`用户正在编辑元素 ${element.id}，请稍后重读画布`);
  }
  if ((state.selectedElementsAreBeingDragged || state.isRotating || state.isResizing) && Array.from(ids).some((id) => state.selectedElementIds?.[id])) throw new Error('用户正在拖动或调整目标元素，请稍后重读画布');
}

const rotate = (x: number, y: number, angle: number) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];

// Native drag intersects a ray through the focus point. An external/tangent focus can leave the endpoint stationary.
export function repairCanvasBindings(elements: CanvasElement[]): CanvasElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  return elements.map((element) => {
    if (element.type !== 'arrow' || element.elbowed || element.isDeleted) return element;
    const patch: Record<string, any> = {};
    for (const field of ['startBinding', 'endBinding']) {
      const binding = element[field];
      const target = byId.get(binding?.elementId);
      if (!target || !['rectangle', 'ellipse', 'diamond'].includes(target.type)) continue;
      // Native ellipse focus scales a bounding-box corner, so its interior limit is 1/sqrt(2).
      const limit = target.type === 'ellipse' ? Math.SQRT1_2 : 1;
      if (!finite(binding.focus) || Math.abs(binding.focus) >= limit) patch[field] = { ...binding, focus: 0 };
    }
    return Object.keys(patch).length ? newElementWith(element as any, patch) : element;
  });
}

function outlinePoint(shape: CanvasElement, toward: CanvasElement): number[] {
  const [dx, dy] = rotate(toward.x + toward.width / 2 - shape.x - shape.width / 2, toward.y + toward.height / 2 - shape.y - shape.height / 2, -(shape.angle ?? 0));
  const nx = Math.abs(dx) / (shape.width / 2);
  const ny = Math.abs(dy) / (shape.height / 2);
  const divisor = shape.type === 'ellipse' ? Math.hypot(nx, ny) : shape.type === 'diamond' ? nx + ny : Math.max(nx, ny);
  if (!Number.isFinite(divisor) || divisor <= 0) throw new Error('重合或零尺寸节点需要显式提供箭头 points');
  const point = rotate(dx / divisor, dy / divisor, shape.angle ?? 0);
  return [shape.x + shape.width / 2 + point[0], shape.y + shape.height / 2 + point[1]];
}

// Map an existing binding point through a node move/resize, including rotated nodes.
function moveEndpoint(point: number[], before: CanvasElement, after: CanvasElement, fixedPoint?: number[]): number[] {
  const local = rotate(point[0] - before.x - before.width / 2, point[1] - before.y - before.height / 2, -(before.angle ?? 0));
  const relative = fixedPoint ?? [local[0] / (before.width || 1) + 0.5, local[1] / (before.height || 1) + 0.5];
  const moved = rotate((relative[0] - 0.5) * after.width, (relative[1] - 0.5) * after.height, after.angle ?? 0);
  return [after.x + after.width / 2 + moved[0], after.y + after.height / 2 + moved[1]];
}

export function addCanvasElements(value: unknown): Record<string, unknown> {
  const incoming = batch(value, 'elements');
  const existing = currentElements();
  const existingById = new Map(existing.map((element) => [element.id, element]));
  const occupied = new Set(getAPI().getSceneElementsIncludingDeleted().map((element: CanvasElement) => element.id));
  const ids = new Map<string, string>();
  for (const raw of incoming) {
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 128 || ids.has(raw.id)) throw new Error('元素 id 无效或重复');
    if (!ALLOWED_TYPES.has(raw.type)) throw new Error(`不支持的元素类型：${raw.type}`);
    let id = raw.id;
    while (occupied.has(id)) id = `${raw.id}-${nanoid(6)}`;
    occupied.add(id);
    ids.set(raw.id, id);
  }
  const mapped = (id: string) => ids.get(id) ?? id;
  const skeletons = incoming.map((raw) => {
    const element: any = { roughness: 0, ...safePatch(raw), id: mapped(raw.id), type: raw.type };
    if (raw.type !== 'frame' && (!finite(raw.x) || !finite(raw.y))) throw new Error(`元素 ${raw.id} 缺少有效 x/y`);
    if (raw.type === 'text' && typeof raw.text !== 'string') throw new Error(`文字元素 ${raw.id} 缺少 text`);
    if (raw.type === 'frame') {
      if (!Array.isArray(raw.children) || !raw.children.every((id: unknown) => typeof id === 'string' && ids.has(id))) throw new Error('frame.children 必须引用同批元素');
      element.children = raw.children.map(mapped);
    }
    if (raw.label !== undefined) {
      if (!['rectangle', 'ellipse', 'diamond', 'arrow'].includes(raw.type) || !raw.label || typeof raw.label.text !== 'string') throw new Error('label 需要 text 且只能用于形状或箭头');
      element.label = { fontSize: 20, ...safePatch({ ...raw.label, id: '' }) };
    }
    if (element.containerId) element.containerId = mapped(element.containerId);
    if (element.frameId) element.frameId = mapped(element.frameId);
    if (element.boundElements) element.boundElements = element.boundElements.map((ref: any) => ({ ...ref, id: mapped(ref.id) }));
    for (const field of ['start', 'end']) {
      if (raw[field] === undefined) continue;
      if (raw.type !== 'arrow' || !raw[field] || typeof raw[field].id !== 'string') throw new Error(`${field} 需要元素 id`);
      element[field] = { id: mapped(raw[field].id) };
    }
    for (const field of ['startBinding', 'endBinding']) {
      if (element[field]) element[field] = { ...element[field], elementId: mapped(element[field].elementId) };
    }
    return element;
  });
  const measuredShapes = convertToExcalidrawElements(skeletons.filter((element) => ['rectangle', 'ellipse', 'diamond'].includes(element.type)) as any, { regenerateIds: false });
  const byId = new Map([...existing, ...skeletons, ...measuredShapes].map((element) => [element.id, element]));
  const targets = new Map<string, CanvasElement>();
  for (const element of skeletons) {
    for (const field of ['start', 'end']) {
      const id = element[field]?.id;
      if (!id) continue;
      const target = byId.get(id);
      if (!target || !['rectangle', 'ellipse', 'diamond'].includes(target.type)) throw new Error(`箭头目标 ${id} 不是有效形状`);
      if (existingById.has(id)) targets.set(id, target);
    }
    for (const id of [element.containerId, element.frameId, element.startBinding?.elementId, element.endBinding?.elementId]) {
      if (id && !byId.has(id)) throw new Error(`引用的元素 ${id} 不存在`);
    }
    if (element.type === 'arrow' && element.start && element.end && !element.points) {
      if (element.start.id === element.end.id) throw new Error('自连接箭头需要显式提供绕行 points');
      const start = byId.get(element.start.id)!;
      const end = byId.get(element.end.id)!;
      const from = outlinePoint(start, end);
      const to = outlinePoint(end, start);
      Object.assign(element, { x: from[0], y: from[1], points: [[0, 0], [to[0] - from[0], to[1] - from[1]]] });
    }
  }
  assertIdle(new Set(targets.keys()));
  // Include referenced existing shapes only as converter context; keep their original geometry and labels.
  const converted: CanvasElement[] = convertToExcalidrawElements([...targets.values(), ...skeletons] as any, { regenerateIds: false });
  const byInputId = new Map(skeletons.map((element) => [element.id, element]));
  const created = converted.filter((element) => !targets.has(element.id)).map((element) => {
    const input = byInputId.get(element.id);
    return { ...element, ...(input?.containerId ? { containerId: input.containerId } : {}),
      ...(input?.startBinding ? { startBinding: input.startBinding } : {}), ...(input?.endBinding ? { endBinding: input.endBinding } : {}) };
  });
  // Generated label IDs also must not collide with an existing scene element.
  if (created.some((element) => existingById.has(element.id))) throw new Error('生成的元素 id 冲突，请重试');
  commit([...existing, ...created]);
  return { created: created.map((element) => element.id), idMap: Object.fromEntries(ids), saved: false };
}

export function updateCanvasElements(value: unknown): Record<string, unknown> {
  const updates = batch(value, 'elements');
  const previous = currentElements();
  const byId = new Map(previous.map((element) => [element.id, element]));
  const patches = new Map<string, any>();
  for (const raw of updates) {
    const element = byId.get(raw?.id);
    if (!element) throw new Error(`元素 ${raw?.id} 不存在`);
    if (raw.version !== undefined && raw.version !== element.version) throw new Error(`元素 ${element.id} 版本已变化，请重新读取`);
    const patch = safePatch(raw);
    if (!Object.keys(patch).length) throw new Error(`元素 ${element.id} 没有有效更新字段`);
    if (element.type !== 'text' && typeof patch.text === 'string') {
      const textId = labelId(element);
      if (!textId) throw new Error(`元素 ${element.id} 没有标签，请新增绑定文字`);
      patches.set(textId, { ...patches.get(textId), text: patch.text, originalText: patch.text });
      delete patch.text;
    }
    if (element.type === 'text' && typeof patch.text === 'string') patch.originalText = patch.text;
    patches.set(element.id, { ...patches.get(element.id), ...patch });
  }
  const next = new Map(previous.map((element) => [element.id, { ...element, ...patches.get(element.id) }]));
  for (const element of next.values()) {
    for (const id of [element.containerId, element.frameId, element.startBinding?.elementId, element.endBinding?.elementId]) {
      if (id && !next.has(id)) throw new Error(`引用的元素 ${id} 不存在`);
    }
  }
  const geometryChanged = () => new Set(previous.filter((element) => ['x', 'y', 'width', 'height', 'angle', 'points'].some((field) => element[field] !== next.get(element.id)?.[field])).map((element) => element.id));
  const refreshText = (id: string) => {
    const text = next.get(id);
    if (!text || text.type !== 'text') return;
    const container = next.get(text.containerId);
    const label = { ...text, text: text.originalText ?? text.text };
    const skeleton = container ? { ...container, boundElements: (container.boundElements ?? []).filter((ref: any) => ref.type !== 'text'), label } : label;
    const converted: CanvasElement[] = convertToExcalidrawElements([skeleton] as any, { regenerateIds: false });
    const measured = converted.find((element) => element.id === id);
    if (measured) next.set(id, { ...text, ...measured, ...(!container ? { x: text.x, y: text.y } : {}) });
    if (container) {
      const measuredContainer = converted.find((element) => element.id === container.id)!;
      next.set(container.id, { ...container, width: measuredContainer.width, height: measuredContainer.height });
    }
  };
  const moved = geometryChanged();
  for (const element of previous) if (element.type === 'text' && (patches.has(element.id) || moved.has(element.containerId))) refreshText(element.id);
  const changedGeometry = geometryChanged();
  for (const element of previous) {
    if (element.type !== 'arrow' || patches.get(element.id)?.points) continue;
    const points = element.points.map((p: number[]) => [...p]);
    let changed = false;
    for (const [field, index] of [['startBinding', 0], ['endBinding', points.length - 1]] as const) {
      const binding = element[field];
      if (!binding || !changedGeometry.has(binding.elementId)) continue;
      if (element.angle || element.elbowed) throw new Error(`折线或旋转箭头 ${element.id} 需要显式更新 points`);
      points[index] = moveEndpoint([element.x + points[index][0], element.y + points[index][1]], byId.get(binding.elementId)!, next.get(binding.elementId)!, binding.fixedPoint).map((v, axis) => v - (axis ? element.y : element.x));
      changed = true;
    }
    if (changed) {
      // ponytail: preserve interior waypoints; explicit points are needed to reroute complex paths.
      const [dx, dy] = points[0];
      next.set(element.id, { ...next.get(element.id)!, x: element.x + dx, y: element.y + dy,
        points: points.map(([x, y]: number[]) => [x - dx, y - dy]), width: Math.max(...points.map((p: number[]) => p[0])) - Math.min(...points.map((p: number[]) => p[0])), height: Math.max(...points.map((p: number[]) => p[1])) - Math.min(...points.map((p: number[]) => p[1])) });
      if (labelId(element)) refreshText(labelId(element)!);
    }
  }
  const changedIds = new Set<string>();
  const result = previous.map((element) => {
    const candidate = next.get(element.id)!;
    if (JSON.stringify(element) === JSON.stringify(candidate)) return element;
    changedIds.add(element.id);
    // Excalidraw next honors updates.version/versionNonce; an entire cloned
    // element still contains the old values, so let newElementWith regenerate them.
    const updates = { ...candidate };
    delete updates.version;
    delete updates.versionNonce;
    delete updates.updated;
    return newElementWith(element as any, updates);
  });
  assertIdle(changedIds);
  commit(result);
  return { updated: Array.from(changedIds), saved: false };
}

export function deleteCanvasElements(value: unknown): Record<string, unknown> {
  const ids = batch(value, 'ids');
  if (!ids.every((id) => typeof id === 'string')) throw new Error('ids 必须为字符串数组');
  const elements = currentElements();
  const allIds = new Set(elements.map((element) => element.id));
  const deleted = new Set<string>(ids);
  if (ids.some((id) => !allIds.has(id))) throw new Error('待删除元素已变化，请重新读取画布');
  for (const element of elements) if (element.type === 'text' && deleted.has(element.containerId)) deleted.add(element.id);
  const affected = new Set(deleted);
  const remaining = elements.filter((element) => !deleted.has(element.id)).map((element) => {
    const patch: any = {};
    if (deleted.has(element.frameId)) patch.frameId = null;
    for (const field of ['startBinding', 'endBinding']) if (deleted.has(element[field]?.elementId)) patch[field] = null;
    if (!Object.keys(patch).length) return element;
    affected.add(element.id);
    return newElementWith(element as any, patch);
  });
  assertIdle(affected);
  commit(remaining);
  return { deleted: Array.from(deleted), saved: false };
}

export function handleAgentCanvasCommand(action: string, payload: Record<string, any>): Record<string, unknown> {
  if (!getAPI()) throw new Error('Excalidraw 画布尚未就绪');
  const canvasId = new URLSearchParams(location.search).get('imageURL');
  if (payload.canvasId && payload.canvasId !== canvasId) throw new Error('目标画布已变化，请重新读取');
  if (action !== 'read' && payload.canvasId !== canvasId) throw new Error('写操作必须提供读取时返回的 canvasId');
  if (action === 'align') return alignAgentElements(payload as any);
  if (action === 'distribute') return distributeAgentElements(payload as any);
  if (action === 'group') return groupAgentElements(payload as any);
  if (action === 'ungroup') return ungroupAgentElements(payload as any);
  if (action === 'duplicate') return duplicateAgentElements(payload as any);
  if (action === 'add') return addCanvasElements(payload.elements);
  if (action === 'update') return updateCanvasElements(payload.elements);
  if (action === 'delete') return deleteCanvasElements(payload.ids);
  const elements = currentElements();
  const state = getAPI().getAppState();
  const ids = Array.isArray(payload.ids) && payload.ids.length ? new Set(payload.ids) : null;
  if (action === 'viewport') {
    const targets = ids ? elements.filter((element) => ids.has(element.id)) : elements;
    if (!targets.length) throw new Error('没有可定位的元素');
    getAPI().scrollToContent(targets, { fitToContent: true, animate: true });
    return { focused: targets.map((element) => element.id) };
  }
  if (action !== 'read') throw new Error(`未知画布操作：${action}`);
  const byId = new Map(elements.map((element) => [element.id, element]));
  const filtered = elements.filter((element) => (!ids || ids.has(element.id)) && (!payload.selectedOnly || state.selectedElementIds?.[element.id]));
  const offset = finite(payload.offset, 0) ? Math.floor(payload.offset) : 0;
  const limit = finite(payload.limit, 1, 250) ? Math.floor(payload.limit) : 150;
  const summaryFields = payload.detail === 'full'
    ? ['id', 'type', 'version', 'x', 'y', 'width', 'height', 'angle', 'text', 'originalText', 'fontSize', 'fontFamily', 'textAlign', 'verticalAlign', 'strokeColor', 'backgroundColor', 'strokeStyle', 'strokeWidth', 'fillStyle', 'opacity', 'roughness', 'containerId', 'boundElements', 'startBinding', 'endBinding', 'points', 'elbowed', 'frameId', 'groupIds', 'name', 'link', 'locked']
    : ['id', 'type', 'version', 'x', 'y', 'width', 'height', 'text', 'fontSize', 'containerId', 'frameId', 'name'];
  return { canvasId, count: filtered.length, offset, nextOffset: offset + limit < filtered.length ? offset + limit : null,
    bounds: elements.length ? getCommonBounds(elements as any) : null,
    viewBackgroundColor: state.viewBackgroundColor, theme: state.theme,
    elements: filtered.slice(offset, offset + limit).map((element) => ({ ...Object.fromEntries(summaryFields.filter((key) => key in element).map((key) => [key, element[key]])),
      ...(payload.detail !== 'full' && element.type === 'arrow' ? { startId: element.startBinding?.elementId ?? null, endId: element.endBinding?.elementId ?? null } : {}),
      ...(labelId(element) ? { labelId: labelId(element), text: byId.get(labelId(element)!)?.text } : {}), selected: state.selectedElementIds?.[element.id] === true })) };
}

