import type { Plugin } from "siyuan";
import { Dialog, openTab } from "siyuan";
import { createLogger } from "../../logger";
import FomoDashboard from "../FomoDashboard.svelte";
import {
  FLOMO_DASHBOARD_TAB_TITLE,
  FLOMO_DASHBOARD_TAB_TYPE,
} from "../config";
import type { AsyncResult } from "../types";
import type { DailyReviewConfig } from "./FlomoConfigStore";

const MOBILE_DASHBOARD_CONTAINER_ID = "fomo-dashboard-mobile";
const TAB_ROOT_STYLE =
  "display:flex;flex-direction:column;height:100%;overflow:hidden;";
const DASHBOARD_CONTAINER_STYLE =
  "flex:1;width:100%;height:100%;min-height:0;overflow:hidden;";
const MOBILE_DASHBOARD_CONTENT = `<div id="${MOBILE_DASHBOARD_CONTAINER_ID}" style="height:100%;overflow:hidden;"></div>`;
const MOBILE_DIALOG_STYLE =
  ";border-radius:0;top:0;left:0;transform:none;max-height:100vh;";
const logger = createLogger("FlomoDashboardHost");

type OpenTabOptions = Parameters<typeof openTab>[0];

export interface FlomoDashboardBridge {
  getMemoTimeFormat: () => string;
  getDashboardBlockId: () => string;
  getDailyReviewConfig: () => DailyReviewConfig;
  setDailyReviewConfig: (
    config: DailyReviewConfig,
  ) => Promise<AsyncResult<DailyReviewConfig>>;
}

interface FlomoDashboardHostDependencies {
  app: OpenTabOptions["app"];
  pluginName: string;
  isMobile: boolean;
  bridge: FlomoDashboardBridge;
  addTab: Plugin["addTab"];
  openTab: (options: OpenTabOptions) => void;
  DialogConstructor: typeof Dialog;
}

export class FlomoDashboardHost {
  private dashboardComponent: FomoDashboard | null = null;

  constructor(private readonly dependencies: FlomoDashboardHostDependencies) {}

  async open(): Promise<void> {
    await this.openStandaloneDashboard();
  }

  registerTab(): void {
    const host = this;

    this.dependencies.addTab({
      type: FLOMO_DASHBOARD_TAB_TYPE,
      init() {
        host.mountDashboardTab(this.element as HTMLElement);
      },
      destroy() {
        host.destroy();
      },
    });
  }

  private async openStandaloneDashboard(): Promise<void> {
    if (this.dependencies.isMobile) {
      this.openMobileDashboard();
      return;
    }

    this.openDesktopDashboard();
  }

  destroy(): void {
    this.dashboardComponent?.$destroy();
    this.dashboardComponent = null;
  }

  private mountDashboardTab(tabElement: HTMLElement): void {
    tabElement.style.cssText = TAB_ROOT_STYLE;
    const container = document.createElement("div");
    container.style.cssText = DASHBOARD_CONTAINER_STYLE;
    tabElement.appendChild(container);
    this.mountDashboard(container);
  }

  private openMobileDashboard(): void {
    const dialog = new this.dependencies.DialogConstructor({
      title: FLOMO_DASHBOARD_TAB_TITLE,
      content: MOBILE_DASHBOARD_CONTENT,
      width: "100vw",
      height: "100vh",
      destroyCallback: () => this.destroy(),
    });

    const dialogElement = dialog.element as HTMLElement;
    dialogElement.style.cssText += MOBILE_DIALOG_STYLE;

    const selector = `#${MOBILE_DASHBOARD_CONTAINER_ID}`;
    const container = dialog.element.querySelector(selector) as HTMLElement | null;
    if (!container) {
      logger.error("openMobileDashboard: missing container", {
        selector,
      });
      return;
    }

    this.mountDashboard(container);
  }

  private openDesktopDashboard(): void {
    this.dependencies.openTab({
      app: this.dependencies.app,
      custom: {
        title: FLOMO_DASHBOARD_TAB_TITLE,
        icon: "iconLayout",
        id: this.dependencies.pluginName + FLOMO_DASHBOARD_TAB_TYPE,
      },
    });
  }

  private mountDashboard(container: HTMLElement): void {
    this.destroy();
    this.dashboardComponent = new FomoDashboard({
      target: container,
      props: {
        app: this.dependencies.app,
        pluginInstance: this.dependencies.bridge,
      },
    });
  }
}
