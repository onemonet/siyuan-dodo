import type { Plugin } from "siyuan";
import { Dialog, openTab } from "siyuan";
import HomePage from "./HomePage.svelte";
import {
  HOME_TAB_TYPE,
  parseHomeLayout,
  type HomeLayout,
  type HomeLayoutTemplate,
} from "./config";

const MOBILE_HOME_CONTAINER_ID = "dodo-home-mobile";
const TAB_ROOT_STYLE =
  "display:flex;flex-direction:column;height:100%;overflow:hidden;";
const HOME_CONTAINER_STYLE =
  "flex:1;width:100%;height:100%;min-height:0;overflow:hidden;";
const MOBILE_HOME_CONTENT = `<div id="${MOBILE_HOME_CONTAINER_ID}" style="height:100%;overflow:hidden;"></div>`;
const MOBILE_DIALOG_STYLE =
  ";border-radius:0;top:0;left:0;transform:none;max-height:100vh;";

type OpenTabOptions = Parameters<typeof openTab>[0];

export interface HomeHostDependencies {
  app: OpenTabOptions["app"];
  pluginName: string;
  isMobile: boolean;
  addTab: Plugin["addTab"];
  openTab: (options: OpenTabOptions) => void;
  DialogConstructor: typeof Dialog;
  getDefaultTemplate: () => HomeLayoutTemplate;
  getSavedLayout: () => HomeLayout | null;
  saveLayout: (layout: HomeLayout) => Promise<void>;
}

export class HomeHost {
  private readonly homeMounts = new Map<
    object,
    { component: HomePage; container: HTMLElement }
  >();

  constructor(private readonly dependencies: HomeHostDependencies) {}

  registerTab(): void {
    const host = this;
    this.dependencies.addTab({
      type: HOME_TAB_TYPE,
      init() {
        host.mountTab(this, this.element as HTMLElement);
      },
      destroy() {
        host.destroyMount(this);
      },
    });
  }

  open(): void {
    if (this.dependencies.isMobile) {
      this.openMobile();
      return;
    }

    this.dependencies.openTab({
      app: this.dependencies.app,
      custom: {
        title: "主页",
        icon: "iconLayout",
        id: this.dependencies.pluginName + HOME_TAB_TYPE,
      },
    });
  }

  destroy(): void {
    for (const mount of this.homeMounts.values()) {
      mount.component.$destroy();
      mount.container.remove();
    }
    this.homeMounts.clear();
  }

  private mountTab(owner: object, tabElement: HTMLElement): void {
    tabElement.style.cssText = TAB_ROOT_STYLE;
    const container = document.createElement("div");
    container.style.cssText = HOME_CONTAINER_STYLE;
    tabElement.appendChild(container);
    this.mount(container, owner);
  }

  private openMobile(): void {
    const mountOwner = {};
    const dialog = new this.dependencies.DialogConstructor({
      title: "主页",
      content: MOBILE_HOME_CONTENT,
      width: "100vw",
      height: "100vh",
      destroyCallback: () => this.destroyMount(mountOwner),
    });

    const dialogElement = dialog.element as HTMLElement;
    dialogElement.style.cssText += MOBILE_DIALOG_STYLE;
    const container = dialog.element.querySelector(
      `#${MOBILE_HOME_CONTAINER_ID}`,
    ) as HTMLElement | null;
    if (container) {
      this.mount(container, mountOwner);
    }
  }

  private mount(container: HTMLElement, owner: object): void {
    this.destroyMount(owner);
    const defaultTemplate = this.dependencies.getDefaultTemplate();
    const savedLayout = this.dependencies.getSavedLayout();
    const component = new HomePage({
      target: container,
      props: {
        defaultTemplate,
        initialLayout: parseHomeLayout(savedLayout, defaultTemplate),
        onLayoutChange: (layout: HomeLayout) =>
          this.dependencies.saveLayout(layout),
      },
    });
    this.homeMounts.set(owner, { component, container });
  }

  private destroyMount(owner: object): void {
    const mount = this.homeMounts.get(owner);
    if (!mount) {
      return;
    }

    mount.component.$destroy();
    mount.container.remove();
    this.homeMounts.delete(owner);
  }
}
