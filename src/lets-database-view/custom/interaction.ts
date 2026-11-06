import { databaseViewHost } from "../core/view-host";
import { DatabaseViewConfigStore } from "../view-config-store";
import type { VisualInteractionBridge } from "../visual/visual-interactions";
import { getCustomSchema, listCustomRecords, openCustomRecord,
  updateCustomCell, createCustomRecord, type CustomDatabaseContext } from "./data-service";

/** All client requests are routed by the actual iframe Window identity, never
 * by an appId, a claimed origin or an arbitrary AV id supplied by HTML.
 */
export function createCustomMessageHandler(bridge: VisualInteractionBridge):
    (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (!bridge.running() || !databaseViewHost.fromSource(event.source, "custom")) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.type !== "dodoCustomRequest" ||
        typeof msg.requestId !== "string" ||
        !/^[a-zA-Z0-9-]{8,64}$/.test(msg.requestId) ||
        typeof msg.method !== "string" || !["getSchema", "listRecords", "openRecord",
          "updateCell", "createRecord"].includes(msg.method)) return;
    const pair = Array.from(bridge.mounted().entries()).find(([, mounted]) =>
      mounted.kind === "custom" && mounted.frame.contentWindow === event.source);
    if (!pair) return;
    const [av, mounted] = pair;
    const frame = mounted.frame;
    const args = msg.args && typeof msg.args === "object" && !Array.isArray(msg.args)
      ? msg.args as Record<string, unknown> : {};
    const reply = (result: unknown, error?: string) => {
      if (databaseViewHost.fromSource(event.source, "custom") &&
          bridge.mounted().get(av) === mounted && frame.contentWindow === event.source) {
        frame.contentWindow?.postMessage({type: "dodoCustomResult",
          requestId: msg.requestId, result, error}, "*");
      }
    };
    void (async () => {
      try {
        const ctx: CustomDatabaseContext = {
          blockId: av.dataset.nodeId || "", avID: av.dataset.avId || "",
          viewId: mounted.viewId, search: bridge.search(av),
        };
        const state = (await DatabaseViewConfigStore.load(ctx.blockId)).views[ctx.viewId];
        if (state?.mode !== "custom" || !state.configs.custom?.appId ||
            state.configs.custom.appId !== mounted.customAppId)
          throw new Error("自定义视图已经切换或页面实例已改变。");
        const allowWrites = state.configs.custom.allowWrites === true;
        let result: unknown;
        switch (msg.method) {
          case "getSchema": result = await getCustomSchema(ctx); break;
          case "listRecords": result = await listCustomRecords(ctx, args); break;
          case "openRecord":
            result = await openCustomRecord(ctx, String(args.recordId || "")); break;
          case "updateCell": result = await updateCustomCell(ctx, args, allowWrites); break;
          case "createRecord": result = await createCustomRecord(ctx, args, allowWrites); break;
        }
        reply(result);
      } catch (error) {
        reply(null, error instanceof Error ? error.message : String(error));
      }
    })();
  };
}
