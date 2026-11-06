import { showMessage } from "siyuan";
import { SubPlugin } from "../types/plugin";
import InsertCSS from "../myscripts/insertCSS";
import { addProtyleSlash } from "../myscripts/syUtils";
import { plugin as mainPlugin } from "../utils";
import { settings } from "../settings";
import pluginMetadata from "./plugin";
import { BlockquoteManager } from "./core/BlockquoteManager";
import { ATTRIBUTES, DELAYS } from "./constants";
import blockquoteStyles from "./styles/blockquote.css?inline";
import { getBlockAttrs, setBlockAttrs } from "../api";
import {
  SQL_BLOCK_TYPE,
  SqlBlockService,
} from "./sql/sql-block-service";
import {
  closeSqlSettings,
  openSqlSettings,
} from "./sql/sql-settings-dialog";
import { GalleryBlockService } from "./gallery/services/gallery-block-service";
import {
  closeGallerySettings,
  openGallerySettings,
} from "./gallery/gallery-settings-dialog";
import { FileBlockService } from "./file/file-block-service";
import {
  closeFileSettings,
  openFileSettings,
} from "./file/file-settings-dialog";
import FilePreviewRuntime from "./file/file-preview-runtime";
import {
  DEFAULT_FILE_PREVIEW_HEIGHT,
  FILE_DEFAULT_HEIGHT_SETTING_KEY,
} from "./file/iframe-template-service";

interface GalleryViewerInstance {
  destroyed: boolean;
  destroy(): void;
  show(): void;
}

type GalleryViewerConstructor = new (
  element: Element,
  options: Record<string, unknown>,
) => GalleryViewerInstance;

export default class CustomBlockPlugin implements SubPlugin {
  name = "custom-block";
  displayName = "自定义块";
  description = "自定义块能力";
  version = "2.5.0";
  enabled = false;

  private manager: BlockquoteManager | null = null;
  private cssInstance: InsertCSS | null = null;

  // ---- 图表块 / 时间线块 ----
  private chartObserver: MutationObserver | null = null;
  private readonly sqlSettingsBtnClass = "protyle-action__sql-settings";
  private readonly gallerySettingsBtnClass = "protyle-action__gallery-settings";
  private readonly fileSettingsBtnClass = "protyle-action__file-settings";
  private galleryViewer: GalleryViewerInstance | null = null;
  private galleryViewerHost: HTMLUListElement | null = null;
  private galleryViewerScriptPromise: Promise<GalleryViewerConstructor> | null = null;
  private readonly filePreviewRuntime = new FilePreviewRuntime();
  private handleGalleryPreviewMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;
    if (
      !data ||
      data.type !== "dodoGalleryPreviewImage" ||
      typeof data.blockId !== "string" ||
      !this.isGalleryFrameSource(data.blockId, event.source)
    ) {
      return;
    }

    const urls = (Array.isArray(data.urls) ? data.urls : [data.url])
      .map((url: unknown) => this.normalizeGalleryPreviewUrl(url))
      .filter((url: string | null): url is string => !!url);
    if (!urls.length) {
      return;
    }

