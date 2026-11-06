import { Dialog, Menu, Plugin } from "siyuan";
import SettingPannel from "@/setting.svelte";
import { settings } from "./settings";
import { isMobile, setPlugin } from "./utils";
import { registerPlugin } from "@frostime/siyuan-plugin-kits";
import { PluginRegistry } from "./plugin-registry";

export default class PluginGo extends Plugin {
  private pluginRegistry = PluginRegistry.getInstance();
  private isGlobalEventListenersRegistered = false;
  private isProtyleStaticListenerRegistered = false;
  private readonly handleLoadedProtyleStatic = (event: any) => {
    this.delegateEvent("onProtyleLoaded", event);
  };
  private readonly handleBlockIconEvent = (event: any) => {
    this.blockIconEvent(event);
  };
  private readonly handleSwitchProtyleEvent = (event: any) => {
    this.switchProtyleEvent(event);
  };
  private readonly handleEditortitleiconEvent = (event: any) => {
    this.editortitleiconEvent(event);
  };
  private readonly handleMobileKeyboardShowEvent = (event: any) => {
    this.mobilekeyboardshowEvent(event);
  };
  private readonly handleMobileKeyboardHideEvent = (event: any) => {
    this.mobilekeyboardhideEvent(event);
  };
  private readonly handleOpenSiyuanUrlPluginEvent = (event: any) => {
    this.openSiyuanUrlPluginEvent(event);
  };
  private readonly handleLinkMenuEvent = (event: any) => {
    this.linkMenuEvent(event);
  };
  myIcon = `<svg t="1772078860397" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6706" width="200" height="200"><path d="M576 928h-32v-64h-64v64h-64c-17.6 0-32 14.4-32 32h224c0-17.6-14.4-32-32-32z" fill="#FF822D" p-id="6707"></path><path d="M960 494.4a110.4 110.4 0 1 1-220.8 0 110.4 110.4 0 0 1 220.8 0zM478.08 864h67.84c16.64 0 30.08-13.44 30.08-30.08V736h-128v97.92c0 16.64 13.44 30.08 30.08 30.08z" fill="#636363" p-id="6708"></path><path d="M227.52 204.16A140.16 140.16 0 0 1 367.04 64c75.2-0.32 138.24 60.16 140.8 135.36 0.96 28.48-6.4 55.36-20.16 77.76l-70.08 116.48c-4.8 8.32 3.52 18.24 12.8 14.72 45.12-17.92 94.08-27.84 145.6-27.84 87.456 0 167.136 31.264 232 80.64A80.032 80.032 0 0 1 960 496c0 31.68-7.36 62.72-21.44 90.88l-3.52 7.36c-4.8 9.28-7.04 19.2-7.04 29.44v38.4c0 7.36-8 12.48-14.72 8.96l-15.68-8c-20.48-10.24-33.6-31.36-33.6-54.4v41.28C864 732.8 796.8 800 713.92 800H704v33.92c0 16.64-13.44 30.08-30.08 30.08h-67.84c-16.64 0-30.08-13.44-30.08-30.08V800h-122.88C326.72 800 224 697.28 224 570.88c0-41.28 10.88-81.6 31.04-117.44l85.76-149.44 20.16-3.84v-2.24H263.36c-22.4-24.96-35.84-57.92-35.84-93.76z" fill="#9B9B9B" p-id="6709"></path><path d="M198.4 160h-28.8l22.4 160h142.72a110.72 110.72 0 0 0 110.72-112.32c-0.96-58.88-48.64-107.52-107.52-109.12-34.56-1.28-65.92 13.76-86.72 38.08-13.12 15.04-32.64 23.36-52.8 23.36zM640.32 650.24c-0.64 5.44 3.52 9.92 8.64 9.92h47.36c8.96 0 15.68 8 14.08 16.64a95.68 95.68 0 0 1-94.4 79.36c-75.2 0-136-60.8-136-136v-46.72a96.192 96.192 0 0 1 102.4-93.12c48.64 3.2 87.04 41.6 89.6 90.24 1.6 29.12-9.6 55.68-28.8 74.24-1.6 1.6-2.56 3.52-2.88 5.44z" fill="#D3D3D3" p-id="6710"></path><path d="M310.72 230.72a24 24 0 1 0 0-48 24 24 0 0 0 0 48z" fill="#1C1C1C" p-id="6711"></path><path d="M704 928h-32v-64h-64v64h-64c-17.6 0-32 14.4-32 32h224c0-17.6-14.4-32-32-32zM64 265.6c0 33.6 18.88 64 48.64 78.72 7.04 3.52 15.36-1.6 15.36-9.6V320h64V182.4c0-12.48-9.92-22.4-22.4-22.4C111.36 160 64 207.36 64 265.6z" fill="#FFB02E" p-id="6712"></path></svg>`;

