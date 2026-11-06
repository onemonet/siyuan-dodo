import { postJson } from "../../shared/av/kernel-api";
import { databaseViewHost } from "./view-host";
import { DatabaseViewConfigStore } from "../view-config-store";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const MIN_CHECK_INTERVAL = 2500;
const PERIODIC_CHECK_INTERVAL = 30000;
const SETTLE_AFTER_CHANGE = 400;

interface NativeViewDefinition {
  id?: string;
}

/**
 * Read the authoritative set of native view IDs. DOM tabs are only a signal
 * that a view *might* have been deleted: transient re-renders and hidden tabs
 * must never be mistaken for a real native deletion.
 */
export async function nativeViewIDs(avID: string): Promise<Set<string>> {
  if (!ID.test(avID)) throw new Error("数据库 ID 无效，不能同步视图");
  const payload = await postJson<{av?:{id?:string;views?:NativeViewDefinition[]}}>(
    "/api/av/getAttributeView", {id:avID});
  const av = payload?.av;
  if (!av || av.id !== avID || !Array.isArray(av.views) || av.views.length < 1 ||
      av.views.some(view => !view || typeof view.id !== "string" || !ID.test(view.id))) {
    throw new Error("原生数据库视图列表不完整，跳过自定义属性清理");
  }
  return new Set(av.views.map(view => view.id!));
}

export type Settle = () => Promise<void>;
const defaultSettle: Settle = () => new Promise(resolve => setTimeout(resolve,SETTLE_AFTER_CHANGE));

/**
 * Clean only obsolete viewID keys inside custom-dodo-views. Never delete
 * source apps, pinned versions, or configuration for an existing native view.
 *
 * Verify missing IDs against two kernel reads and revalidate again inside
 * the serialized block-attribute write, so a momentary reload cannot erase
 * user-created Dodo settings.
 */
export async function reconcileDeletedNativeViews(
  blockId: string, avID: string, settle: Settle = defaultSettle,
): Promise<string[]> {
  if (!ID.test(blockId) || !ID.test(avID))
    throw new Error("数据库块 ID 或数据库 ID 无效，不能清理自定义属性");

  const before = await DatabaseViewConfigStore.load(blockId);
  const tracked = Object.keys(before.views).filter(id => ID.test(id));
  if (!tracked.length) return [];
  const initial = await nativeViewIDs(avID);
  const missing = tracked.filter(id => !initial.has(id));
  if (!missing.length) return [];
  await settle();
  const confirmed = await nativeViewIDs(avID);
  const obsolete = missing.filter(id => !confirmed.has(id));
  if (!obsolete.length) return [];

  const {result} = await DatabaseViewConfigStore.update(blockId,async doc => {
    const latest = await nativeViewIDs(avID);
    const removed: string[] = [];
    for (const id of obsolete) {
      if (latest.has(id) || !Object.prototype.hasOwnProperty.call(doc.views,id)) continue;
      delete doc.views[id];
      removed.push(id);
    }
    return removed;
  });
  return result;
}

/**
 * Lightweight observer: check when native AV tab identities change and
 * occasionally while an AV remains open. Disabled/hidden Dodo modes don't
 * count as deleted views. Host notifications are debounced and rate-limited.
 */
export class NativeDatabaseViewReconciler {
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private periodic: ReturnType<typeof setInterval> | null = null;
  private state = new Map<string,{signature:string;at:number}>();
  private inFlight = new Set<string>();
  private generation = 0;

  start(): void {
    if (this.unsubscribe) return;
    this.generation++;
    this.unsubscribe = databaseViewHost.subscribe({
      scan:()=>this.schedule(),
      changed:()=>this.schedule(),
      theme:()=>{},
    });
    this.periodic = setInterval(()=>this.schedule(),PERIODIC_CHECK_INTERVAL);
    this.schedule();
  }

  stop(): void {
    this.generation++;
    this.unsubscribe?.();
    this.unsubscribe=null;
    if (this.timer) clearTimeout(this.timer);
    if (this.periodic) clearInterval(this.periodic);
    this.timer=null;
    this.periodic=null;
    this.state.clear();
    this.inFlight.clear();
  }

  private schedule(): void {
    if (!this.unsubscribe || this.timer) return;
    this.timer=setTimeout(()=>{
      this.timer=null;
      if (this.unsubscribe) void this.scan();
    },600);
  }

  private async scan(): Promise<void> {
    const generation=this.generation;
    const now=Date.now();
    const visited=new Set<string>();
    for (const av of document.querySelectorAll<HTMLElement>(".av[data-av-id][data-node-id]")) {
      if (!av.isConnected) continue;
      const blockId=av.dataset.nodeId || "", avID=av.dataset.avId || "";
      if (!ID.test(blockId) || !ID.test(avID)) continue;
      const identity=blockId+":"+avID;
      if (visited.has(identity)) continue;
      visited.add(identity);
      const tabs=Array.from(av.querySelectorAll<HTMLElement>(
        ":scope > .av__container > .av__header .layout-tab-bar .item[data-id]"))
        .map(tab=>tab.dataset.id || "").filter(id=>ID.test(id)).sort();
      // An empty tab strip is a transient native redraw, not deletion.
      if (!tabs.length) continue;
      const signature=tabs.join(",");
      const previous=this.state.get(identity);
      if (previous?.signature===signature &&
          now-previous.at<PERIODIC_CHECK_INTERVAL) continue;
      if (previous && now-previous.at<MIN_CHECK_INTERVAL) {
        const remaining=MIN_CHECK_INTERVAL-(now-previous.at);
        if (!this.timer) this.timer=setTimeout(()=>{
          this.timer=null;
          if (this.unsubscribe) void this.scan();
        },remaining);
        continue;
      }
      if (this.inFlight.has(identity)) continue;
      this.state.set(identity,{signature,at:now});
      this.inFlight.add(identity);
      try {
        const removed=await reconcileDeletedNativeViews(blockId,avID);
        if (generation!==this.generation) return;
        if (removed.length)
          console.info("[Dodo 数据库视图] 原生视图已删除，清理失效配置",blockId,removed);
      } catch(error) {
        if (generation===this.generation) {
          this.state.delete(identity);
          console.warn("[Dodo 数据库视图] 检查原生视图配置时跳过同步",error);
        }
      } finally {
        this.inFlight.delete(identity);
      }
    }
    for (const key of this.state.keys()) if (!visited.has(key)) this.state.delete(key);
  }
}
