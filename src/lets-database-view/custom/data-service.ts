import { renderAttributeView, postJson } from "../../shared/av/kernel-api";
import type { AvRenderData } from "../../shared/av/av-data-adapter";
import { normalizeAvRender, AV_NODE_ID } from "../../shared/av/av-normalized";
import { databaseViewWrites } from "../core/view-write-coordinator";
import { openMapItem } from "../map/open-map-item";

const ID = /^\d{14}-[a-z0-9]{7}$/;
/** SiYuan's "全部" setting is 102400. Use bounded HTTP chunks for it. */
export const CUSTOM_NATIVE_ALL_SIZE = 102400;
export const CUSTOM_ALL_BATCH_SIZE = 100;
export interface CustomDatabaseContext {
  avID: string;
  blockId: string;
  viewId: string;
  search: string;
}
export interface CustomField { id: string; name: string; type: string; icon?: string }
export interface CustomRecord {
  id: string;
  blockId: string;
  valueId: string;
  values: Record<string, unknown>;
  /** Plain text for filters, labels and tooltips, without losing typed values. */
  displayValues: Record<string, string>;
  /** Extra information such as select colors, relation titles and rollup entries. */
  valueDetails: Record<string, unknown>;
}

function ensureContext(ctx: CustomDatabaseContext): void {
  if (![ctx.avID, ctx.blockId, ctx.viewId].every(id => ID.test(id)))
    throw new Error("自定义视图的数据库身份无效。");
}

async function render(ctx: CustomDatabaseContext, page: number, pageSize: number): Promise<AvRenderData> {
  ensureContext(ctx);
  return renderAttributeView({ id: ctx.avID, blockID: ctx.blockId, viewID: ctx.viewId,
    page, pageSize, query: ctx.search });
}
/** The SDK and all other views share the same typed AV data standard. */
function fields(raw: AvRenderData): CustomField[] {
  return normalizeAvRender(raw).fields.filter(field=>AV_NODE_ID.test(field.id));
}
function records(raw: AvRenderData): CustomRecord[] {
  const native=normalizeAvRender(raw);
  const schema=native.fields.filter(field=>AV_NODE_ID.test(field.id));
  return native.records.filter(row=>AV_NODE_ID.test(row.itemId)).map(row=>({
    id:row.itemId, blockId:row.blockId, valueId:row.valueId,
    values:Object.fromEntries(schema.map(field=>[field.id,
      row.cells[field.id]?.value ?? null])),
    displayValues:Object.fromEntries(schema.map(field=>[field.id,
      row.cells[field.id]?.display || ""])),
    valueDetails:Object.fromEntries(schema.map(field=>[field.id,
      row.cells[field.id]?.details ?? null])),
  }));
}

function nativePageSize(raw: AvRenderData): number {
  const size = raw.view?.pageSize;
  return typeof size === "number" && Number.isInteger(size) && size > 0
    ? size : 50;
}
function batchSize(nativeSize: number): number {
  // "全部" means no total-record cap, not one enormous response / DOM.
  return nativeSize >= CUSTOM_NATIVE_ALL_SIZE
    ? CUSTOM_ALL_BATCH_SIZE : Math.min(nativeSize, CUSTOM_ALL_BATCH_SIZE);
}

export async function getCustomSchema(ctx: CustomDatabaseContext) {
  const raw = await render(ctx, 1, 1);
  const pageSize = nativePageSize(raw);
  return { avID: ctx.avID, blockId: ctx.blockId, viewId: ctx.viewId,
    name: raw.name || raw.view?.name || "思源数据库", fields: fields(raw),
    pageSize, batchSize: batchSize(pageSize),
    all: pageSize >= CUSTOM_NATIVE_ALL_SIZE };
}
export async function listCustomRecords(ctx: CustomDatabaseContext, args: Record<string, unknown> = {}) {
  const page = Number.isInteger(args.page) ? Math.max(1, Math.min(10000, Number(args.page))) : 1;
  // Native pageSize is the sole source of truth. Ignore legacy HTML-supplied
  // pageSize so two pages cannot accidentally use conflicting batch sizes.
  const metadata = await render(ctx, 1, 1);
  const nativeSize = nativePageSize(metadata);
  const pageSize = batchSize(nativeSize);
  const raw = await render(ctx, page, pageSize);
  if (nativePageSize(raw) !== nativeSize)
    throw new Error("思源视图「条目数」已变化，请重新加载自定义页面。");
  const total = raw.view?.rowCount ?? 0;
  return { page, pageSize, nativePageSize: nativeSize,
    all: nativeSize >= CUSTOM_NATIVE_ALL_SIZE,
    total, hasMore: page * pageSize < total,
    records: records(raw), fields: fields(raw) };
}
export async function openCustomRecord(ctx: CustomDatabaseContext, recordId: string): Promise<{opened: boolean}> {
  if (!ID.test(recordId)) throw new Error("记录 ID 无效");
  // Validate membership against the *current native view*. Do not trust a
  // detached page's recordId to open arbitrary blocks.
  const raw = await render(ctx, 1, 10000);
  // Agent-generated HTML commonly uses siyuan://blocks/<bound document ID>,
  // whereas the normal SDK uses AV itemId. Both resolve to the same native row.
  const row = records(raw).find(item => item.id === recordId || item.blockId === recordId);
  if (!row) throw new Error("记录不在当前数据库视图中。");
  const primaryId = fields(raw).find(f => f.type === "block")?.id;
  const title = primaryId ? String(row.values[primaryId] || "数据库记录") : "数据库记录";
  await openMapItem({ blockId: row.blockId, itemId: row.id, valueId: row.valueId,
    avID: ctx.avID, databaseBlockID: ctx.blockId, title });
  return { opened: true };
}

