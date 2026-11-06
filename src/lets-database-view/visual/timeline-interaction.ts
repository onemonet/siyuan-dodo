import { showMessage } from "siyuan";
import { openMapItem } from "../map/open-map-item";

export interface TimelineFrameContext {
  blockId: string;
  avID: string;
  viewId: string;
}

/** Source validation lives with the timeline interaction protocol; the
 * renderer host supplies only live iframe identity and native AV metadata.
 */
export function createTimelineMessageHandler(
  frameContext: (source: Window) => TimelineFrameContext | null,
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (event.origin !== window.location.origin ||
        event.data?.type !== "dodoTimelineOpenItem") return;
    const source = event.source as Window | null;
    if (!source) return;
    const context = frameContext(source);
    const data = event.data;
    if (!context || data.databaseBlockID !== context.blockId || data.avID !== context.avID) return;
    // Keep the source timeline visible in its editor: open the record in the
    // right split for both bound documents and detached database items.
    void openMapItem(data, { position: "right" }).catch(error => {
      console.warn("[Dodo 数据库时间线] 打开条目失败", error);
      showMessage(error instanceof Error ? error.message : "打开数据库条目失败。", 5000, "error");
    });
  };
}

