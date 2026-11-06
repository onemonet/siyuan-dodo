import { request } from "../../api";
import { postJson } from "../../shared/av/kernel-api";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const NEW_NAME = "AI 自定义视图";

interface NativeViews { av?: { id?: string; views?: Array<{id?: string}> } }

function nativeNewViewId(): string {
  const id = (window as typeof window & { Lute?: { NewNodeID?: () => string } }).Lute?.NewNodeID?.();
  if (!id || !ID.test(id)) throw new Error("无法生成思源原生视图 ID。");
  return id;
}

async function nativeViewIDs(avID: string): Promise<Set<string>> {
  const data = await postJson<NativeViews>("/api/av/getAttributeView", { id: avID });
  if (data?.av?.id !== avID || !Array.isArray(data.av.views) ||
      data.av.views.some(view => !view?.id || !ID.test(view.id)))
    throw new Error("无法确认原生数据库视图列表，已取消 AI 视图创建。");
  return new Set(data.av.views.map(view => view.id!));
}

/**
 * Add a distinct *native* SiYuan table view. Never convert the source view.
 * SiYuan's addAttrViewView transaction also creates its visible tab and selects
 * it; custom mode is configured only on the newly generated native viewId.
 */
export async function createNativeCustomView(blockId: string, avID: string, sourceViewId: string): Promise<string> {
  if (![blockId, avID, sourceViewId].every(id => ID.test(id))) throw new Error("数据库身份不合法。");
  const before = await nativeViewIDs(avID);
  if (!before.has(sourceViewId)) throw new Error("原视图已不存在，无法创建 AI 自定义视图。");
  const id = nativeNewViewId();
  if (before.has(id)) throw new Error("新视图 ID 冲突，已取消创建。");
  // Use the same undoable transaction as SiYuan's native '+' tab button.
  const context = {avID, blockID: blockId, id, layout: "table", name: NEW_NAME};
  await request("/api/transactions", {
    reqId: Date.now(),
    transactions: [{ doOperations: [{ action: "addAttrViewView", ...context }],
      undoOperations: [{ action: "removeAttrViewView", ...context }] }],
  });
  const after = await nativeViewIDs(avID);
  if (!after.has(id) || ![...before].every(existingId => after.has(existingId)))
    throw new Error("原生视图创建后的校验失败，未修改旧视图配置；请检查思源数据库标签。");
  return id;
}
