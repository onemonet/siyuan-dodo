import {
  Dialog,
  showMessage,
  getFrontend,
  fetchPost,
  fetchSyncPost,
  getAllModels,
  openTab,
  Custom,
  Protyle,
} from "siyuan";
import "./index.scss";

import {
  base64ToUnicode,
  unicodeToBase64,
  blobToDataURL,
  dataURLToBlob,
  HTMLToElement,
} from "./utils";
import { matchHotKey, getCustomHotKey } from "./utils/hotkey";
import defaultImageContent from "./default.json";
import { sendCanvasCommand, registerExcalidrawAgentCapabilities } from "./agent-tools";
import { createSiYuanSkillRuntime } from "./libs/skill-runtime";

import type { SubPlugin } from "../types/plugin";
import { plugin } from "../utils";
import { settings } from "../settings";
import { addProtyleSlash } from "../myscripts/syUtils";
import { migrateExcalidrawData, normalizeConfig } from "./config";
import { normalizeToolbarPreferences, toolbarPatch } from "./toolbar-preferences";
import { browserEditorUrl } from "./browser-editor-url";
import { NativeEmbedBridge } from "./native-embed-bridge";
import zhCN from "./i18n/zh_CN.json";
import enUS from "./i18n/en_US.json";

const STORAGE_NAME = "config.json";
const EXCALIDRAW_BUILD_ID = typeof process !== "undefined" ? process.env.DODO_EXCALIDRAW_BUILD_ID || "dev" : "dev";

export default class ExcalidrawPlugin implements SubPlugin {
  name = "excalidraw";
  displayName = "Excalidraw";
  enabled = false;
  private active = false;
  private registered = false;
  private capabilitiesRegistered = false;
  private generation = 0;
  private dialogs = new Set<Dialog>();
  private editors = new Map<HTMLIFrameElement, () => void>();
  private closing = new WeakSet<HTMLIFrameElement>();
  private refreshingEditors = new Map<HTMLIFrameElement, Promise<void>>();
  private toolbarSaveQueue: Promise<unknown> = Promise.resolve();
  private readonly nativeBlockBridge = new NativeEmbedBridge(() => this.app, () => [...this.editors.keys()]);
  private readonly handleEnhancementMessage = (event: MessageEvent) => {
    if (!this.active || event.origin !== location.origin) return;
    const frame = [...this.editors.keys()].find(frame => frame.contentWindow === event.source);
    if (!frame) return;
    let message: any;
    try { message = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!["enhancementPreferencesRequest", "enhancementPreferencesSave"].includes(message?.event) || typeof message.requestId !== "string") return;
    const reply = (data: object) => { if (frame.isConnected) frame.contentWindow?.postMessage(JSON.stringify({ event: "enhancementPreferencesResult", requestId: message.requestId, ...data }), location.origin); };
    if (message.event === "enhancementPreferencesRequest") {
      reply({ preferences: normalizeToolbarPreferences(settings.get(this.name)) });
      return;
    }
    this.toolbarSaveQueue = this.toolbarSaveQueue.catch(() => {}).then(async () => {
      if (!this.active || !frame.isConnected) return;
      const previous = normalizeToolbarPreferences(settings.get(this.name));
      try {
        const patch = toolbarPatch(message.patch);
        for (const [key, value] of Object.entries(patch)) settings.setBySpace(this.name, key, value);
        await settings.save();
        reply({ preferences: normalizeToolbarPreferences(settings.get(this.name)) });
        this.broadcastToolbarPreferences();
      } catch (error) {
        for (const [key, value] of Object.entries(previous)) settings.setBySpace(this.name, key, value);
        reply({ error: error instanceof Error ? error.message : String(error) });
      }
    });
  };

  private broadcastToolbarPreferences() {
    const message = JSON.stringify({ event: "enhancementPreferencesChanged", preferences: normalizeToolbarPreferences(settings.get(this.name)) });
    for (const frame of this.editors.keys()) if (frame.isConnected) frame.contentWindow?.postMessage(message, location.origin);
  }
  private get data() { return { [STORAGE_NAME]: normalizeConfig(settings.get("excalidraw")) }; }
  private get i18n() { return window.siyuan.config.lang.startsWith("zh") ? zhCN : enUS; }
  private get app() { return plugin.app; }
  private get isMobile() { return ["mobile", "browser-mobile"].includes(getFrontend()); }
  private get eventBus() { return plugin.eventBus; }
  private addFloatLayer(options: Parameters<typeof plugin.addFloatLayer>[0]) { plugin.addFloatLayer(options); }
  public EDIT_TAB_TYPE = "excalidraw-edit-tab";

  private _mutationObserver;
  private _openMenuImageHandler;
  private _globalKeyDownHandler;



