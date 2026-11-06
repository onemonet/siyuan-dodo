import type { TimelineBlockConfig, TimelineStartPosition } from "../types";

/** Normalize native database-view timeline rendering options. No standalone block persistence. */
export class TimelineBlockConfigService {
  static sanitizeConfig(blockId: string, config?: Partial<TimelineBlockConfig>): TimelineBlockConfig {
    return {
      sourceType: "database",
      sourceBlockId: config?.sourceBlockId || blockId,
      sourceAvID: config?.sourceAvID || undefined,
      sourceViewID: config?.sourceViewID || undefined,
      sourceQuery: config?.sourceQuery || "",
      title: config?.title?.trim() || "时间线",
      height: this.normalizeHeight(config?.height),
      timenavHeightPercent: this.normalizeTimenavHeightPercent(config?.timenavHeightPercent),
      startPosition: this.normalizeStartPosition(config?.startPosition),
      fieldMapping: config?.fieldMapping,
    };
  }

  private static normalizeHeight(value?: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.round(value) : 520;
  }

  private static normalizeTimenavHeightPercent(value?: number): number {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, Math.round(value))) : 50;
  }

  private static normalizeStartPosition(value?: TimelineStartPosition): TimelineStartPosition {
    return value === "last" ? "last" : "first";
  }
}