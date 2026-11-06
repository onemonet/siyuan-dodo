import { databaseViewHost } from "./view-host";

export type DatabaseWriteKind = "map" | "gantt" | "calendar" | "custom";
export type DatabaseWriteAction = "create" | "correct" | "delete" | "dates" | "progress" | "cell";

export interface DatabaseWriteEvent {
  blockId: string;
  viewId: string;
  kind: DatabaseWriteKind;
  action: DatabaseWriteAction;
  itemId?: string;
}

/** Serialize mutations of the same AV block across renderers and split panes.
 * The native AV remains authoritative; this is coordination, not a cache.
 * Only confirmed successful mutations emit committed notifications.
 */
export class DatabaseViewWriteCoordinator {
  private readonly pending = new Set<string>();
  private readonly listeners = new Set<(event: DatabaseWriteEvent) => void>();

  isPending(blockId: string): boolean { return this.pending.has(blockId); }

  subscribe(listener: (event: DatabaseWriteEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async run<T>(event: DatabaseWriteEvent, operation: () => Promise<T>): Promise<T> {
    if (!event.blockId || !event.viewId) throw new Error("缺少数据库写入上下文。");
    if (this.pending.has(event.blockId)) throw new Error("当前数据库正在保存其他修改，请稍后重试。");
    this.pending.add(event.blockId);
    try {
      const result = await operation();
      databaseViewHost.invalidateBlock(event.blockId);
      for (const listener of Array.from(this.listeners)) {
        try { listener(event); }
        catch (error) { console.warn("[Dodo 数据库视图] 写后通知失败", error); }
      }
      return result;
    } finally {
      this.pending.delete(event.blockId);
    }
  }
}
export const databaseViewWrites = new DatabaseViewWriteCoordinator();
