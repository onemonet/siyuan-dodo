/**
 * Flomo 同步插件类
 */
import type { SubPlugin } from "@/types/plugin";
import { getErrorMessage } from "@/request-utils";
import moment from "moment";
import { Menu, fetchSyncPost, Dialog, openTab, showMessage } from "siyuan";
import { plugin, isMobile } from "../utils";
import { FlomoAPI } from "./services/FlomoAPI";
import {
  FlomoAccountValidator,
  VALIDATE_FLOMO_ACCOUNT_ACTION,
} from "./services/FlomoAccountValidator";
import { FlomoConfigStore } from "./services/FlomoConfigStore";
import { promptFlomoCaptcha } from "./services/FlomoCaptchaDialog";
import { FlomoDashboardConfigBridge } from "./services/FlomoDashboardConfigBridge";
import { FlomoDashboardHost } from "./services/FlomoDashboardHost";
import { MemoDateDecorator } from "./services/MemoDateDecorator";
import { QuickNoteService } from "./services/QuickNoteService";
import { FlomoSyncCoordinator } from "./services/FlomoSyncCoordinator";
import { SiyuanWriter } from "./services/SiyuanWriter";
import type { FlomoConfig } from "./types";


class FlomoSyncPlugin implements SubPlugin {
  name = "flomo-sync";
  displayName = "Flomo 同步";
  description = "将 Flomo 笔记同步到思源笔记";
  enabled = false;

  private configStore = new FlomoConfigStore(this.name);
  private dashboardConfigBridge = new FlomoDashboardConfigBridge(
    this.configStore,
  );
  private quickNoteService: QuickNoteService | null = null;
  private memoDateDecorator = new MemoDateDecorator();
  private syncCoordinator = new FlomoSyncCoordinator({
    getConfig: () => this.getConfig(),
    saveConfig: (config) => this.saveConfig(config),
    notify: fetchSyncPost,
    createApi: (config) => this.createFlomoApi(config),
    createWriter: () => new SiyuanWriter(),
    getNow: () => moment(),
  });
  private accountValidator = new FlomoAccountValidator({
    getConfig: () => this.getConfig(),
    saveConfig: (config) => this.saveConfig(config),
    createApi: (config) => this.createFlomoApi(config),
    refreshServices: () => this.syncCoordinator.refreshServices(),
    requestCaptcha: (api, reason) => promptFlomoCaptcha(api, reason),
    getNow: () => new Date(),
  });
  private dashboardHost = new FlomoDashboardHost({
    app: plugin.app,
    pluginName: plugin.name,
    isMobile,
    bridge: this.dashboardConfigBridge,
    addTab: (options) => plugin.addTab(options),
    openTab,
    DialogConstructor: Dialog,
  });

  /**
   * 获取配置
   */
  private getConfig(): FlomoConfig {
    return this.configStore.getConfig();
  }

  /**
   * 保存配置
   */
  private async saveConfig(config: Partial<FlomoConfig>): Promise<void> {
    await this.configStore.saveConfig(config);
  }

  private createFlomoApi(config: FlomoConfig): FlomoAPI {
    return new FlomoAPI(config, {
      onAccessTokenRefreshed: (accessToken) =>
        this.saveConfig({ accessToken }),
    });
  }

  private initQuickNoteService(): void {
    this.quickNoteService = new QuickNoteService({
      app: plugin.app,
      request: fetchSyncPost,
      getConfig: () => this.getConfig(),
      createWriter: () => new SiyuanWriter(),
      getNow: () => moment(),
    });
  }

  private refreshMemoDateDecorator(): void {
    const config = this.getConfig();
    this.memoDateDecorator.update({
      enabled: config.showMemoDate,
      timeFormat: config.timeFormat,
    });
  }

  async onload(): Promise<void> {
    this.syncCoordinator.refreshServices();
    this.initQuickNoteService();
    this.dashboardHost.registerTab();

    // 注册快捷键
    const config = this.getConfig();
    if (config.enableQuickNote) {
      this.registerQuickNoteCommand();
    }

  }

