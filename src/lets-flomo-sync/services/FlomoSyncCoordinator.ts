import moment from "moment";
import { createLogger } from "../../logger";
import { FLOMO_UPDATED_MEMOS_PAGE_SIZE } from "../config";
import type { FlomoConfig } from "../types";
import { fetchPendingMemos } from "../utils/pendingMemos";
import { FlomoAPI } from "./FlomoAPI";
import { SiyuanWriter } from "./SiyuanWriter";
import { SyncService } from "./SyncService";

const NOTIFICATION_ENDPOINTS = {
  message: "/api/notification/pushMsg",
  error: "/api/notification/pushErrMsg",
} as const;
const logger = createLogger("FlomoSyncCoordinator");

type NotificationRequest = (
  url: string,
  payload: { msg: string },
) => Promise<unknown>;

interface FlomoSyncCoordinatorDependencies {
  getConfig: () => FlomoConfig;
  saveConfig: (config: Partial<FlomoConfig>) => Promise<void>;
  notify: NotificationRequest;
  createApi: (config: FlomoConfig) => FlomoAPI;
  createWriter: () => SiyuanWriter;
  getNow: () => moment.Moment;
}

export class FlomoSyncCoordinator {
  private isSyncing = false;
  private newMemosCount = 0;
  private flomoAPI: FlomoAPI | null = null;
  private syncService: SyncService | null = null;

  constructor(private readonly dependencies: FlomoSyncCoordinatorDependencies) {}

  refreshServices(): void {
    const config = this.dependencies.getConfig();
    const api = this.dependencies.createApi(config);
    const writer = this.dependencies.createWriter();

    this.flomoAPI = api;
    this.syncService = new SyncService(api, writer, config);
  }

  stop(): void {
    this.isSyncing = false;
  }

  getNewMemosCount(): number {
    return this.newMemosCount;
  }

  async refreshAccessToken(): Promise<void> {
    const config = this.dependencies.getConfig();
    if (config.accessToken || !config.username || !config.password) {
      return;
    }

    try {
      const token = await this.getApi().login(config.username, config.password);
      await this.dependencies.saveConfig({ accessToken: token });
      this.refreshServices();
      await this.notifyMessage("Flomo 自动登录成功");
    } catch (error) {
      logger.warn("refreshAccessToken: failed to refresh access token", {
        username: config.username,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async checkNewMemos(): Promise<void> {
    try {
      const config = this.dependencies.getConfig();
      if (!this.hasLoginConfig(config)) {
        this.newMemosCount = 0;
        return;
      }

      const pendingMemos = await fetchPendingMemos({
        api: this.getApi(),
        config,
        limit: FLOMO_UPDATED_MEMOS_PAGE_SIZE,
      });
      this.newMemosCount = pendingMemos.length;
    } catch (error) {
      logger.warn("checkNewMemos: failed to check memo count", {
        lastSyncTime: this.dependencies.getConfig().lastSyncTime,
        reason: error instanceof Error ? error.message : String(error),
      });
      this.newMemosCount = 0;
    }
  }

  async runSync(options: { silent?: boolean } = {}): Promise<void> {
    const isSilent = options.silent ?? false;
    if (this.isSyncing) {
      await this.notifyAlreadySyncing(isSilent);
      return;
    }

    const config = this.dependencies.getConfig();
    if (!this.hasLoginConfig(config)) {
      await this.notifyMissingConfig(isSilent);
      return;
    }

    this.isSyncing = true;

    try {
      this.refreshServices();
      const result = await this.getSyncService().sync(isSilent);

      if (result.success) {
        await this.handleSyncSuccess(result.memoCount, config, isSilent);
        return;
      }

      await this.notifyError(
        isSilent
          ? `Flomo 自动同步失败: ${result.error}`
          : `Flomo 同步失败: ${result.error}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.notifyError(
        isSilent ? `Flomo 自动同步异常: ${reason}` : `Flomo 同步异常: ${reason}`,
      );
    } finally {
      this.isSyncing = false;
    }
  }

  private async handleSyncSuccess(
    memoCount: number,
    config: FlomoConfig,
    isSilent: boolean,
  ): Promise<void> {
    this.newMemosCount = 0;

    if (memoCount <= 0) {
      if (!isSilent) {
        await this.notifyMessage("Flomo: 暂无新数据");
      }
      return;
    }

    await this.notifyMessage(
      isSilent
        ? `Flomo 自动同步完成，同步了 ${memoCount} 条笔记`
        : `Flomo 同步完成，同步了 ${memoCount} 条笔记`,
    );

    if (!config.debugMode) {
      await this.dependencies.saveConfig({
        lastSyncTime: this.dependencies.getNow().format("YYYY-MM-DD HH:mm:ss"),
      });
    }
  }

  private async notifyAlreadySyncing(isSilent: boolean): Promise<void> {
    if (!isSilent) {
      await this.notifyMessage("正在同步中，请稍候...");
    }
  }

  private async notifyMissingConfig(isSilent: boolean): Promise<void> {
    if (!isSilent) {
      await this.notifyError(
        "Flomo 同步: 请先配置用户名、密码和 accessToken",
      );
    }
  }

  private hasLoginConfig(config: FlomoConfig): boolean {
    return Boolean(config.username && config.password && config.accessToken);
  }

  private getApi(): FlomoAPI {
    if (!this.flomoAPI) {
      this.refreshServices();
    }

    return this.flomoAPI as FlomoAPI;
  }

  private getSyncService(): SyncService {
    if (!this.syncService) {
      this.refreshServices();
    }

    return this.syncService as SyncService;
  }

  private async notifyMessage(message: string): Promise<void> {
    await this.dependencies.notify(NOTIFICATION_ENDPOINTS.message, { msg: message });
  }

  private async notifyError(message: string): Promise<void> {
    await this.dependencies.notify(NOTIFICATION_ENDPOINTS.error, { msg: message });
  }
}