  async onload() {
    if ((window.siyuan as any).plugins?.some((item: any) => item.name === "siyuan-dodo-excalidraw")) {
      throw new Error("请先停用独立的 Dodo Excalidraw 插件，再启用工具箱中的 Excalidraw。");
    }
    await migrateExcalidrawData(settings, plugin.name);
    this.active = true;
    document.documentElement.setAttribute("data-dodo-excalidraw-enabled", "true");
    const generation = ++this.generation;

    if (!this.capabilitiesRegistered) {
      this.capabilitiesRegistered = registerExcalidrawAgentCapabilities(plugin, (canvasId) => {
        if (!this.active) throw new Error("Excalidraw 子模块已停用。");
        return this.getAgentTargetIframe(canvasId);
      }, () => this.active);
    }
    const skills = createSiYuanSkillRuntime({ pluginName: plugin.name });
    const skill = await skills.registerPluginSkill("skills/dodo-toolbox-excalidraw").catch(error => ({ code: "REGISTER_FAILED", error: String(error) }));
    if (!("action" in skill)) console.warn(`[siyuan-dodo-excalidraw] Agent Skill registration failed: ${skill.code} ${skill.error ?? ""}`);

    this.decorateImage = (blockElement: HTMLElement) => {
      const imageElement = blockElement.querySelector("img") as HTMLImageElement;
      if (imageElement) {
        const imageURL = imageElement.getAttribute("data-src");
        const imageURLRegex = /^assets\/(?:.+\/)?excalidraw-.+\.(?:svg|png)$/;
        if (!imageURLRegex.test(imageURL)) return;
        this.getExcalidrawImageInfo(imageURL, false).then((imageInfo) => {
          if (imageInfo) {
            if (!this.active || generation !== this.generation || !blockElement.isConnected) return;
            if (blockElement.querySelector("[data-dodo-excalidraw-edit]")) return;
            if (this.data[STORAGE_NAME].labelDisplay !== "noLabel") this.updateAttrLabel(imageInfo, blockElement);

            const actionElement = blockElement.querySelector(".protyle-action") as HTMLElement;
            if (actionElement) {
              const editBtnElement = HTMLToElement(`<span data-dodo-excalidraw-edit aria-label="${this.i18n.editExcalidraw}" data-position="4north" class="ariaLabel protyle-icon"><svg><use xlink:href="#iconEdit"></use></svg></span>`);
              editBtnElement.addEventListener("click", (event: PointerEvent) => {
                event.preventDefault();
                event.stopPropagation();
                this.getExcalidrawImageInfo(imageElement.getAttribute("data-src"), false).then((imageInfo) => {
                  if (!this.active || !imageInfo) return;
                  if (!this.isMobile && this.data[STORAGE_NAME].editWindow === 'tab') {
                    this.openEditTab(imageInfo);
                  } else {
                    this.openEditDialog(imageInfo);
                  }
                });
              });
              actionElement.insertAdjacentElement('afterbegin', editBtnElement);
              for (const child of actionElement.children) {
                child.classList.toggle('protyle-icon--only', false);
                child.classList.toggle('protyle-icon--first', false);
                child.classList.toggle('protyle-icon--last', false);
              }
              if (actionElement.children.length == 1) {
                actionElement.firstElementChild.classList.toggle('protyle-icon--only', true);
              }
              else if (actionElement.children.length > 1) {
                actionElement.firstElementChild.classList.toggle('protyle-icon--first', true);
                actionElement.lastElementChild.classList.toggle('protyle-icon--last', true);
              }
            }
          }
        }).catch(error => console.warn("Excalidraw image decoration failed", error));
      }
    };
    this._mutationObserver = this.setAddImageBlockMuatationObserver(document.body, this.decorateImage);

    if (!this.registered) this.setupEditTab();

    plugin.protyleSlash ??= [];
    addProtyleSlash({
      filter: ["excalidraw"],
      id: "dodo-excalidraw",
      html: `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconImage"></use></svg><span class="b3-list-item__text">Excalidraw</span></div>`,
      callback: (protyle, _nodeElement) => {
        if (!this.active) return;
        this.newExcalidrawImage(protyle, (imageInfo) => {
          if (!this.isMobile && this.data[STORAGE_NAME].editWindow === 'tab') {
            this.openEditTab(imageInfo);
          } else {
            this.openEditDialog(imageInfo);
          }
        });
      },
    });
    // 注册快捷键（都默认置空）
    if (!this.registered) plugin.addCommand({
      langKey: "dodoCreateExcalidraw",
      langText: "创建 Excalidraw 图像",
      hotkey: "",
      editorCallback: (protyle) => {
        if (!this.active) return;
        this.newExcalidrawImage(protyle.getInstance(), (imageInfo) => {
          if (!this.isMobile && this.data[STORAGE_NAME].editWindow === 'tab') {
            this.openEditTab(imageInfo);
          } else {
            this.openEditDialog(imageInfo);
          }
        });
      },
    });

    this._openMenuImageHandler = this.openMenuImageHandler.bind(this);
    this.eventBus.on("open-menu-image", this._openMenuImageHandler);

    this._globalKeyDownHandler = this.globalKeyDownHandler.bind(this);
    document.documentElement.addEventListener("keydown", this._globalKeyDownHandler);
    window.addEventListener("message", this.handleEnhancementMessage);
    this.nativeBlockBridge.start();

    this.registered = true;
    // Decorate already-open documents without reloading their editors.
    document.querySelectorAll("div[data-type='NodeParagraph']").forEach((element: HTMLElement) => this.decorateImage(element));
  }