  /**
   * 注册速记快捷键命令
   */
  private registerQuickNoteCommand(): void {
    if (plugin && plugin.addCommand) {
      plugin.addCommand({
        langKey: "flomoSyncQuickNote",
        hotkey: "F10",
        globalCallback: () => {
          const config = this.getConfig();
          if (!config.enableQuickNote || !this.isQuickNoteTargetWindow()) {
            return;
          }

          this.showQuickNoteDialog();
        },
      });
    }
  }

  async onLayoutReady(): Promise<void> {
    this.refreshMemoDateDecorator();
    await this.syncCoordinator.refreshAccessToken();

    // 检查是否有新数据
    const config = this.getConfig();
    if (config.username && config.password && config.accessToken) {
      this.syncCoordinator.checkNewMemos();
      
      // 静默同步：启动时自动同步
      if (config.enableSilentSync) {
        this.syncCoordinator.runSync({ silent: true });
      }
    }
  }

  async onunload(): Promise<void> {
    this.syncCoordinator.stop();
    this.dashboardHost.destroy();
    this.quickNoteService?.destroy();
    this.quickNoteService = null;
    this.memoDateDecorator.destroy();
  }

  async onDataChanged(context?: { key?: string }): Promise<void> {
    if (context?.key === "username" || context?.key === "password") {
      await this.saveConfig({
        accessToken: "",
        accountAuthStatus: "unknown",
        accountAuthMessage: "账号信息已变更，请重新校验",
        accountAuthCheckedAt: "",
      });
    }

    this.syncCoordinator.refreshServices();
    this.refreshMemoDateDecorator();
  }

  async onSettingAction(actionKey: string): Promise<void> {
    if (actionKey !== VALIDATE_FLOMO_ACCOUNT_ACTION) {
      return;
    }

    showMessage("正在校验 Flomo 账号认证...", 2000, "info");

    try {
      const result = await this.accountValidator.validate();
      showMessage(
        result.message,
        result.success ? 3000 : 4000,
        result.success || result.message === "已取消 Flomo 账号校验" ? "info" : "error",
      );
    } catch (error) {
      showMessage(
        `Flomo 账号校验失败: ${getErrorMessage(error)}`,
        5000,
        "error",
      );
    }
  }

  onProtyleLoaded(event: any): void {
    const protyle = event?.detail?.protyle;
    this.memoDateDecorator.processProtyle(protyle?.element);
  }

  /**
   * 添加菜单项
   */
  addMenuItem(menu: Menu): void {
    const config = this.getConfig();
    const newMemosCount = this.syncCoordinator.getNewMemosCount();
    const labelText =
      newMemosCount > 0 ? `立即同步 (${newMemosCount})` : "立即同步";

    if (config.showManualSyncMenu) {
      menu.addItem({
        icon: "iconRefresh",
        label: labelText,
        click: () => {
          this.syncCoordinator.runSync();
        }
      });
    }

    menu.addItem({
      icon: "iconLayout",
      label: "Flomo 仪表盘",
      click: () => {
        this.dashboardHost.open();
      }
    });

    if (config.enableQuickNote) {
      menu.addItem({
        icon: "iconEdit",
        label: "速记",
        click: () => {
          this.showQuickNoteDialog();
        }
      });
    }
  }

  private isQuickNoteTargetWindow(): boolean {
    const isVisible = document.visibilityState === "visible";
    const hasWindowFocus = document.hasFocus();
    const requireFunction = (
      window as Window & {
        require?: (moduleName: string) => {
          getCurrentWindow?: () => { isFocused?: () => boolean };
        };
      }
    ).require;
    const currentWindow = requireFunction?.("@electron/remote")?.getCurrentWindow?.();
    const isFocused = currentWindow?.isFocused?.() ?? true;

    return isVisible && hasWindowFocus && isFocused;
  }

  private async showQuickNoteDialog(): Promise<void> {
    if (!this.quickNoteService) {
      this.initQuickNoteService();
    }

    await this.quickNoteService?.open();
  }
}

export default FlomoSyncPlugin;