/** Small allow-list for v1 editing. No arbitrary SQL or kernel endpoint access. */
function encodeWriteValue(type: string, value: unknown): Record<string, unknown> {
  if (type === "text" && typeof value === "string" && value.length <= 10000)
    return { type, text: { content: value } };
  if (type === "number" && typeof value === "number" && Number.isFinite(value))
    return { type, number: { content: value, isNotEmpty: true } };
  if (type === "checkbox" && typeof value === "boolean")
    return { type, checkbox: { checked: value } };
  throw new Error("当前仅支持写入文本、数字和复选框字段，且数值必须合法。");
}

export async function updateCustomCell(ctx: CustomDatabaseContext, args: Record<string, unknown>,
  writeAllowed: boolean): Promise<{updated: boolean}> {
  if (!writeAllowed) throw new Error("该页面尚未授权写入数据库，请在自定义视图设置中开启。");
  const { recordId, fieldId, value } = args;
  if (typeof recordId !== "string" || !ID.test(recordId) ||
      typeof fieldId !== "string" || !ID.test(fieldId)) throw new Error("记录或字段 ID 无效");
  return databaseViewWrites.run({blockId:ctx.blockId,viewId:ctx.viewId,kind:"custom",
    action:"cell",itemId:recordId}, async () => {
    const raw = await render(ctx, 1, 10000);
    const field = fields(raw).find(item => item.id === fieldId);
    if (!field || !records(raw).some(row => row.id === recordId))
      throw new Error("字段或记录不属于当前数据库视图，已停止写入。");
    const typed = encodeWriteValue(field.type, value);
    await postJson("/api/av/setAttributeViewBlockAttr",{
      avID:ctx.avID,keyID:fieldId,itemID:recordId,value:typed,
    });
    return { updated: true };
  });
}

export async function createCustomRecord(ctx: CustomDatabaseContext, args: Record<string, unknown>,
  writeAllowed: boolean): Promise<{created: boolean; recordId: string}> {
  if (!writeAllowed) throw new Error("该页面尚未授权写入数据库，请在自定义视图设置中开启。");
  const values = args.values;
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("需要传入 values 对象");
  const entries = Object.entries(values).filter(([id]) => ID.test(id));
  if (entries.length > 30 || entries.length !== Object.keys(values).length)
    throw new Error("字段数量过多或字段 ID 无效。");
  return databaseViewWrites.run({blockId:ctx.blockId,viewId:ctx.viewId,kind:"custom",
    action:"create"}, async () => {
    const raw = await render(ctx, 1, 1);
    const schema = fields(raw);
    const primary = schema.find(field => field.type === "block");
    const title = primary ? values[primary.id] : "";
    if (typeof title !== "string" || !title.trim() || title.length > 300)
      throw new Error("新增记录必须提供非空且不超过 300 字符的主键标题。");
    const changes = entries.filter(([id]) => id !== primary?.id)
      .map(([id, value]) => {
        const field = schema.find(col => col.id === id);
        if (!field) throw new Error("包含不属于当前视图的字段");
        return { id, value: encodeWriteValue(field.type, value) };
      });
    const recordId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
      + "-" + crypto.randomUUID().replace(/-/g, "").slice(0,7);
    await postJson("/api/av/addAttributeViewBlocks", {
      avID:ctx.avID,blockID:ctx.blockId,srcs:[{id:"",itemID:recordId,content:title,isDetached:true}],
    });
    // Do not retry create after a partial failure: the record is already real.
    for (const change of changes) {
      try { await postJson("/api/av/setAttributeViewBlockAttr",{
        avID:ctx.avID,keyID:change.id,itemID:recordId,value:change.value,
      }); } catch (e) {
        throw new Error(`已创建记录 ${recordId}，但字段写入失败：${e instanceof Error ? e.message : String(e)}。请在原生表格核对，勿重复创建。`);
      }
    }
    return { created: true, recordId };
  });
}