  onLayoutReady(): void {
    const selector = `iframe[src*="/plugins/${plugin.name}/excalidraw/app/"]`;
    document.querySelectorAll<HTMLIFrameElement>(selector).forEach(frame => {
      if (new URL(frame.src, location.href).searchParams.get("dodoBuild") !== EXCALIDRAW_BUILD_ID) void this.refreshEditorBuild(frame);
    });
  }

  private decorateImage: (element: HTMLElement) => void;

  async onunload() {
    // A failed write aborts disabling; leave the live editor available for retry.
    await Promise.all([...this.editors.keys()].map(frame => this.saveEditor(frame)));
    await this.toolbarSaveQueue;
    this.active = false;
    document.documentElement.removeAttribute("data-dodo-excalidraw-enabled");
    ++this.generation;
    this._mutationObserver?.disconnect();
    this.eventBus.off("open-menu-image", this._openMenuImageHandler);
    document.documentElement.removeEventListener("keydown", this._globalKeyDownHandler);
    window.removeEventListener("message", this.handleEnhancementMessage);
    this.nativeBlockBridge.stop();
    plugin.protyleSlash = plugin.protyleSlash.filter(item => item.id !== "dodo-excalidraw");
    for (const close of [...this.editors.values()]) close();
    for (const dialog of this.dialogs) dialog.destroy();
    this.dialogs.clear();
    document.querySelectorAll("[data-dodo-excalidraw-edit], .label--embed-excalidraw").forEach(node => node.remove());
  }

  onDataChanged() {
    // Open canvases keep their save timers until closed; new editors use new settings.
    if (!this.active) return;
    this.broadcastToolbarPreferences();
    document.querySelectorAll(".label--embed-excalidraw").forEach(node => node.remove());
    document.querySelectorAll("[data-dodo-excalidraw-edit]").forEach(node => node.remove());
    document.querySelectorAll("div[data-type='NodeParagraph']").forEach((node: HTMLElement) => this.decorateImage(node));
  }

  onSettingAction(key: string) {
    if (key === "snippet-settings") return this.openSnippetSettings();
    if (key === "toolbar-customize") {
      const frame = this.getAgentTargetIframe();
      if (!frame) { showMessage("请先打开一张 Excalidraw 画布。"); return; }
      frame.contentWindow?.postMessage(JSON.stringify({ event: "enhancementOpenSettings" }), location.origin);
    }
  }

  private async openSnippetSettings() {
    const snippets = await this.getSnippets();
    const dialog = new Dialog({ title: "Excalidraw 代码片段", content: '<div class="b3-dialog__content"></div><div class="b3-dialog__action"><button class="b3-button">保存</button></div>', width: this.isMobile ? "92vw" : "600px" });
    const content = dialog.element.querySelector(".b3-dialog__content")!;
    const selected = new Set(this.data[STORAGE_NAME].snippets);
    for (const snippet of snippets) {
      const label = document.createElement("label");
      label.className = "b3-label fn__flex";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.id = snippet.id;
      input.checked = selected.has(snippet.id);
      label.append(input, document.createTextNode(` ${snippet.type.toUpperCase()} · ${snippet.name}`));
      content.append(label);
    }
    dialog.element.querySelector("button")!.addEventListener("click", async () => {
      settings.setBySpace(this.name, "snippets", [...content.querySelectorAll<HTMLInputElement>("input:checked")].map(input => input.dataset.id));
      await settings.save();
      dialog.destroy();
    });
  }

  private async saveEditor(frame: HTMLIFrameElement) {
    const canvasId = new URL(frame.src, location.href).searchParams.get("imageURL");
    const result = await sendCanvasCommand(() => frame, "save", { canvasId });
    if (!result?.saved) throw new Error(result?.error || "画布保存未完成，请等待加载完成后重试。");
  }

  private async refreshEditorBuild(frame: HTMLIFrameElement) {
    const pending = this.refreshingEditors.get(frame);
    if (pending) return pending;
    const refresh = (async () => {
      await this.saveEditor(frame);
      if (!frame.isConnected) return;
      const url = new URL(frame.src, location.href);
      if (url.searchParams.get("dodoBuild") === EXCALIDRAW_BUILD_ID) return;
      url.searchParams.set("dodoBuild", EXCALIDRAW_BUILD_ID);
      frame.src = url.href;
    })();
    this.refreshingEditors.set(frame, refresh);
    try { await refresh; }
    catch (error) {
      showMessage(`Excalidraw 界面更新失败，旧画布仍保持打开：${error instanceof Error ? error.message : error}`, 7000, "error");
    } finally { this.refreshingEditors.delete(frame); }
  }

