import { TimelineBlockConfig, TimelineRenderableData } from "../types";

export class TimelineRendererService {
  private timeline: any = null;
  private storageKey = "";

  /** Preserve the selected database event through view refresh / iframe reload. */
  rememberCurrentEvent(): void {
    const id = this.timeline?.current_id;
    if (typeof id !== "string" || !this.storageKey || !id) return;
    // Do not replace the persisted event with the automatically inserted
    // TimelineJS title slide when the iframe is initializing.
    if (this.timeline?.config?.events?.some((event: {unique_id: string}) => event.unique_id === id)) {
      try { window.sessionStorage.setItem(this.storageKey, id); } catch { /* storage may be disabled */ }
    }
  }

  render(
    container: HTMLElement,
    data: TimelineRenderableData,
    config: TimelineBlockConfig,
    options?: { isDarkMode?: boolean; storageKey?: string }
  ): void {
    const timelineCtor = (window as any)?.TL?.Timeline;
    if (typeof timelineCtor !== "function") {
      throw new Error("TimelineJS3 \u5728 iframe \u9875\u9762\u4e2d\u4e0d\u53ef\u7528\u3002");
    }

    this.rememberCurrentEvent();
    this.storageKey = options?.storageKey || this.storageKey;
    let savedId = "";
    try { savedId = this.storageKey ? window.sessionStorage.getItem(this.storageKey) || "" : ""; }
    catch { /* storage may be disabled */ }
    const savedIndex = data.events.findIndex(event => event.unique_id === savedId);
    this.destroy();
    container.innerHTML = "";

    const timelineOptions = {
      width: "100%",
      height: "100%",
      language: "timeline3/js/locale/zh-cn.json",
      font: "timeline3/css/fonts/font.default.css",
      timenav_height_percentage: config.timenavHeightPercent ?? 50,
      timenav_height_min: 0,
      marker_height_min: 28,
      start_at_end: savedIndex < 0 && config.startPosition === "last",
      // If we already visited a record, select that event rather than the
      // title/first slide when SiYuan recreates this iframe or refreshes data.
      ...(savedIndex >= 0 ? {start_at_slide: savedIndex + (data.title ? 1 : 0)} : {}),
      // Open Color：亮色 #ffffff，暗色 oc-gray-9 #212529（与 app.css 的 --tl-canvas 一致）
      default_bg_color: options?.isDarkMode ? "#212529" : "#ffffff",
    };

    const target = container.id || "timeline";
    if (!container.id) {
      container.id = target;
    }

    this.timeline = new timelineCtor(target, data, timelineOptions);
    if (typeof this.timeline?.on === "function") {
      this.timeline.on("change", (detail: {unique_id?: string}) => {
        if (!detail?.unique_id ||
            !data.events.some(event => event.unique_id === detail.unique_id)) return;
        try {
          if (this.storageKey) window.sessionStorage.setItem(this.storageKey, detail.unique_id);
        } catch { /* storage may be disabled */ }
      });
    }

    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
  }

  destroy(): void {
    if (!this.timeline) {
      return;
    }

    // TimelineJS exposes different cleanup helpers across builds.
    const cleanupMethods = ["destroy", "dispose", "remove"];
    cleanupMethods.forEach((method) => {
      try {
        if (typeof this.timeline?.[method] === "function") {
          this.timeline[method]();
        }
      } catch (error) {
        console.warn(`[timeline-preview] Failed to call ${method} during cleanup.`, error);
      }
    });

    this.timeline = null;
  }
}
