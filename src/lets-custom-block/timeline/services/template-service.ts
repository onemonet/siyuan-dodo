import { TimelineBlockConfig } from "../types";

export class TimelineTemplateService {
  static generateIframe(
    blockId: string,
    config: TimelineBlockConfig,
    options?: { refreshKey?: string }
  ): string {
    const searchParams = new URLSearchParams({
      blockId,
    });

    if (config.title) {
      searchParams.set("title", config.title);
    }
    if (config.startPosition) {
      searchParams.set("startPosition", config.startPosition);
    }
    if (typeof config.timenavHeightPercent === "number") {
      searchParams.set("timenavHeightPercent", String(config.timenavHeightPercent));
    }
    if (options?.refreshKey) {
      searchParams.set("refresh", options.refreshKey);
    }

    const src = `/plugins/siyuan-dodo/preview/timeline/iframe/index.html?${searchParams.toString()}`;
    const height = typeof config.height === "number" && config.height > 0
      ? Math.round(config.height)
      : 520;

    return `<iframe src="${src}" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width: 100%; height: ${height}px;"></iframe>`;
  }
}
