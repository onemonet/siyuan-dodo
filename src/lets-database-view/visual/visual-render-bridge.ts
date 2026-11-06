import type { Mounted } from "./visual-view-service";
import type { VisualConfig, VisualKind } from "./visual-types";

import type { DatabaseViewDocument } from "../view-config-schema";

export interface VisualRenderBridge {
  mounted(): Map<HTMLElement, Mounted>;
  read(blockId: string): Promise<Record<string, VisualConfig>>;
  search(av: HTMLElement): string;
  enabled(kind: VisualKind): boolean;
  liveAv(entry: Mounted): HTMLElement | null;
  typography(av: HTMLElement): Record<"fontFamily"|"fontSize"|"fontWeight"|"color", string>;
  ganttSaving: Set<string>;
  calendarSaving: Set<string>;
}

export interface VisualWriteBridge extends VisualRenderBridge {
  ganttScaleSaving: Set<string>;
  updated(blockId: string, doc: DatabaseViewDocument): void;
  currentView(header: HTMLElement): string;
}
