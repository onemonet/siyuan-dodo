import type { TimelineBlockConfig } from "../types";

/** Adapter lets native database views reuse the standalone timeline settings UI. */
export interface DatabaseTimelineViewSettings {
  load: () => Promise<{
    config: TimelineBlockConfig;
    sourceName: string;
    headers: string[];
    columnIds: string[];
    columnNames: string[];
    fieldTypes: string[];
  }>;
  apply: (config: TimelineBlockConfig) => Promise<{ success: boolean; message?: string }>;
  refresh: () => Promise<{ success: boolean; message?: string }>;
}
