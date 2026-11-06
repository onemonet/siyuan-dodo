import { createLogger } from "../../logger";
import type { AsyncResult } from "../types";
import {
  FlomoConfigStore,
  type DailyReviewConfig,
} from "./FlomoConfigStore";

const logger = createLogger("FlomoDashboardConfigBridge");

export class FlomoDashboardConfigBridge {
  constructor(private readonly configStore: FlomoConfigStore) {}

  getMemoTimeFormat(): string {
    return this.configStore.getMemoTimeFormat();
  }

  getDashboardBlockId(): string {
    return this.configStore.getDashboardBlockId();
  }

  getDailyReviewConfig(): DailyReviewConfig {
    return this.configStore.getDailyReviewConfig();
  }

  async setDailyReviewConfig(
    config: DailyReviewConfig,
  ): Promise<AsyncResult<DailyReviewConfig>> {
    const source = `FlomoDashboardConfigBridge.setDailyReviewConfig(count=${config.count},range=${config.timeRange})`;

    try {
      const nextConfig = await this.configStore.setDailyReviewConfig(config);

      return {
        data: nextConfig,
        error: null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(source, error);

      return {
        data: this.getDailyReviewConfig(),
        error: `${source}: ${errorMessage}`,
      };
    }
  }
}
