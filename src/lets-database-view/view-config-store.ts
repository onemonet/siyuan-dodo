import { getBlockAttrs, setBlockAttrs } from "../api";
import { DATABASE_VIEWS_ATTR, readDatabaseViewDocument, type DatabaseViewDocument, type StoredDatabaseView } from "./view-config-schema";
export { DATABASE_VIEWS_ATTR, DATABASE_VIEWS_SCHEMA, readDatabaseViewDocument, activeMapConfigs, activeVisualConfigs } from "./view-config-schema";
export type { ViewMode } from "./view-config-schema";

/**
 * Single source of truth for Dodo native database view configuration.
 * Serialized per block across all three renderers. No migration or fallbacks
 * for the former per-type attributes.
 */
const ID = /^\d{14}-[a-z0-9]{7}$/;
export class DatabaseViewConfigStore {
  private static readonly pending = new Map<string, Promise<unknown>>();
  private static readonly listeners = new Set<(blockId: string, document: DatabaseViewDocument) => void>();

  static subscribe(listener: (blockId: string, document: DatabaseViewDocument) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  static async load(blockId: string): Promise<DatabaseViewDocument> {
    const previous = this.pending.get(blockId);
    if (previous) await previous.catch(() => {});
    const attrs = await getBlockAttrs(blockId);
    return readDatabaseViewDocument(attrs[DATABASE_VIEWS_ATTR]);
  }

  static async update<T>(
    blockId: string,
    action: (data: DatabaseViewDocument) => T | Promise<T>,
  ): Promise<{ document: DatabaseViewDocument; result: T }> {
    if (!ID.test(blockId)) throw new Error("数据库块 ID 无效。");
    const previous = this.pending.get(blockId);
    const task = (async () => {
      if (previous) await previous.catch(() => {});
      const attrs = await getBlockAttrs(blockId);
      const document = readDatabaseViewDocument(attrs[DATABASE_VIEWS_ATTR]);
      const result = await action(document);
      await setBlockAttrs(blockId, { [DATABASE_VIEWS_ATTR]: JSON.stringify(document) });
      for (const listener of this.listeners) {
        // A renderer failure must not turn a committed configuration into a failed save.
        try { listener(blockId, document); }
        catch (error) { console.warn("[Dodo 数据库视图] 配置更新通知失败", error); }
      }
      return { document, result };
    })();
    this.pending.set(blockId, task);
    try { return await task; }
    finally { if (this.pending.get(blockId) === task) this.pending.delete(blockId); }
  }

  static async updateView(
    blockId: string, viewId: string,
    action: (entry: StoredDatabaseView) => StoredDatabaseView,
  ): Promise<DatabaseViewDocument> {
    if (!ID.test(viewId)) throw new Error("数据库视图 ID 无效。");
    const { document } = await this.update(blockId, doc => {
      doc.views[viewId] = action(doc.views[viewId] || { mode: "table", configs: {} });
    });
    return document;
  }
}