  // Sub-plugins are managed by PluginRegistry

  codeSnippets = [];
  //获取插件类实例
  init() {
    const plugin = registerPlugin(this);
    setPlugin(plugin);
  }

  // Delegate events to enabled plugins through registry
  private delegateEvent(eventName: string, eventData: any) {
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled && plugin[eventName]) {
        try {
          plugin[eventName](eventData);
        } catch (error) {
          console.error(
            `Error in ${eventName} for plugin ${plugin.name}:`,
            error
          );
        }
      }
    }
  }

  //绑定文档块右键菜单
  editortitleiconEvent(eventData: any) {
    this.delegateEvent("editortitleiconEvent", eventData);
  }

  mobilekeyboardshowEvent(eventData: any) {
    this.delegateEvent("mobilekeyboardshowEvent", eventData);
  }

  mobilekeyboardhideEvent(eventData: any) {
    this.delegateEvent("mobilekeyboardhideEvent", eventData);
  }

  //编辑器切换事件
  switchProtyleEvent(eventData: any) {
    this.delegateEvent("switchProtyleEvent", eventData);
  }

  openSiyuanUrlPluginEvent(eventData: any) {
    this.delegateEvent("openSiyuanUrlPluginEvent", eventData);
  }

  //块右键菜单
  private blockIconEvent(eventData: any) {
    this.delegateEvent("blockIconEvent", eventData);
  }

  private linkMenuEvent(eventData: any) {
    this.delegateEvent("linkMenuEvent", eventData);
  }

  //App 准备好时加载
  public async onLayoutReady() {
    const plugins = this.pluginRegistry.getAllPlugins();
    // 默认添加 topBar，方便实时加载
    let needAddTopBar = false;
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.addMenuItem) {
        needAddTopBar = true;
        break;
      }
    }

    if (needAddTopBar) {
      const topBarElement = this.addTopBar({
        icon: this.myIcon,
        title: "渡渡鸟工具箱",
        position: "right",
        callback: () => {
          if (isMobile) {
            this.addMenu();
          } else {
            let rect = topBarElement.getBoundingClientRect();
            // 如果被隐藏，则使用更多按钮
            if (rect.width === 0) {
              rect = document.querySelector("#barMore").getBoundingClientRect();
            }
            if (rect.width === 0) {
              rect = document
                .querySelector("#barPlugins")
                .getBoundingClientRect();
            }
            //console.log("rect", rect);
            this.addMenu(rect);
          }
        },
      });
    }

    // Call onLayoutReady for enabled plugins
    // //console.log("onLayoutReady");

    // //console.log("onLayoutReady", plugins);
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.onLayoutReady) {
        // //console.log("onLayoutReady", plugin.name);
        try {
          await plugin.onLayoutReady();
        } catch (error) {
          console.error(
            `Failed to call onLayoutReady for plugin ${plugin.name}:`,
            error
          );
        }
      }
    }

    this.registerProtyleStaticListener();
  }

  addMenu(rect?: DOMRect) {
    const menu = new Menu("siyuan-dodo-topbar");
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.addMenuItem) {
        try {
          plugin.addMenuItem(menu);
        } catch (error) {
          console.error(
            `Failed to call onLayoutReady for plugin ${plugin.name}:`,
            error
          );
        }
      }
    }
    
    // 添加设置菜单项（最后一个）
    menu.addItem({
      icon: "iconSettings",
      label: "设置",
      click: () => {
        this.openGlobalSetting();
      }
    });
    
    if (isMobile) {
      menu.fullscreen();
    } else {
      menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
      });
    }
  }
  // 在边栏上注入的图标在onLayoutReady执行；为了避免同步插件配置改变后会执行 unload 逻辑，因此 load 需要再执行一下。
  showMoreIconsOnBar() {
    // This method is now handled by individual plugins in their onload methods
    // Legacy plugins that haven't been migrated yet would need to be handled here
    // For now, this is a placeholder for backward compatibility
  }

  //App 启动时加载
  public async onload() {
    this.init();

    //console.log("onload");
    //载入配置
    await settings.load();

    //console.log("initData", plugin.data);

    // Scan and load all plugins
    await this.pluginRegistry.scanPlugins();

    await settings.initData();

    // Initialize enabled plugins
    await this.pluginRegistry.initializeEnabledPlugins();

    this.addIcons(`<symbol id="iconFace" viewBox="0 0 32 32">
<path d="M13.667 17.333c0 0.92-0.747 1.667-1.667 1.667s-1.667-0.747-1.667-1.667 0.747-1.667 1.667-1.667 1.667 0.747 1.667 1.667zM20 15.667c-0.92 0-1.667 0.747-1.667 1.667s0.747 1.667 1.667 1.667 1.667-0.747 1.667-1.667-0.747-1.667-1.667-1.667zM29.333 16c0 7.36-5.973 13.333-13.333 13.333s-13.333-5.973-13.333-13.333 5.973-13.333 13.333-13.333 13.333 5.973 13.333 13.333zM14.213 5.493c1.867 3.093 5.253 5.173 9.12 5.173 0.613 0 1.213-0.067 1.787-0.16-1.867-3.093-5.253-5.173-9.12-5.173-0.613 0-1.213 0.067-1.787 0.16zM5.893 12.627c2.28-1.293 4.040-3.4 4.88-5.92-2.28 1.293-4.040 3.4-4.88 5.92zM26.667 16c0-1.040-0.16-2.040-0.44-2.987-0.933 0.2-1.893 0.32-2.893 0.32-4.173 0-7.893-1.92-10.347-4.92-1.4 3.413-4.187 6.093-7.653 7.4 0.013 0.053 0 0.12 0 0.187 0 5.88 4.787 10.667 10.667 10.667s10.667-4.787 10.667-10.667z"></path>
</symbol>
<symbol id="iconSaving" viewBox="0 0 32 32">
<path d="M20 13.333c0-0.733 0.6-1.333 1.333-1.333s1.333 0.6 1.333 1.333c0 0.733-0.6 1.333-1.333 1.333s-1.333-0.6-1.333-1.333zM10.667 12h6.667v-2.667h-6.667v2.667zM29.333 10v9.293l-3.76 1.253-2.24 7.453h-7.333v-2.667h-2.667v2.667h-7.333c0 0-3.333-11.28-3.333-15.333s3.28-7.333 7.333-7.333h6.667c1.213-1.613 3.147-2.667 5.333-2.667 1.107 0 2 0.893 2 2 0 0.28-0.053 0.533-0.16 0.773-0.187 0.453-0.347 0.973-0.427 1.533l3.027 3.027h2.893zM26.667 12.667h-1.333l-4.667-4.667c0-0.867 0.12-1.72 0.347-2.547-1.293 0.333-2.347 1.293-2.787 2.547h-8.227c-2.573 0-4.667 2.093-4.667 4.667 0 2.507 1.627 8.867 2.68 12.667h2.653v-2.667h8v2.667h2.68l2.067-6.867 3.253-1.093v-4.707z"></path>
</symbol>`);

    if (this.isGlobalEventListenersRegistered) {
      return;
    }

    // Bind global events that plugins may need
    this.eventBus.on("click-blockicon", this.handleBlockIconEvent);
    this.eventBus.on("switch-protyle", this.handleSwitchProtyleEvent);
    this.eventBus.on(
      "click-editortitleicon",
      this.handleEditortitleiconEvent
    );
    this.eventBus.on(
      "mobile-keyboard-show",
      this.handleMobileKeyboardShowEvent
    );
    this.eventBus.on(
      "mobile-keyboard-hide",
      this.handleMobileKeyboardHideEvent
    );
    this.eventBus.on(
      "open-siyuan-url-plugin",
      this.handleOpenSiyuanUrlPluginEvent
    );

    this.eventBus.on("open-menu-link", this.handleLinkMenuEvent);
    this.isGlobalEventListenersRegistered = true;
  }

  async onDataChanged() {
    // Handle plugin enable/disable changes
    await this.pluginRegistry.initializeEnabledPlugins();
    await this.pluginRegistry.unloadDisabledPlugins();

    // Call onDataChanged for enabled plugins
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.onDataChanged) {
        try {
          await plugin.onDataChanged();
        } catch (error) {
          console.error(
            `Error in onDataChanged for plugin ${plugin.name}:`,
            error
          );
        }
      }
    }
  }

  //卸载逻辑
  async onunload() {
    this.unregisterGlobalEventListeners();
    this.unregisterProtyleStaticListener();
    await this.pluginRegistry.unloadAllPlugins();
  }

  private registerProtyleStaticListener() {
    if (this.isProtyleStaticListenerRegistered) {
      return;
    }

    this.eventBus.on("loaded-protyle-static", this.handleLoadedProtyleStatic);
    this.isProtyleStaticListenerRegistered = true;
  }

  private unregisterProtyleStaticListener() {
    if (!this.isProtyleStaticListenerRegistered) {
      return;
    }

    this.eventBus.off("loaded-protyle-static", this.handleLoadedProtyleStatic);
    this.isProtyleStaticListenerRegistered = false;
  }

  private unregisterGlobalEventListeners() {
    if (!this.isGlobalEventListenersRegistered) {
      return;
    }

    this.eventBus.off("click-blockicon", this.handleBlockIconEvent);
    this.eventBus.off("switch-protyle", this.handleSwitchProtyleEvent);
    this.eventBus.off(
      "click-editortitleicon",
      this.handleEditortitleiconEvent
    );
    this.eventBus.off(
      "mobile-keyboard-show",
      this.handleMobileKeyboardShowEvent
    );
    this.eventBus.off(
      "mobile-keyboard-hide",
      this.handleMobileKeyboardHideEvent
    );
    this.eventBus.off(
      "open-siyuan-url-plugin",
      this.handleOpenSiyuanUrlPluginEvent
    );
    this.eventBus.off("open-menu-link", this.handleLinkMenuEvent);
    this.isGlobalEventListenersRegistered = false;
  }

  openSetting(): void {
    this.openGlobalSetting();
  }

  openGlobalSetting(): void {
    // 移动端屏幕小，居中悬浮窗放不下，直接铺满；桌面端保持居中大窗
    const fullscreen = isMobile;
    let dialog = new Dialog({
      title: "配置",
      content: `<div id="dodo-setting-panel" style="height: ${
        fullscreen ? "100%" : "600px"
      };"></div>`,
      width: fullscreen ? "100%" : "1000px",
      height: fullscreen ? "100%" : "auto",
      destroyCallback: () => {
        pannel.$destroy();
      },
    });

    if (fullscreen) {
      // 思源移动端 dialog 容器自带圆角且宽度受 88vw 约束（不同版本行为不一），
      // 内联样式优先级最高，铺满时统一覆盖
      const container = dialog.element.querySelector(
        ".b3-dialog__container"
      ) as HTMLElement;
      container.style.maxWidth = "100%";
      container.style.borderRadius = "0";
    }

    let pannel = new SettingPannel({
      target: dialog.element.querySelector("#dodo-setting-panel"),
    });
  }

  updateProtyleToolbar(toolbar: Array<string | any>) {
    const plugins = this.pluginRegistry?.getAllPlugins();
    if (!plugins) return toolbar;
    // //console.log("updateProtyleToolbar", plugins);
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.updateProtyleToolbar) {
        try {
          toolbar = plugin.updateProtyleToolbar(toolbar);
        } catch (error) {
          console.error(
            `Error in updateProtyleToolbar for plugin ${plugin.name}:`,
            error
          );
        }
      }
    }
    return toolbar;
  }
}
