import type { VisualRenderBridge } from "../visual/visual-render-bridge";
import { databaseViewHost } from "../core/view-host";
import { getCustomApp } from "./storage";
import { customViewSrcdoc } from "./runtime";

/** The custom view uses a trusted same-origin iframe.srcdoc, not an opaque sandbox. */
export function customRuntimeReady(frame: HTMLIFrameElement): boolean {
  try {
    // A moved/recreated iframe can still have the old appId/version on its
    // host attachment while Chromium has navigated its document back to blank.
    return typeof (frame.contentWindow as (Window & { dodoDB?: unknown }) | null)?.dodoDB === "object";
  } catch {
    return false;
  }
}

export async function renderCustomView(av: HTMLElement, bridge: VisualRenderBridge): Promise<void> {
  const mounted = bridge.mounted().get(av);
  if (!bridge.enabled("custom") || !mounted || mounted.kind !== "custom" || !mounted.frame.isConnected) return;
  const blockId = av.dataset.nodeId || "";
  const version = (mounted.customRenderSequence || 0) + 1;
  mounted.customRenderSequence = version;
  const valid = databaseViewHost.beginRead(mounted.frame);
  try {
    const config = (await bridge.read(blockId))[mounted.viewId]?.custom;
    if (!config?.appId) throw new Error("该自定义视图还没有关联 HTML 应用。");
    const { html, manifest } = await getCustomApp(config.appId);
    if (!valid() || bridge.mounted().get(av) !== mounted ||
        mounted.customRenderSequence !== version) return;
    if (mounted.customAppId === config.appId && mounted.customVersion === manifest.version &&
        customRuntimeReady(mounted.frame)) {
      mounted.frame.contentWindow?.postMessage({type:"dodoCustomRefresh"}, "*");
      return;
    }
    // If the iframe lost its runtime after a native view switch / DOM adoption,
    // the previous version marker is NOT proof that its HTML is still loaded.
    // Reapply srcdoc rather than sending a refresh to a blank document.
    mounted.customAppId = config.appId;
    mounted.customVersion = manifest.version;
    mounted.frame.srcdoc = customViewSrcdoc(html);
  } catch (error) {
    if (!valid() || bridge.mounted().get(av) !== mounted ||
        mounted.customRenderSequence !== version) return;
    // Render an inert error, not executable exception text.
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    mounted.frame.srcdoc = "<!doctype html><meta charset='utf-8'><style>body{font:14px sans-serif;padding:24px;color:#a33}</style>" +
      "<main data-dodo-custom-error><h3>自定义视图加载失败</h3><p>" + message + "</p></main>";
    console.warn("[Dodo 自定义视图] 读取 HTML 失败", error);
  }
}
