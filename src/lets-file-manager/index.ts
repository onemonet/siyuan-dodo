import { Dialog, Menu, openTab } from "siyuan";
import type { SubPlugin } from "../types/plugin";
import { isMobile, plugin } from "../utils";
import FileManagerPage from "./FileManagerPage.svelte";

const TAB_TYPE = "dodo-file-manager";
const MOBILE_ID = "dodo-file-manager-mobile";

class FileManagerPlugin implements SubPlugin {
  name = "file-manager";
  displayName = "文件管理";
  description = "管理思源工作空间中的附件文件。";
  enabled = true;

  private mounts = new Map<object, { component: FileManagerPage; container: HTMLElement }>();

  onload(): void {
    const host = this;
    plugin.addTab({
      type: TAB_TYPE,
      init() {
        host.mount(this, this.element as HTMLElement);
      },
      destroy() {
        host.destroyMount(this);
      },
    });
  }

  onunload(): void {
    for (const owner of [...this.mounts.keys()]) {
      this.destroyMount(owner);
    }
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconFolder",
      label: "文件管理",
      click: () => this.open(),
    });
  }

  private open(): void {
    if (isMobile) {
      const owner = {};
      const dialog = new Dialog({
        title: "文件管理",
        content: '<div id="' + MOBILE_ID + '" style="height:100%;min-height:0;overflow:hidden"></div>',
        width: "100vw",
        height: "100vh",
        destroyCallback: () => this.destroyMount(owner),
      });
      const container = dialog.element.querySelector("#" + MOBILE_ID) as HTMLElement | null;
      if (container) {
        const component = new FileManagerPage({ target: container });
        this.mounts.set(owner, { component, container });
      }
      return;
    }
    openTab({
      app: plugin.app,
      custom: {
        title: "文件管理",
        icon: "iconFolder",
        id: plugin.name + TAB_TYPE,
      },
    });
  }

  private mount(owner: object, tab: HTMLElement): void {
    this.destroyMount(owner);
    tab.style.cssText = "height:100%;display:flex;flex-direction:column;min-height:0;overflow:hidden";
    const container = document.createElement("div");
    container.style.cssText = "flex:1;min-width:0;min-height:0;height:100%;overflow:hidden";
    tab.appendChild(container);
    const component = new FileManagerPage({ target: container });
    this.mounts.set(owner, { component, container });
  }

  private destroyMount(owner: object): void {
    const mount = this.mounts.get(owner);
    if (!mount) return;
    mount.component.$destroy();
    mount.container.remove();
    this.mounts.delete(owner);
  }
}

export default FileManagerPlugin;
