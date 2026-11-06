import { Dialog, Menu, openTab } from "siyuan";
import type { SubPlugin } from "../types/plugin";
import { settings } from "../settings";
import { isMobile, plugin } from "../utils";
import {
  isHomeLayoutTemplate,
  parseHomeLayout,
  type HomeLayout,
  type HomeLayoutTemplate,
} from "./config";
import { HomeHost } from "./HomeHost";

const SAVED_LAYOUT_KEY = "layout";
const DEFAULT_TEMPLATE_KEY = "default-template";
const AUTO_OPEN_KEY = "auto-open";

class HomePlugin implements SubPlugin {
  name = "home";
  displayName = "主页";
  description = "可拖拽、缩放、分区的思源个人工作台。";
  enabled = false;

  private host: HomeHost | null = null;

  async onload(): Promise<void> {
    this.host = new HomeHost({
      app: plugin.app,
      pluginName: plugin.name,
      isMobile,
      addTab: (options) => plugin.addTab(options),
      openTab,
      DialogConstructor: Dialog,
      getDefaultTemplate: () => this.getDefaultTemplate(),
      getSavedLayout: () => this.getSavedLayout(),
      saveLayout: (layout) => this.saveLayout(layout),
    });
    this.host.registerTab();
  }

  async onLayoutReady(): Promise<void> {
    if (settings.getBySpace(this.name, AUTO_OPEN_KEY) === true) {
      this.host?.open();
    }
  }

  async onunload(): Promise<void> {
    this.host?.destroy();
    this.host = null;
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconLayout",
      label: "主页",
      click: () => this.host?.open(),
    });
  }

  private getDefaultTemplate(): HomeLayoutTemplate {
    const value = settings.getBySpace(this.name, DEFAULT_TEMPLATE_KEY);
    return isHomeLayoutTemplate(value) ? value : "balanced";
  }

  private getSavedLayout(): HomeLayout | null {
    const raw = settings.getBySpace(this.name, SAVED_LAYOUT_KEY);
    if (typeof raw !== "string" || !raw.trim()) {
      return null;
    }

    try {
      return parseHomeLayout(JSON.parse(raw), this.getDefaultTemplate());
    } catch (_error) {
      return null;
    }
  }

  private async saveLayout(layout: HomeLayout): Promise<void> {
    settings.setBySpace(this.name, SAVED_LAYOUT_KEY, JSON.stringify(layout));
    await settings.save();
  }
}

export default HomePlugin;
