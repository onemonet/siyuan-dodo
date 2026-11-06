import type { FieldMappingDefinition } from "./field-mapping-types";

const AV_NODE_ID = /^\d{14}-[a-z0-9]{7}$/;
const CREATE_TYPES = new Set([
  "text", "number", "date", "select", "mSelect", "url", "email", "phone",
  "location", "mAsset", "template", "checkbox",
]);
const inFlight = new Set<string>();

/** Primary block fields are not creatable; use the first supported alternative. */
export function newFieldType(accepted?: readonly string[]): string | null {
  return accepted?.find(type => CREATE_TYPES.has(type)) || null;
}

export function newFieldName(label: string, names: readonly string[]): string {
  const base = label.trim() || "新字段";
  if (!names.includes(base)) return base;
  let index = 2;
  while (names.includes(base + " " + index)) index++;
  return base + " " + index;
}

export interface CreateAvFieldArgs {
  avID: string;
  blockID: string;
  /** In native database views use the selected view's real ID for column ordering. */
  viewID?: string;
  field: FieldMappingDefinition;
  existingNames: readonly string[];
}

/** Explicit click-only mutation: creates an actual database key and returns its stable ID. */
export async function createAvField(args: CreateAvFieldArgs): Promise<{ id: string; name: string; type: string }> {
  const { avID, blockID, viewID, field, existingNames } = args;
  const type = newFieldType(field.acceptedTypes);
  if (!type) throw new Error("该字段类型不支持自动创建，请在数据库中手动添加。");
  if (!AV_NODE_ID.test(avID) || !AV_NODE_ID.test(blockID)) {
    throw new Error("无法确定来源数据库，请先绑定数据库。");
  }
  const generator = (window as typeof window & { Lute?: { NewNodeID?: () => string } }).Lute?.NewNodeID;
  if (!generator) throw new Error("思源字段 ID 生成器不可用，请刷新思源后再试。");
  const guard = avID + ":" + field.key;
  if (inFlight.has(guard)) throw new Error("字段正在创建中，请稍候。");
  inFlight.add(guard);
  try {
    // SiYuan inserts at the FIRST table column if previousKeyID is empty.
    // Read the selected view's actual columns just before creation: callers'
    // cached mappings may include virtual ':end' date columns or stale ordering.
    const renderResponse = await fetch("/api/av/renderAttributeView", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: avID, blockID, ...(viewID ? { viewID } : {}),
        page: 1, pageSize: 1 }),
    });
    if (!renderResponse.ok) throw new Error("读取数据库列顺序失败：HTTP " + renderResponse.status);
    const rendered = await renderResponse.json() as {
      code?: number; msg?: string;
      data?: { view?: { columns?: Array<{ id?: string; name?: string }> } };
    };
    if (rendered.code !== 0) throw new Error(rendered.msg || "读取数据库列顺序失败。");
    const columns = rendered.data?.view?.columns;
    const realKeys = Array.isArray(columns)
      ? columns.filter(column => AV_NODE_ID.test(column?.id || ""))
      : [];
    // Never fall back to "" when ordering is unavailable: it would prepend.
    if (!realKeys.length) throw new Error("无法确定数据库末尾字段，已取消创建，请刷新视图后重试。");
    const previousKeyID = realKeys[realKeys.length - 1].id as string;
    const id = generator();
    if (!AV_NODE_ID.test(id)) throw new Error("无法生成有效的数据库字段 ID。");
    const name = newFieldName(field.label, [
      ...existingNames, ...realKeys.map(column => column.name || ""),
    ]);
    const response = await fetch("/api/av/addAttributeViewKey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avID, blockID, keyID: id, keyName: name,
        keyType: type, keyIcon: "", previousKeyID }),
    });
    if (!response.ok) throw new Error("创建字段失败：HTTP " + response.status);
    const result = await response.json() as { code?: number; msg?: string };
    if (result.code !== 0) throw new Error(result.msg || "创建数据库字段失败。");
    return { id, name, type };
  } finally {
    inFlight.delete(guard);
  }
}