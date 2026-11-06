import { normalizePreviewHeight } from "../../components/ui/preview-height";
import { databaseViewDefinition } from "../view-registry";
import type { Mounted } from "./visual-view-service";
import type { VisualConfig, VisualKind } from "./visual-types";

interface FrameSource {
  blockId: string;
  viewId: string;
  avID: string;
  search: string;
}
export interface VisualMountPolicy {
  /** A stable AV sibling survives native scroll / whole-block replacement. */
  outsideAv: boolean;
  height(config?: VisualConfig): string;
  url(source: FrameSource): string;
  loaded?(mounted: Mounted, render: () => void): void;
}

function iframePath(kind: VisualKind): string {
  return databaseViewDefinition(kind).path;
}
function previewUrl(kind: "gantt" | "calendar"): string {
  return iframePath(kind) + "?r=" + Date.now().toString(36);
}
function timelineUrl(source: FrameSource): string {
  const url = new URL(iframePath("timeline"), location.origin);
  url.searchParams.set("blockId", source.blockId);
  url.searchParams.set("viewId", source.viewId);
  url.searchParams.set("avID", source.avID);
  url.searchParams.set("query", source.search);
  url.searchParams.set("v", "20261105-preserve-event");
  return url.toString();
}
function timelineHeight(value?: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1200, Math.max(320, Math.round(value))) : 520;
}
function observeHeight(
  mounted: Mounted, selector: string, calculate: (preview: HTMLElement, frame: HTMLIFrameElement) => number | null,
): void {
  const {frame} = mounted;
  mounted.resizeObserver?.disconnect();
  const preview = frame.contentDocument?.querySelector<HTMLElement>(selector);
  if (!preview) return;
  const fit = () => {
    const height = calculate(preview, frame);
    if (height !== null && height > 0) frame.style.height = height + "px";
  };
  mounted.resizeObserver = new ResizeObserver(fit);
  mounted.resizeObserver.observe(preview);
  fit();
}

/** One registration point for iframe layout and load policy.
 * Render/data/settings handlers remain per-view, never in this mounting table.
 */
export const visualMountPolicies: Record<VisualKind, VisualMountPolicy> = {
  custom: {
    outsideAv: true,
    height: config => Math.max(320, Math.min(1600, config?.custom?.height || 650)) + "px",
    url: () => "about:blank",
    loaded: (_mounted, render) => render(),
  },
  chart: {
    outsideAv: false,
    height: config => normalizePreviewHeight(config?.chart?.height) + "px",
    url: () => iframePath("chart"),
    loaded: (_mounted, render) => render(),
  },
  timeline: {
    // Preserve the iframe browsing context when SiYuan rebuilds the native
    // AV scroll/container during a record navigation or data refresh.
    outsideAv: true,
    height: config => timelineHeight(config?.timeline?.height) + "px",
    url: timelineUrl,
  },
  gantt: {
    outsideAv: true,
    height: () => "auto",
    url: () => previewUrl("gantt"),
    loaded: (mounted, render) => {
      observeHeight(mounted, ".dodo-gantt-preview", (preview, frame) => {
        preview.style.height = "auto";
        const height = Math.ceil(preview.getBoundingClientRect().height);
        return height > 0 && frame.style.height !== height + "px" ? height : null;
      });
      render();
    },
  },
  calendar: {
    outsideAv: true,
    height: () => "720px",
    url: () => previewUrl("calendar"),
    loaded: (mounted, render) => {
      observeHeight(mounted, ".dodo-calendar-preview", (preview, frame) => {
        // Do not shrink the empty FullCalendar preview during initialization.
        if (!preview.querySelector("#calendar > *")) return null;
        // A few px slack avoids ResizeObserver / FullCalendar feedback loops.
        const height = Math.ceil(preview.getBoundingClientRect().height) + 8;
        const previous = Number.parseFloat(frame.style.height);
        return !Number.isFinite(previous) || Math.abs(previous - height) > 4 ? height : null;
      });
      render();
    },
  },
};