    const index =
      typeof data.index === "number" && Number.isFinite(data.index)
        ? Math.max(0, Math.min(urls.length - 1, Math.round(data.index)))
        : 0;
    void this.openGalleryPreview(urls, index, typeof data.alt === "string" ? data.alt : "");
  };

  async onload(){
 await this.migrateLegacyFilePreviewSettings();
 this.filePreviewRuntime.onload();FileBlockService.initializePreviewActivation();
 this.cssInstance=new InsertCSS();this.cssInstance.id="custom-block";
 this.cssInstance.cssSnippets=blockquoteStyles;this.cssInstance.onload();
 this.manager=new BlockquoteManager();await this.manager.initialize();
 this.registerSlashCommands();this.startSettingsObserver();
 window.addEventListener("message",this.handleGalleryPreviewMessage);
}

  private async migrateLegacyFilePreviewSettings(): Promise<void> {
    const legacyHeight = settings.getBySpace("file-preview", "defaultHeight");
    if (typeof legacyHeight !== "number" || !Number.isFinite(legacyHeight) || legacyHeight <= 0) {
      return;
    }

    const currentHeight = settings.getBySpace(
      this.name,
      FILE_DEFAULT_HEIGHT_SETTING_KEY,
    );
    if (
      typeof currentHeight === "number" &&
      currentHeight !== DEFAULT_FILE_PREVIEW_HEIGHT
    ) {
      return;
    }
    if (legacyHeight === DEFAULT_FILE_PREVIEW_HEIGHT) {
      return;
    }

    settings.setBySpace(this.name, FILE_DEFAULT_HEIGHT_SETTING_KEY, legacyHeight);
    await settings.save();
  }

  async onLayoutReady(){this.manager?.applyToAll();this.ensureSettingsButtons();}

  async onProtyleLoaded(){this.ensureSettingsButtons();}

  async onDataChanged(context?:{group?:string;key?:string;value?:unknown}){
 this.manager?.destroy();this.manager=new BlockquoteManager();
 await this.manager.initialize();this.manager.applyToAll();
 this.registerSlashCommands();
 if(context?.key==="sql-enabled"&& !this.isSqlEnabled()){
  closeSqlSettings();this.removeSettingsButtons([this.sqlSettingsBtnClass]);
 }
 if(context?.key==="gallery-enabled"&&!this.isGalleryEnabled()){
  closeGallerySettings();this.removeSettingsButtons([this.gallerySettingsBtnClass]);
 }
}

  async onunload(){
 this.filePreviewRuntime.onunload();FileBlockService.destroyPreviewActivation();
 this.manager?.destroy();this.manager=null;
 this.cssInstance?.onunload();this.cssInstance=null;
 this.unregisterModuleSlash();
 closeGallerySettings();closeFileSettings();closeSqlSettings();
 this.closeGalleryViewer();
 this.removeSettingsButtons([this.sqlSettingsBtnClass,this.gallerySettingsBtnClass,this.fileSettingsBtnClass]);
 window.removeEventListener("message",this.handleGalleryPreviewMessage);
 this.chartObserver?.disconnect();this.chartObserver=null;
}

  blockIconEvent({ detail }: any) {
    const { menu, blockElements } = detail;
    if (!blockElements || blockElements.length !== 1) {
      return;
    }

    const blockElement = blockElements[0] as HTMLElement;
    const blockId = blockElement.dataset.nodeId;
    if (!blockId) {
      return;
    }

    if (this.isSqlEnabled() && SqlBlockService.isSqlBlock(blockElement)) {
      menu.addItem({
        icon: "iconSettings",
        label: "编辑 SQL 设置",
        click: () => {
          openSqlSettings(blockId);
        },
      });
      return;
    }

    // ---- 旧图册迁移 / 新相册块 ----
    if (this.isGalleryEnabled() && GalleryBlockService.isLegacyGalleryBlock(blockElement)) {
      menu.addItem({
        icon: "iconImage",
        label: "迁移为自定义相册",
        click: async () => {
          const result = await GalleryBlockService.migrateLegacyBlock(blockId);
          showMessage(
            result.success
              ? "已迁移为自定义相册"
              : result.message || "迁移相册失败",
          );
        },
      });
      return;
    }

    if (GalleryBlockService.isGalleryBlock(blockElement)) {
      return;
    }

    // ---- 文件块 / 旧文件块 ----
    if (FileBlockService.isFileBlock(blockElement)) {
      menu.addItem({
        icon: "iconCopy",
        label: "复制 Markdown",
        click: async () => {
          await this.copyFileMarkdown(blockId);
        },
      });
      return;
    }

    if (FileBlockService.isLegacyFileBlock(blockElement)) {
      menu.addItem({
        icon: "iconFile",
        label: "迁移为文件块",
        click: async () => {
          const result = await FileBlockService.migrateLegacyBlock(blockId);
          showMessage(
            result.success
              ? "已迁移为文件块"
              : result.message || "迁移文件块失败",
          );
        },
      });
      return;
    }

    const fileAssets = FileBlockService.extractAssetPaths(blockElement);
    if (fileAssets.length === 1) {
      menu.addItem({
        icon: "iconFile",
        label: "转换为文件块",
        click: async () => {
          const result = await FileBlockService.convertBlock(blockId, blockElement);
          showMessage(
            result.success
              ? "已转换为文件块"
              : result.message || "转换文件块失败",
          );
        },
      });
    }


  }

  private isSqlEnabled(): boolean {
    return settings.getBySpace(pluginMetadata.name, "sql-enabled") !== false;
  }

  private isGalleryEnabled(): boolean {
    return settings.getBySpace(pluginMetadata.name, "gallery-enabled") !== false;
  }

  private async copyFileMarkdown(blockId: string): Promise<void> {
    try {
      const attrs = await getBlockAttrs(blockId);
      const asset = FileBlockService.readStoredAsset(attrs);
      const markdown = asset ? FileBlockService.buildMarkdown(asset) : "";
      if (!markdown) {
        showMessage("当前块没有可用文件");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = markdown;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        if (!document.execCommand("copy")) {
          throw new Error("剪贴板不可用");
        }
        textarea.remove();
      }
      showMessage("已复制 Markdown");
    } catch (error) {
      showMessage(error instanceof Error ? `复制失败：${error.message}` : "复制 Markdown 失败");
    }
  }

  private registerSlashCommands() {
    this.unregisterModuleSlash();

    // ---- 计算块 ----
    if (settings.getBySpace(pluginMetadata.name, "math-enabled") !== false) {
      this.parseSlashEntries(
        settings.getBySpace(pluginMetadata.name, "math-slash-entries") as string
      ).forEach((entry, index) => {
        addProtyleSlash({
          id: `custom-block-math-${index}`,
          filter: entry.triggers,
          html: entry.label,
          callback: (protyle: any, nodeElement: HTMLElement) =>
            this.quickCreateMathBlock(protyle, nodeElement),
        });
      });
    }

    // ---- 折叠块 ----
    if (settings.getBySpace(pluginMetadata.name, "toggle-enabled") !== false) {
      this.parseSlashEntries(
        settings.getBySpace(pluginMetadata.name, "toggle-slash-entries") as string
      ).forEach((entry, index) => {
        addProtyleSlash({
          id: `custom-block-toggle-${index}`,
          filter: entry.triggers,
          html: entry.label,
          callback: (protyle: any) => {
            protyle.insert(this.createCustomBlockMarkdown("toggle"), true);
            window.setTimeout(() => {
              this.manager?.applyToAll();
            }, DELAYS.SLASH_INSERT);
          },
        });
      });
    }

    // ---- SQL块 ----
    if (this.isSqlEnabled()) {
      this.parseSlashEntries(
        settings.getBySpace(pluginMetadata.name, "sql-slash-entries") as string
      ).forEach((entry, index) => {
        addProtyleSlash({
          id: `custom-block-sql-${index}`,
          filter: entry.triggers,
          html: entry.label,
          callback: (protyle: any, nodeElement: HTMLElement) => {
            this.quickCreateSQLBlock(protyle, nodeElement);
          },
        });
      });
    }

    // ---- 相册块 ----
    if (this.isGalleryEnabled()) {
      this.parseSlashEntries(
        settings.getBySpace(pluginMetadata.name, "gallery-slash-entries") as string
      ).forEach((entry, index) => {
        addProtyleSlash({
          id: `custom-block-gallery-${index}`,
          filter: entry.triggers,
          html: entry.label,
          callback: (protyle: any, nodeElement: HTMLElement) => {
            this.quickCreateGalleryBlock(protyle, nodeElement);
          },
        });
      });
    }

    // ---- 文件块 ----
    this.parseSlashEntries(
      settings.getBySpace(pluginMetadata.name, "file-slash-entries") as string
    ).forEach((entry, index) => {
      addProtyleSlash({
        id: `custom-block-file-${index}`,
        filter: entry.triggers,
        html: entry.label,
        callback: (protyle: any, nodeElement: HTMLElement) => {
          this.quickCreateFileBlock(protyle, nodeElement);
        },
      });
    });
  }

  /**
   * 解析 "名称; 触发词1 触发词2" 格式的斜杠菜单配置（每行一条，支持全角分号）。
   * 省略 "名称;" 时取第一个触发词作为名称。
   */
  private parseSlashEntries(raw: string | undefined): Array<{
    label: string;
    triggers: string[];
  }> {
    const entries: Array<{ label: string; triggers: string[] }> = [];
    (raw || "")
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          return;
        }
        const normalized = trimmed.replace(/；/g, ";");
        const separatorIndex = normalized.indexOf(";");
        let label = "";
        let triggerPart = normalized;
        if (separatorIndex > -1) {
          label = normalized.slice(0, separatorIndex).trim();
          triggerPart = normalized.slice(separatorIndex + 1);
        }
        const triggers = triggerPart.split(/\s+/).filter(Boolean);
        if (triggers.length === 0) {
          return;
        }
        entries.push({ label: label || triggers[0], triggers });
      });
    return entries;
  }

  private unregisterModuleSlash() {
    if (Array.isArray(mainPlugin.protyleSlash)) {
      mainPlugin.protyleSlash = mainPlugin.protyleSlash.filter(
        (item: any) =>
          !String(item.id || "").startsWith("custom-block-")
      );
    }
  }

  private createCustomBlockMarkdown(type: "math" | "toggle"): string {
    const caret = window.Lute?.Caret || "\u200b";

    if (type === "toggle") {
      return `> ${caret}\n{: custom-dodo-block="toggle" }`;
    }

    return `${caret}\n{: custom-dodo-block="math" }`;
  }

  private async quickCreateMathBlock(
    protyle: any,
    nodeElement: HTMLElement,
  ): Promise<void> {
    const blockId = nodeElement?.dataset.nodeId || "";
    if (!blockId) {
      showMessage("无法识别当前段落块");
      return;
    }

    try {
      // 仅替换斜杠文本，保留当前段落块 ID，再通过属性 API 标记计算块。
      protyle.insert("\u200b", false);
      await setBlockAttrs(blockId, {
        [ATTRIBUTES.CUSTOM_BLOCK_TYPE]: "math",
      });
      window.setTimeout(() => {
        this.manager?.applyToAll();
      }, DELAYS.SLASH_INSERT);
    } catch (error) {
      console.error("[custom-block] 创建计算块失败", error);
      showMessage("创建计算块失败，请重试");
    }
  }

  /** 斜杠快捷创建 SQL 块：SQL 块自身就是思源原生查询嵌入块，不绑定来源块。 */
  private async quickCreateSQLBlock(
    protyle: any,
    nodeElement: HTMLElement,
  ): Promise<void> {
    const insertAfterBlockId = nodeElement?.dataset.nodeId || "";
    if (!insertAfterBlockId) {
      showMessage("无法识别当前块");
      return;
    }

    protyle.insert("\u200b", false);
    const result = await SqlBlockService.createSQLBlockAtCaret({
      insertAfterBlockId,
      config: SqlBlockService.resolveDefaultConfig(),
    });
    showMessage(
      result.success ? "已插入 SQL 块" : result.message || "插入 SQL 块失败",
    );
  }

  private async quickCreateGalleryBlock(
    _protyle: any,
    nodeElement: HTMLElement,
  ) {
    const blockId = nodeElement?.dataset.nodeId || "";
    if (!blockId) {
      showMessage("无法识别当前块");
      return;
    }

    const result = await GalleryBlockService.convertBlock(blockId, nodeElement);
    showMessage(
      result.success
        ? "已转换为相册"
        : result.message || "转换相册失败",
    );
  }

  private async quickCreateFileBlock(
    _protyle: any,
    nodeElement: HTMLElement,
  ) {
    const blockId = nodeElement?.dataset.nodeId || "";
    if (!blockId) {
      showMessage("无法识别当前块");
      return;
    }

    const result = await FileBlockService.convertBlock(blockId, nodeElement);
    showMessage(
      result.success
        ? "已转换为文件块"
        : result.message || "转换文件块失败",
    );
  }

  private isGalleryFrameSource(
    blockId: string,
    source: MessageEventSource | null,
  ): boolean {
    if (!source) {
      return false;
    }

    return Array.from(document.querySelectorAll<HTMLElement>("[data-node-id]"))
      .filter((block) => block.dataset.nodeId === blockId)
      .some((block) =>
        Array.from(block.querySelectorAll<HTMLIFrameElement>("iframe")).some(
          (frame) => frame.contentWindow === source,
        ),
      );
  }

  private normalizeGalleryPreviewUrl(raw: unknown): string | null {
    if (typeof raw !== "string") {
      return null;
    }

    const normalized = GalleryBlockService.normalizeImagePath(raw);
    if (!normalized) {
      return null;
    }

    return /^https?:\/\//i.test(normalized)
      ? normalized
      : new URL(`/${normalized}`, window.location.origin).href;
  }

  private loadGalleryViewer(): Promise<GalleryViewerConstructor> {
    const current = (window as Window & { Viewer?: GalleryViewerConstructor }).Viewer;
    if (current) {
      return Promise.resolve(current);
    }
    if (this.galleryViewerScriptPromise) {
      return this.galleryViewerScriptPromise;
    }

    this.galleryViewerScriptPromise = new Promise((resolve, reject) => {
      const findViewer = () => {
        const viewer = (window as Window & { Viewer?: GalleryViewerConstructor }).Viewer;
        if (viewer) {
          resolve(viewer);
        } else {
          reject(new Error("思源图片预览组件加载失败"));
        }
      };
      const existing = document.getElementById("protyleViewerScript");
      if (existing) {
        existing.addEventListener("load", findViewer, { once: true });
        window.setTimeout(findViewer, 0);
        return;
      }

      const script = document.createElement("script");
      script.id = "protyleViewerScript";
      script.src = "/stage/protyle/js/viewerjs/viewer.js?v=1.11.8";
      script.onload = findViewer;
      script.onerror = () => reject(new Error("思源图片预览组件加载失败"));
      document.head.appendChild(script);
    });
    return this.galleryViewerScriptPromise;
  }

  private closeGalleryViewer(): void {
    const viewer = this.galleryViewer;
    this.galleryViewer = null;
    this.galleryViewerHost?.remove();
    this.galleryViewerHost = null;
    if (viewer && !viewer.destroyed) {
      viewer.destroy();
    }
  }

  private async openGalleryPreview(
    urls: string[],
    index: number,
    alt: string,
  ): Promise<void> {
    try {
      const ViewerCtor = await this.loadGalleryViewer();
      this.closeGalleryViewer();

      const host = document.createElement("ul");
      urls.forEach((url, imageIndex) => {
        const item = document.createElement("li");
        const image = document.createElement("img");
        image.src = url;
        image.alt = imageIndex === index && alt ? alt : `图片 ${imageIndex + 1}`;
        item.appendChild(image);
        host.appendChild(item);
      });

      let viewer: GalleryViewerInstance | null = null;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        if (viewer && !viewer.destroyed) {
          viewer.destroy();
        }
        if (this.galleryViewer === viewer) {
          this.galleryViewer = null;
          this.galleryViewerHost = null;
        }
        host.remove();
      };

      viewer = new ViewerCtor(host, {
        initialViewIndex: index,
        title: [1, (image: HTMLImageElement) => image.alt],
        button: false,
        transition: false,
        hidden: cleanup,
        toolbar: {
          zoomIn: true,
          zoomOut: true,
          oneToOne: true,
          reset: true,
          prev: true,
          play: true,
          next: true,
          rotateLeft: true,
          rotateRight: true,
          flipHorizontal: true,
          flipVertical: true,
          close: cleanup,
        },
      });
      this.galleryViewer = viewer;
      this.galleryViewerHost = host;
      viewer.show();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "无法打开图片预览");
    }
  }

  // ---- 图表块 / 时间线块：右上角 ⚙ 设置按钮 ----

  /**
   * 在图表块、时间线块右上角注入「设置」入口（思源原生图标条样式），点击打开悬浮设置面板。
   * - 有原生图标条（.protyle-icons，如图表块）时挂到图标条最前面，随思源 hover 显示；
   * - 没有图标条（如 iframe 时间线块）时注入一个 .protyle-icons 图标条，
   *   配合 blockquote.css 的 hover 规则获得与原生一致的显示效果。
   * 块内容重渲染后按钮会随 DOM 重建，依赖 startSettingsObserver 的 rAF 回调自动补挂。
   */
  private ensureSettingsButtons() {
    if (this.isSqlEnabled()) {
      document
        .querySelectorAll<HTMLElement>(`[custom-dodo-block="${SQL_BLOCK_TYPE}"]`)
        .forEach((block) =>
          this.injectSettingsButton(
            block,
            this.sqlSettingsBtnClass,
            "SQL块设置",
            (blockId, anchor) => openSqlSettings(blockId, anchor),
            true,
          ),
        );
    }
    if (this.isGalleryEnabled()) {
      document
        .querySelectorAll<HTMLElement>('[custom-dodo-block="gallery"]')
        .forEach((block) =>
          this.injectSettingsButton(
            block,
            this.gallerySettingsBtnClass,
            "相册设置",
            (blockId, anchor) => openGallerySettings(blockId, anchor),
            true
          )
        );
    }
    document
      .querySelectorAll<HTMLElement>('[custom-dodo-block="file"]')
      .forEach((block) => {
        FileBlockService.ensurePreviewFrameAccess(block);
        this.injectSettingsButton(
          block,
          this.fileSettingsBtnClass,
          "文件块设置",
          (blockId, anchor) => openFileSettings(blockId, anchor),
          true
        );
      });
  }

  private injectSettingsButton(
    blockElement: HTMLElement,
    buttonClass: string,
    label: string,
    open: (blockId: string, anchor: HTMLElement) => void,
    allowOverlay: boolean
  ) {
    const blockId = blockElement.dataset.nodeId;
    if (!blockId) {
      return;
    }

    let icons = blockElement.querySelector<HTMLElement>(".protyle-icons");
    const existing = blockElement.querySelector<HTMLElement>(`.${buttonClass}`);
    if (existing && icons?.contains(existing)) {
      // 已挂在图标条上
      return;
    }

    if (!icons && !allowOverlay) {
      // 渲染型块（图表）的图标条由思源渲染完成后插入，未就绪时跳过，观察器下一帧重试
      return;
    }

    if (!icons) {
      // iframe 等无图标条块：注入思源样式的图标条（悬停显示规则见 blockquote.css）
      icons = document.createElement("div");
      icons.className = "protyle-icons";
      blockElement.appendChild(icons);
    }

    const firstIcon = icons.querySelector(".protyle-icon--first");
    const button =
      existing || this.createSettingsButton(buttonClass, label, (anchor) =>
        open(blockId, anchor)
      );
    button.classList.add("protyle-icon");
    if (firstIcon) {
      firstIcon.classList.remove("protyle-icon--first");
    }
    // prepend 后本按钮必为首个图标；行内无尾位图标时兼任末位圆角
    button.classList.add("protyle-icon--first");
    if (!icons.querySelector(".protyle-icon--last")) {
      button.classList.add("protyle-icon--last");
    }
    // prepend 对已在别处的节点是移动（自动从原位置摘除），竞态误挂的按钮会在此被搬回
    icons.prepend(button);
  }
  private createSettingsButton(
    buttonClass: string,
    label: string,
    onClick: (anchor: HTMLElement) => void
  ): HTMLElement {
    const button = document.createElement("span");
    button.className = `ariaLabel ${buttonClass}`;
    button.setAttribute("aria-label", label);
    button.setAttribute("data-position", "4north");
    button.innerHTML = '<svg><use xlink:href="#iconSettings"></use></svg>';
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button);
    });
    return button;
  }

  private removeSettingsButtons(buttonClasses: string[]) {
    const containers = new Set<HTMLElement>();
    buttonClasses.forEach((buttonClass) => {
      document.querySelectorAll(`.${buttonClass}`).forEach((button) => {
        if (button.parentElement) {
          containers.add(button.parentElement);
        }
        button.remove();
      });
    });
    // 归还首位圆角样式
    containers.forEach((icons) => {
      icons
        .querySelector(".protyle-icon")
        ?.classList.add("protyle-icon--first");
    });
  }

  private startSettingsObserver() {
    this.chartObserver?.disconnect();
    this.chartObserver = new MutationObserver(() => {
      requestAnimationFrame(() => this.ensureSettingsButtons());
    });
    this.chartObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}
