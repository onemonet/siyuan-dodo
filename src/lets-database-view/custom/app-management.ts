import { postJson } from "../../shared/av/kernel-api";
import { DATABASE_VIEWS_ATTR } from "../view-config-schema";
import { DatabaseViewConfigStore } from "../view-config-store";
import { assertAppId, moveCustomAppToTrash,
  permanentlyRemoveTrashedCustomApp, restoreTrashedCustomApp } from "./storage";

const PAGE = 500;
const MAX_SCAN = 200000;
const APP_IDS = /app-[0-9a-f]{8}-[0-9a-f-]{27}/g;
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;

export interface CustomAppReference {
  blockId: string;
  viewId: string;
  mode: string;
}
export interface CustomAppReferenceScan {
  byApp: Record<string, CustomAppReference[]>;
  scannedBlocks: number;
  /** SQL indexes only the blocks SiYuan currently makes available. */
  source: "SiYuan SQL attributes index";
}

/**
 * Search every indexed database's custom-dodo-views attribute. It is not
 * enough to inspect visible AVs: switching back to table leaves the app
 * referenced for re-enabling, and another tab/notebook may still need it.
 */
export async function scanCustomAppReferences(): Promise<CustomAppReferenceScan> {
  const byApp: Record<string, CustomAppReference[]> = Object.create(null);
  const add = (appId:string,ref:CustomAppReference):void => {
    const list = (byApp[appId] ||= []);
    if (!list.some(item => item.blockId === ref.blockId &&
      item.viewId === ref.viewId && item.mode === ref.mode)) list.push(ref);
  };
  let offset = 0;
  for (;;) {
    const stmt = `SELECT block_id, value FROM attributes WHERE name = '${DATABASE_VIEWS_ATTR}' ORDER BY block_id LIMIT ${PAGE} OFFSET ${offset}`;
    const result = await postJson<Array<{block_id:string;value:string}>>("/api/query/sql",{stmt});
    if (!Array.isArray(result)) throw new Error("思源未返回有效的属性索引，已停止应用清理");
    for (const item of result) {
      if (!item || !BLOCK_ID.test(item.block_id) || typeof item.value !== "string")
        throw new Error("数据库引用记录存在异常，无法安全判断未使用应用");
      let doc: unknown;
      try { doc = JSON.parse(item.value); }
      catch { throw new Error("部分数据库视图配置损坏，无法安全清理应用"); }
      if (!doc || typeof doc !== "object" || Array.isArray(doc))
        throw new Error("数据库视图引用格式异常，已停止清理");
      const views = (doc as {views?:Record<string,unknown>}).views || {};
      // In addition to current schema, match every app ID found in the raw
      // attribute so future/older configs never silently become orphans.
      const ids = new Set(item.value.match(APP_IDS) || []);
      for (const appId of ids) {
        const refs: CustomAppReference[] = [];
        if (views && typeof views === "object" && !Array.isArray(views)) {
          for (const [viewId, raw] of Object.entries(views)) {
            const entry = raw as {mode?:string;configs?:{custom?:{appId?:string}}};
            if (entry?.configs?.custom?.appId === appId)
              refs.push({blockId:item.block_id,viewId,mode:entry.mode || "unknown"});
          }
        }
        // Never classify an unknown or future config as an orphan.
        if (!refs.length) refs.push({blockId:item.block_id,viewId:"",mode:"unknown"});
        for (const ref of refs) add(appId,ref);
      }
    }
    offset += result.length;
    if (result.length < PAGE) break;
    if (offset >= MAX_SCAN) throw new Error("数据库索引太大，清理引用扫描未完成");
  }
  // SQL indexing may lag behind a freshly modified database; re-check the
  // currently mounted AV blocks through the authoritative native block attrs.
  // Even a transient read error must fail closed instead of allowing deletion.
  if (typeof document !== "undefined") {
    const opened = new Set(Array.from(
      document.querySelectorAll<HTMLElement>(".av[data-node-id][data-av-id]"))
      .map(av => av.dataset.nodeId || "").filter(id => BLOCK_ID.test(id)));
    for (const blockId of opened) {
      const doc = await DatabaseViewConfigStore.load(blockId);
      for (const [viewId,entry] of Object.entries(doc.views)) {
        const appId = entry.configs.custom?.appId;
        if (!appId || !/^app-[0-9a-f]{8}-[0-9a-f-]{27}$/.test(appId)) continue;
        add(appId,{blockId,viewId,mode:entry.mode});
      }
    }
  }
  return {byApp,scannedBlocks:offset,source:"SiYuan SQL attributes index"};
}

export async function moveUnusedCustomAppToTrash(appId: string): Promise<void> {
  assertAppId(appId);
  const scan = await scanCustomAppReferences(); // recheck immediately before moving
  const refs = scan.byApp[appId] || [];
  if (refs.length)
    throw new Error(`应用仍被 ${refs.length} 个数据库视图引用，已阻止删除。先在管理器解除不再需要的关联。`);
  await moveCustomAppToTrash(appId);
}

/** Release only dormant bindings (table/map/etc), never a live custom view. */
export async function detachInactiveCustomAppReferences(appId: string): Promise<number> {
  assertAppId(appId);
  const scan = await scanCustomAppReferences();
  const refs = scan.byApp[appId] || [];
  if (!refs.length) return 0;
  if (refs.some(ref => !BLOCK_ID.test(ref.viewId) || ref.mode === "unknown" ||
      ref.mode === "custom"))
    throw new Error("应用仍在使用，或引用信息不完整；不能自动解除关联。");
  const grouped = new Map<string,string[]>();
  for (const {blockId,viewId} of refs)
    grouped.set(blockId,[...new Set([...(grouped.get(blockId) || []),viewId])]);
  let count = 0;
  for (const [blockId,viewIds] of grouped) {
    await DatabaseViewConfigStore.update(blockId,doc => {
      for (const id of viewIds) {
        const entry = doc.views[id];
        if (!entry || entry.mode === "custom" || entry.configs.custom?.appId !== appId)
          throw new Error("数据库引用已发生变化，请刷新管理器重试");
      }
      for (const id of viewIds) {
        const { custom: discarded, ...remaining } = doc.views[id].configs;
        doc.views[id] = {...doc.views[id], configs:remaining};
        count++;
      }
    });
  }
  return count;
}

export async function restoreCustomAppFromTrash(appId: string): Promise<void> {
  await restoreTrashedCustomApp(assertAppId(appId));
}

/** Only explicit second-stage trash cleanup can permanently remove files. */
export async function purgeCustomAppFromTrash(appId: string): Promise<void> {
  assertAppId(appId);
  const scan = await scanCustomAppReferences();
  if (scan.byApp[appId]?.length)
    throw new Error("有数据库仍引用这个已回收应用，不能彻底删除，请先恢复或解除关联。");
  await permanentlyRemoveTrashedCustomApp(appId);
}