  private async closeEditor(frame: HTMLIFrameElement, close: () => void) {
    if (this.closing.has(frame)) return;
    this.closing.add(frame);
    try { await this.saveEditor(frame); close(); }
    catch (error) { showMessage(`Excalidraw：${error instanceof Error ? error.message : error}`, 6000, "error"); }
    finally { this.closing.delete(frame); }
  }

  public setAddImageBlockMuatationObserver(element: HTMLElement, callback: (blockElement: HTMLElement) => void): MutationObserver {
    const mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const addedElement = node as HTMLElement;
              if (addedElement.matches("div[data-type='NodeParagraph']")) {
                if (addedElement.querySelector(".img[data-type='img'] img")) {
                  callback(addedElement as HTMLElement);
                }
              } else {
                addedElement.querySelectorAll("div[data-type='NodeParagraph']").forEach((blockElement: HTMLElement) => {
                  if (blockElement.querySelector(".img[data-type='img'] img")) {
                    callback(blockElement);
                  }
                })
              }
            }
          });
        }
      }
    });

    mutationObserver.observe(element, {
      childList: true,
      subtree: true
    });

    return mutationObserver;
  }

  public async getExcalidrawImageInfo(imageURL: string, reload: boolean): Promise<ExcalidrawImageInfo | null> {
    if (!imageURL || imageURL.split("/").some(part => part === ".." || part === ".") || /[?#\\]/.test(imageURL)) return null;
    const imageURLRegex = /^assets\/.+\.(?:svg|png)$/;
    if (!imageURLRegex.test(imageURL)) return null;

    const imageContent = await this.getExcalidrawImage(imageURL, reload);
    if (!imageContent) return null;

    if (!base64ToUnicode(imageContent.split(',').pop()).includes("application/vnd.excalidraw+json")) return null;

    const imageInfo: ExcalidrawImageInfo = {
      imageURL: imageURL,
      data: imageContent,
      format: imageURL.endsWith(".svg") ? "svg" : "png",
    }
    return imageInfo;
  }

  public getPlaceholderImageContent(format: 'svg' | 'png'): string {
    let imageContent = defaultImageContent[format];
    return imageContent;
  }

  public newExcalidrawImage(protyle: Protyle, callback?: (imageInfo: ExcalidrawImageInfo) => void) {
    const format = this.data[STORAGE_NAME].embedImageFormat;
    const imageName = `excalidraw-image-${window.Lute.NewNodeID()}.${format}`;
    const placeholderImageContent = this.getPlaceholderImageContent(format);
    const blob = dataURLToBlob(placeholderImageContent);
    const file = new File([blob], imageName, { type: blob.type });
    const formData = new FormData();
    formData.append('path', `data/assets/${imageName}`);
    formData.append('file', file);
    formData.append('isDir', 'false');
    if (!this.active) return;
    fetchPost('/api/file/putFile', formData, (response) => {
      if (response.code !== 0) { showMessage(response.msg || "画布创建失败。", 6000, "error"); return; }
      const imageURL = `assets/${imageName}`;
      protyle.insert(`![](${imageURL})`);
      const imageInfo: ExcalidrawImageInfo = {
        imageURL: imageURL,
        data: placeholderImageContent,
        format: format,
      };
      if (callback) {
        callback(imageInfo);
      }
    });
  }

  public async getExcalidrawImage(imageURL: string, reload: boolean): Promise<string> {
    const response = await fetch(imageURL, { cache: reload ? 'reload' : 'default' });
    if (!response.ok) return "";
    const blob = await response.blob();
    return await blobToDataURL(blob);
  }

  public updateAttrLabel(imageInfo: ExcalidrawImageInfo, blockElement: HTMLElement) {
    if (!this.active || !imageInfo) return;

    if (this.data[STORAGE_NAME].labelDisplay === "noLabel") return;

    const attrElement = blockElement.querySelector(".protyle-attr") as HTMLDivElement;
    if (attrElement) {
      const labelHTML = `<span>Excalidraw</span>`;
      let labelElement = attrElement.querySelector(".label--embed-excalidraw") as HTMLDivElement;
      if (labelElement) {
        labelElement.innerHTML = labelHTML;
      } else {
        labelElement = document.createElement("div");
        labelElement.classList.add("label--embed-excalidraw");
        if (this.data[STORAGE_NAME].labelDisplay === "showLabelAlways") {
          labelElement.classList.add("label--embed-excalidraw--always");
        }
        labelElement.innerHTML = labelHTML;
        attrElement.prepend(labelElement);
      }
    }
  }

  public openImageInBrowser(imageURL: string) {
    const config = this.data[STORAGE_NAME];
    const link = browserEditorUrl(imageURL, plugin.name, location.href, {
      dodoBuild: EXCALIDRAW_BUILD_ID,
      lang: window.siyuan.config.lang.replace("_", "-"),
      dark: this.isDarkMode() ? 1 : 0,
      enableAutoSave: config.enableAutoSave,
      autoSaveInterval: config.autoSaveInterval,
      fullSaveDelay: config.fullSaveDelay,
    });
    window.open(link, "_blank", "noopener,noreferrer");
  }

  private openMenuImageHandler({ detail }) {
    if (!this.active) return;
    const generation = this.generation;
    const selectedElement = detail.element;
    const imageElement = selectedElement.querySelector("img") as HTMLImageElement;
    if (!imageElement) return;
    const imageURL = imageElement.dataset.src;
    this.getExcalidrawImageInfo(imageURL, true).then((imageInfo: ExcalidrawImageInfo) => {
      if (this.active && generation === this.generation && imageInfo) {
        window.siyuan.menus.menu.addItem({
          id: "edit-excalidraw",
          icon: 'iconEdit',
          label: `${this.i18n.editExcalidraw}`,
          index: 1,
          click: () => {
            if (!this.isMobile && this.data[STORAGE_NAME].editWindow === 'tab') {
              this.openEditTab(imageInfo);
            } else {
              this.openEditDialog(imageInfo);
            }
          }
        });
        window.siyuan.menus.menu.addItem({
          id: "open-excalidraw-in-browser",
          icon: "iconLink",
          label: "在浏览器中打开 Excalidraw",
          index: 2,
          click: () => this.openImageInBrowser(imageInfo.imageURL),
        });
      }
    })
  }

  private getActiveCustomTab(type: string): Custom {
    const allCustoms = getAllModels().custom;
    const activeTabElement = document.querySelector(".layout__wnd--active .item--focus");
    if (activeTabElement) {
      const tabId = activeTabElement.getAttribute("data-id");
      for (const custom of allCustoms as any[]) {
        if (custom.type == plugin.name + type && custom.tab.headElement?.getAttribute('data-id') == tabId) {
          return custom;
        };
      }
    }
    return null;
  }

  private tabHotKeyEventHandler = (event: KeyboardEvent, custom?: Custom) => {
    // 恢复默认处理方式的快捷键
    if (custom) {
      const isGoToEditTabNext = matchHotKey(getCustomHotKey(window.siyuan.config.keymap.general.goToEditTabNext), event);
      const isGoToEditTabPrev = matchHotKey(getCustomHotKey(window.siyuan.config.keymap.general.goToEditTabPrev), event);
      const isGoToTabNext = matchHotKey(getCustomHotKey(window.siyuan.config.keymap.general.goToTabNext), event);
      const isGoToTabPrev = matchHotKey(getCustomHotKey(window.siyuan.config.keymap.general.goToTabPrev), event);
      if (isGoToEditTabNext || isGoToEditTabPrev || isGoToTabNext || isGoToTabPrev) {
        event.preventDefault();
        event.stopPropagation();
        const clonedEvent = new KeyboardEvent(event.type, event);
        window.dispatchEvent(clonedEvent);
      }
    }

    // 自定义处理方式的快捷键
    const isFullscreenHotKey = matchHotKey(getCustomHotKey(window.siyuan.config.keymap.editor.general.fullscreen), event);
    const isCloseTabHotKey = matchHotKey(getCustomHotKey(window.siyuan.config.keymap.general.closeTab), event);
    if (isFullscreenHotKey || isCloseTabHotKey) {
      if (!custom) custom = this.getActiveCustomTab(this.EDIT_TAB_TYPE);
      if (custom) {
        event.preventDefault();
        event.stopPropagation();

        if (isFullscreenHotKey) {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            custom.element.requestFullscreen();
          }
        }
        if (isCloseTabHotKey) {
          const target = custom;
          const frame = target.element.querySelector("iframe");
          if (frame) void this.closeEditor(frame, () => target.tab.close());
        }
      }
    }
  };

  private globalKeyDownHandler = (event: KeyboardEvent) => {
    // 如果是在代码编辑器里使用快捷键，则阻止冒泡 https://github.com/YuxinZhaozyx/siyuan-embed-tikz/issues/1
    if (document.activeElement?.closest(".b3-dialog--open .excalidraw-edit-dialog")) {
      event.stopPropagation();
    }

    // 快捷键
    this.tabHotKeyEventHandler(event);
  };

  public setupEditTab() {
    const that = this;
    plugin.addTab({
      type: this.EDIT_TAB_TYPE,
      init() {
        if (!that.active) { this.element.textContent = "Excalidraw 子模块已停用。"; return; }
        const imageInfo: ExcalidrawImageInfo = this.data;
        const iframeID = encodeURIComponent(unicodeToBase64(`excalidraw-edit-tab-${imageInfo.imageURL}`));
        const editTabHTML = `
<div class="excalidraw-edit-tab">
    <iframe src="/plugins/${plugin.name}/excalidraw/app/?dodoBuild=${EXCALIDRAW_BUILD_ID}&lang=${window.siyuan.config.lang.replace('_', '-')}${that.isDarkMode() ? "&dark=1" : ""}&iframeID=${iframeID}&imageURL=${encodeURIComponent(imageInfo.imageURL)}&enableAutoSave=${that.data[STORAGE_NAME].enableAutoSave}&autoSaveInterval=${that.data[STORAGE_NAME].autoSaveInterval}&fullSaveDelay=${that.data[STORAGE_NAME].fullSaveDelay}"></iframe>
</div>`;
        this.element.innerHTML = editTabHTML;

        const iframe = this.element.querySelector("iframe");
        that.editors.set(iframe, () => this.tab.close());
        const head = this.tab.headElement as HTMLElement;
        const guardClose = (event: MouseEvent) => {
          if ((event.target as Element)?.closest('[data-type="close"], .item__close')) {
            event.preventDefault(); event.stopImmediatePropagation();
            void that.closeEditor(iframe, () => this.tab.close());
          }
        };
        head?.addEventListener("click", guardClose, true);
        iframe.focus();


        const keydownEventHandleer = (event: KeyboardEvent) => {
          that.tabHotKeyEventHandler(event, this);
        };
        const onInit = (_message: any) => {
          iframe.contentWindow.addEventListener("keydown", keydownEventHandleer);
        }

        const onReady = (_message: any) => {
          that.injectSnippetsToIframe(iframe);
        }

        const onSave = (message: any) => {
          const imageURL = message.imageURL;
          fetch(imageURL, { cache: 'reload' }).then(() => {
            document.querySelectorAll(`img[src='${imageURL}']`).forEach(imageElement => {
              (imageElement as HTMLImageElement).src = imageURL;
            });
          });
        }

        const onBrowseLibrary = (_message: any) => {
          void that.closeEditor(iframe, () => this.tab.close());
        };

        const onExit = (_message: any) => {
          void that.closeEditor(iframe, () => this.tab.close());
        };

        const onTriggleHoverBlock = (message: any) => {
          if (message.blockID) {
            that.addFloatLayer({
              refDefs: [{ refID: message.blockID, defIDs: [] }],
              x: message.x,
              y: message.y,
              isBacklink: false
            });
          }
        }

        const messageEventHandler = (event) => {
          if (event.source !== iframe.contentWindow || event.origin !== location.origin) return;
          if (event.data && event.data.length > 0) {
            try {
              var message = JSON.parse(event.data);
              if (message != null) {
                // console.log(message.event);
                if (message.event == "init") {
                  onInit(message);
                }
                else if (message.event == "ready") {
                  onReady(message);
                }
                else if (message.event == "save" || message.event == "autosave") {
                  onSave(message);
                }
                else if (message.event == "browseLibrary") {
                  onBrowseLibrary(message);
                }
                else if (message.event == "exit") {
                  onExit(message);
                }
                else if (message.event == 'triggleHoverBlock') {
                  onTriggleHoverBlock(message);
                }
              }
            }
            catch (err) {
              console.error(err);
            }
          }
        };

        window.addEventListener("message", messageEventHandler);
        this.beforeDestroy = () => {
          window.removeEventListener("message", messageEventHandler);
          iframe.contentWindow?.removeEventListener("keydown", keydownEventHandleer);
          head?.removeEventListener("click", guardClose, true);
          that.nativeBlockBridge.closeForCanvas(iframe);
          that.editors.delete(iframe);
        };
      }
    });
  }

  private focusEditor(imageURL: string): boolean {
    for (const frame of this.editors.keys()) {
      if (frame.isConnected && new URL(frame.src, location.href).searchParams.get("imageURL") === imageURL) {
        const custom = (getAllModels().custom as any[]).find(item => item.element?.contains(frame));
        custom?.tab?.headElement?.click();
        if (new URL(frame.src, location.href).searchParams.get("dodoBuild") !== EXCALIDRAW_BUILD_ID) void this.refreshEditorBuild(frame);
        frame.focus();
        return true;
      }
    }
    return false;
  }

  public openEditTab(imageInfo: ExcalidrawImageInfo) {
    if (!this.active || this.focusEditor(imageInfo.imageURL)) return;
    openTab({
      app: this.app,
      custom: {
        id: plugin.name + this.EDIT_TAB_TYPE,
        icon: "iconEdit",
        title: `${imageInfo.imageURL.split('/').pop()}`,
        data: imageInfo,
      }
    })
  }

  public openEditDialog(imageInfo: ExcalidrawImageInfo) {
    if (!this.active || this.focusEditor(imageInfo.imageURL)) return;
    const iframeID = encodeURIComponent(unicodeToBase64(`excalidraw-edit-dialog-${imageInfo.imageURL}`));
    const editDialogHTML = `
<div class="excalidraw-edit-dialog">
    <div class="edit-dialog-header resize__move"></div>
    <div class="edit-dialog-container">
        <div class="edit-dialog-editor">
            <iframe src="/plugins/${plugin.name}/excalidraw/app/?dodoBuild=${EXCALIDRAW_BUILD_ID}&lang=${window.siyuan.config.lang.replace('_', '-')}&fullscreenBtn=1${this.isDarkMode() ? "&dark=1" : ""}&iframeID=${iframeID}&imageURL=${encodeURIComponent(imageInfo.imageURL)}&enableAutoSave=${this.data[STORAGE_NAME].enableAutoSave}&autoSaveInterval=${this.data[STORAGE_NAME].autoSaveInterval}&fullSaveDelay=${this.data[STORAGE_NAME].fullSaveDelay}"></iframe>
        </div>
        <div class="fn__hr--b"></div>
    </div>
</div>
    `;

    const dialogDestroyCallbacks = [];

    const dialog = new Dialog({
      content: editDialogHTML,
      width: this.isMobile ? "92vw" : "90vw",
      height: "80vh",
      hideCloseIcon: true,
      destroyCallback: () => {
        dialogDestroyCallbacks.forEach(callback => callback());
        this.dialogs.delete(dialog);
      },
    });

    const iframe = dialog.element.querySelector("iframe") as HTMLIFrameElement;
    const closeButton = document.createElement("button");
    closeButton.className = "b3-button";
    closeButton.textContent = "保存并关闭";
    closeButton.addEventListener("click", () => void this.closeEditor(iframe, () => dialog.destroy()));
    dialog.element.querySelector(".edit-dialog-header")!.append(closeButton);
    this.dialogs.add(dialog);
    this.editors.set(iframe, () => dialog.destroy());
    dialogDestroyCallbacks.push(() => {
      this.nativeBlockBridge.closeForCanvas(iframe);
      this.editors.delete(iframe);
    });
    iframe.focus();


    const onInit = (_message: any) => {}

    const onReady = (_message: any) => {
      this.injectSnippetsToIframe(iframe);
    }

    const onSave = (message: any) => {
      const imageURL = message.imageURL;
      fetch(imageURL, { cache: 'reload' }).then(() => {
        document.querySelectorAll(`img[src='${imageURL}']`).forEach(imageElement => {
          (imageElement as HTMLImageElement).src = imageURL;
        });
      });
    }

    const onBrowseLibrary = (_message: any) => {
      void this.closeEditor(iframe, () => dialog.destroy());
    };

    const onExit = (_message: any) => {
      void this.closeEditor(iframe, () => dialog.destroy());
    };

    const onTriggleHoverBlock = (message: any) => {
      if (message.blockID) {
        this.addFloatLayer({
          refDefs: [{ refID: message.blockID, defIDs: [] }],
          x: message.x,
          y: message.y,
          isBacklink: false
        });
      }
    }

    let isFullscreen = false;
    let dialogContainerStyle = {
      width: "100vw",
      height: "100vh",
      maxWidth: "unset",
      maxHeight: "unset",
      top: "auto",
      left: "auto",
    };
    const switchFullscreen = () => {
      const dialogContainerElement = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
      if (dialogContainerElement) {
        isFullscreen = !isFullscreen;
        if (isFullscreen) {
          dialogContainerStyle.width = dialogContainerElement.style.width;
          dialogContainerStyle.height = dialogContainerElement.style.height;
          dialogContainerStyle.maxWidth = dialogContainerElement.style.maxWidth;
          dialogContainerStyle.maxHeight = dialogContainerElement.style.maxHeight;
          dialogContainerStyle.top = dialogContainerElement.style.top;
          dialogContainerStyle.left = dialogContainerElement.style.left;
          dialogContainerElement.style.width = "100vw";
          dialogContainerElement.style.height = "100vh";
          dialogContainerElement.style.maxWidth = "unset";
          dialogContainerElement.style.maxHeight = "unset";
          dialogContainerElement.style.top = "0";
          dialogContainerElement.style.left = "0";
        } else {
          dialogContainerElement.style.width = dialogContainerStyle.width;
          dialogContainerElement.style.height = dialogContainerStyle.height;
          dialogContainerElement.style.maxWidth = dialogContainerStyle.maxWidth;
          dialogContainerElement.style.maxHeight = dialogContainerStyle.maxHeight;
          dialogContainerElement.style.top = dialogContainerStyle.top;
          dialogContainerElement.style.left = dialogContainerStyle.left;
        }
      }
    }
    if (this.data[STORAGE_NAME].fullscreenEdit) {
      switchFullscreen();
    }

    const messageEventHandler = (event) => {
      if (event.source !== iframe.contentWindow || event.origin !== location.origin) return;
      if (event.data && event.data.length > 0) {
        try {
          var message = JSON.parse(event.data);
          if (message != null) {
            // console.log(message.event);
            if (message.event == "init") {
              onInit(message);
            }
            else if (message.event == "ready") {
              onReady(message);
            }
            else if (message.event == "save" || message.event == "autosave") {
              onSave(message);
            }
            else if (message.event == "browseLibrary") {
              onBrowseLibrary(message);
            }
            else if (message.event == "exit") {
              onExit(message);
            }
            else if (message.event == "toggleFullscreen") {
              switchFullscreen();
            }
            else if (message.event == 'triggleHoverBlock') {
              onTriggleHoverBlock(message);
            }
          }
        }
        catch (err) {
          console.error(err);
        }
      }
    };

    window.addEventListener("message", messageEventHandler);
    dialogDestroyCallbacks.push(() => {
      window.removeEventListener("message", messageEventHandler);
    });
  }

  private getAgentTargetIframe(canvasId?: string): HTMLIFrameElement | null {
    // The SiYuan Agent may be in a different tab: its canvas editor stays
    // mounted but getClientRects() is empty while that tab is hidden.
    const mountedFrames = () => Array.from(document.querySelectorAll<HTMLIFrameElement>(`iframe[src*='/plugins/${plugin.name}/excalidraw/app/']`))
      .filter((frame) => frame.isConnected && frame.contentWindow);
    if (canvasId) {
      const frames = mountedFrames()
        .filter((frame) => new URL(frame.src, location.href).searchParams.get('imageURL') === canvasId);
      if (frames.length === 0) throw new Error('未找到指定 canvasId 的画布编辑器。请确认它在当前思源窗口内打开，而非独立浏览器窗口。');
      if (frames.length > 1) throw new Error('指定 canvasId 对应多个编辑实例，请关闭重复的画布编辑器。');
      return frames[0];
    }
    const visibleFrames = (selector: string) => Array.from(document.querySelectorAll<HTMLIFrameElement>(selector))
      .filter((frame) => frame.isConnected && frame.contentWindow && frame.getClientRects().length > 0);
    const dialogFrames = visibleFrames(".b3-dialog--open .excalidraw-edit-dialog iframe");
    if (dialogFrames.length) return dialogFrames[dialogFrames.length - 1];

    try {
      const activeCustom = this.getActiveCustomTab(this.EDIT_TAB_TYPE) as any;
      const activeFrame = activeCustom?.element?.querySelector("iframe") as HTMLIFrameElement | null;
      if (activeFrame?.contentWindow) return activeFrame;
    } catch { /* fall back to the visible tab frame */ }

    const tabFrames = visibleFrames(".excalidraw-edit-tab iframe");
    if (tabFrames.length > 1) throw new Error('存在多个画布，请先激活目标画布后读取。');
    if (tabFrames.length === 1) return tabFrames[0];

    // Reading the canvas from an Agent tab should work even if the only
    // Excalidraw editor is currently hidden by SiYuan's tab switch.
    const frames = mountedFrames();
    if (frames.length === 1) return frames[0];
    if (frames.length > 1) throw new Error('存在多个已打开的画布，无法判断目标。请激活画布标签，或传入已读取的 canvasId。');
    return null;
  }

  public isDarkMode(): boolean {
    return this.data[STORAGE_NAME].themeMode === 'themeDark' || (this.data[STORAGE_NAME].themeMode === 'themeOS' && window.siyuan.config.appearance.mode === 1);
  }

  private async getSnippets(snippetIDs?: string[]): Promise<ISnippet[]> {
    const response = await fetchSyncPost("/api/snippet/getSnippet", { type: "all", enabled: 2 });
    if (response.code !== 0) {
      console.warn(`${plugin.name}: get snippets failed`);
    }
    let snippets = (response.data?.snippets ?? []) as ISnippet[];
    // 当指定snippetIDs时，只返回指定的snippets
    if (typeof snippetIDs !== 'undefined') {
      snippets = snippets.filter(snippet => this.data[STORAGE_NAME].snippets.includes(snippet.id));
    }
    return snippets;
  }

  private async injectSnippetsToIframe(iframe: HTMLIFrameElement) {
    const snippets = await this.getSnippets(this.data[STORAGE_NAME].snippets);
    if (!this.active || !iframe.isConnected) return;
    snippets.forEach((snippet: ISnippet) => {
      // The old bundle starts its own toolbar and background listeners.
      // Keep its source/settings intact while tools are migrated individually.
      if (/\/snippets\/custom\/excalidraw-v2\/dist\/excalidraw-v2\.(?:js|css)/.test(snippet.content)) return;
      let snippetElement: HTMLElement;
      if (snippet.type === 'css') {
        snippetElement = document.createElement('style');
        snippetElement.textContent = snippet.content;
      } else {
        snippetElement = document.createElement('script');
        snippetElement.setAttribute('type', 'text/javascript');
        snippetElement.textContent = snippet.content;
      }
      iframe.contentDocument?.head?.appendChild(snippetElement);
    });
  }

}
