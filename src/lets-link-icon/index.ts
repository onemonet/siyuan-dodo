import "./style.css";

import { createLogger } from "@/logger";
import { forwardProxy, getBlockDOM, setBlockAttrs, updateBlock, upload } from "@/api";
import {
  fetchJsonWithTimeout,
  getErrorMessage,
} from "@/request-utils";
import type { SubPlugin } from "@/types/plugin";
import { plugin } from "@/utils";
import { fetchWithBodyTimeout, fetchWithTimeout, withTimeout } from "@/security-utils";
import { Dialog, Menu, fetchSyncPost } from "siyuan";
import IconManager from "./components/IconManager.svelte";
import { resolveBestFavicon } from "./api";
import {
  cleanUnusedLinkIcons,
  type LinkIconCleanupProgress,
  type LinkIconCleanupResult,
  type LinkIconUsageQueryResponse,
} from "./icon-manager-cleanup";
import {
  applyDocIcon,
  clearDocIconStyle,
  createDynamicStyleManager,
  getDefaultDocIconCss,
  getLinkIconConfig,
  hasAppliedDocIcon,
  queryDocIcon,
  type CustomIconRecord,
  type DocIconInfo,
} from "./custom-icon";
import {
  getUnusedLocalIconUrls,
  LINK_ICON_MANAGED_ICON_DIR,
  matchLinkIconRule,
  mergeCustomIconRecords,
  normalizeManagedIconUrl,
  normalizeLinkIconHref,
} from "./icon-records";
import { LINK_ICON_CUSTOM_FILE, LINK_ICON_DOC_STYLE_ID } from "./settings";
import {
  applyOgCardMetadata,
  clearOgCardMetadata,
  fetchOgCardMetadata,
  findOgCardTarget,
  getOgCardBlockId,
  isEmptyOgCardAnchorText,
  isOgCardEnabledValue,
  normalizeOgCardUrl,
  normalizeOgCardAssetPath,
  OG_CARD_BLOCK_ATTRIBUTE,
  OG_CARD_BLOCK_RENDER_ATTRIBUTE,
  OG_CARD_IMAGE_ATTRIBUTE,
  OG_CARD_REFRESH_BUTTON_ATTRIBUTE,
  OG_CARD_RENDER_ATTRIBUTE,
  readOgCardLinkFields,
  readOgCardImageAssetPath,
  readOgCardNativeMetadata,
  stripOgCardRuntimeAttributes,
  type OgCardMetadata,
  updateOgCardLinkDom,
} from "./og-card";

const ICON_DIR = LINK_ICON_MANAGED_ICON_DIR;
const ICON_FETCH_TIMEOUT = 8000;
const DEFAULT_ICON_SIZE = 32;
const MAX_ICON_DOWNLOAD_BYTES = 1024 * 1024;
const MAX_ICON_DIMENSION = 256;
const JSON_CONTENT_TYPE = "application/json";
const FAVICON_ALLOWED_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
]);
const SIYUAN_FILE_REQUEST_TIMEOUT_MS = 30_000;
const OG_CARD_IMAGE_FETCH_TIMEOUT_MS = 20_000;
const OG_CARD_PERSIST_TIMEOUT_MS = 10_000;
const MAX_OG_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
const OG_CARD_ASSETS_DIR = "/assets/dodo/link-icon/";
const OG_CARD_ASSETS_READ_DIR = "/data/assets/dodo/link-icon/";
const OG_CARD_ASSET_PUBLIC_DIR = "assets/dodo/link-icon/";
const OG_CARD_CACHE_FILE_PREFIX = "og-card-";
const OG_CARD_CACHE_EXTENSIONS = ["avif", "gif", "jpg", "jpeg", "png", "svg", "webp"] as const;
const OG_CARD_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};
type OgCardLoadMode = "render" | "enable" | "refresh";
const logger = createLogger("LinkIcon");

interface SiyuanFileResponse {
  code?: number;
  msg?: string;
}

interface OgCardAssetDirectoryEntry {
  name?: string;
  isDir?: boolean;
  isSymlink?: boolean;
  updated?: number;
}

interface OgCardImageDownload {
  blob: Blob;
  contentType: string;
}

function assertSiyuanFileSuccess(response: SiyuanFileResponse, operation: string): void {
  if (response.code !== 0) {
    throw new Error(response.msg || `${operation} code=${response.code ?? "unknown"}`);
  }
}

async function getSha256Hex(value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("Web Crypto API is unavailable");
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getOgCardCacheKey(normalizedUrl: string): Promise<string> {
  return `${OG_CARD_CACHE_FILE_PREFIX}${await getSha256Hex(normalizedUrl)}`;
}

function getOgCardImageFileName(cacheKey: string, contentType: string): string | null {
  const extension = OG_CARD_IMAGE_EXTENSIONS[contentType];
  return extension ? `${cacheKey}.${extension}` : null;
}

export default class LinkIconSubPlugin implements SubPlugin {
  name = "link-icon";
  displayName = "链接图标";
  description = "为外链与文档引用显示图标，提供自定义图标管理能力，并支持通过块属性渲染 Open Graph 链接卡片。";
  enabled = false;

  private dynamicStyle = createDynamicStyleManager();
  private customIcons: CustomIconRecord[] = [];
  private managerDialog: Dialog | null = null;
  private managerComponent: IconManager | null = null;
  private iconCache = new Map<string, string>();
  private autoFetchTasks = new Map<string, Promise<string | null>>();
  private ogCardTasks = new Map<string, Promise<OgCardMetadata | null>>();
  private ogCardImageTasks = new Map<string, Promise<string | null>>();
  private ogCardBlockTasks = new Map<HTMLElement, Promise<void>>();
  private ogCardObservers = new Map<HTMLElement, MutationObserver>();
  private ogCardRefreshTimers = new Map<HTMLElement, number>();
  private disposed = false;

  async onload(): Promise<void> {
    this.disposed = false;
    await this.loadCustomIcons();
    this.refreshStaticIcons();
    this.dynamicStyle.markLocalFileLinks();
    this.ensureDocBaseStyle();
  }

  async onunload(): Promise<void> {
    this.disposed = true;
    this.managerComponent?.$destroy();
    this.managerComponent = null;
    this.managerDialog?.destroy();
    this.managerDialog = null;
    this.dynamicStyle.clearStyle();
    this.autoFetchTasks.clear();
    this.ogCardObservers.forEach((observer) => observer.disconnect());
    this.ogCardObservers.clear();
    this.ogCardRefreshTimers.forEach((timer) => window.clearTimeout(timer));
    this.ogCardRefreshTimers.clear();
    document.querySelectorAll<HTMLElement>(`[${OG_CARD_RENDER_ATTRIBUTE}]`).forEach((content) => {
      clearOgCardMetadata(content);
    });
    document.querySelectorAll<HTMLElement>(`[${OG_CARD_BLOCK_RENDER_ATTRIBUTE}]`).forEach((block) => {
      block.removeAttribute(OG_CARD_BLOCK_RENDER_ATTRIBUTE);
      block.querySelectorAll(`[${OG_CARD_REFRESH_BUTTON_ATTRIBUTE}]`).forEach((button) => {
        button.remove();
      });
    });
    this.ogCardTasks.clear();
    this.ogCardImageTasks.clear();
    this.ogCardBlockTasks.clear();
    clearDocIconStyle();
  }

  async onLayoutReady(): Promise<void> {
    this.refreshStaticIcons();
    this.dynamicStyle.markLocalFileLinks();
    this.ensureDocBaseStyle();
    document.querySelectorAll(".protyle").forEach((protyle) => {
      void this.processProtyle(protyle);
    });
  }

  async onDataChanged(): Promise<void> {
    await this.loadCustomIcons();
    this.refreshStaticIcons();
    this.dynamicStyle.markLocalFileLinks();
    this.ensureDocBaseStyle();
    document.querySelectorAll(".protyle").forEach((protyle) => {
      void this.processProtyle(protyle);
    });
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconImage",
      label: "管理链接图标",
      click: () => {
        this.openManager();
      },
    });
  }

  onProtyleLoaded(event: CustomEvent<{ protyle?: { element?: HTMLElement } }>): void {
    const protyleElement = event.detail?.protyle?.element;
    if (protyleElement) {
      void this.processProtyle(protyleElement);
    }
  }

  private setCustomIcons(icons: CustomIconRecord[]): void {
    this.customIcons = icons;
    this.iconCache = new Map(
      icons.filter((icon) => !icon.href.includes("*")).map((icon) => [icon.href, icon.iconUrl])
    );
  }

  private async deleteLocalIconFiles(iconUrls: string[]): Promise<void> {
    const deleteTargets = [
      ...new Set(
        iconUrls
          .map((iconUrl) => normalizeManagedIconUrl(iconUrl))
          .filter((iconUrl): iconUrl is string => Boolean(iconUrl))
      ),
    ];
    await Promise.all(
      deleteTargets.map(async (iconUrl) => {
        try {
          const response = await fetchJsonWithTimeout<SiyuanFileResponse>("/api/file/removeFile", {
            method: "POST",
            headers: { "Content-Type": JSON_CONTENT_TYPE },
            body: JSON.stringify({ path: `/data${iconUrl}` }),
          }, {
            timeoutMs: SIYUAN_FILE_REQUEST_TIMEOUT_MS,
            errorPrefix: "Siyuan removeFile",
          });
          assertSiyuanFileSuccess(response, "removeFile");
        } catch (error) {
          logger.warn("deleteLocalIconFiles failed", { iconUrl, reason: getErrorMessage(error) });
        }
      })
    );
  }

  blockIconEvent({ detail }: any): void {
    const menu = detail?.menu;
    const blockElements = detail?.blockElements;
    if (!menu || !blockElements || blockElements.length !== 1) {
      return;
    }

    this.addOgCardMenuItem(menu, blockElements[0] as HTMLElement);
  }

  linkMenuEvent({ detail }: any): void {
    const menu = detail?.menu;
    const linkElement = detail?.element as HTMLElement | undefined;
    const blockElement = linkElement?.closest<HTMLElement>('[data-type="NodeParagraph"]');
    if (!menu || !blockElement) {
      return;
    }

    this.addOgCardMenuItem(menu, blockElement);
  }

  private addOgCardMenuItem(menu: Menu, blockElement: HTMLElement): void {
    const blockId = blockElement?.dataset?.nodeId;
    const target = findOgCardTarget(blockElement, false);
    if (!blockId || !target) {
      return;
    }

    const enabled = isOgCardEnabledValue(blockElement.getAttribute(OG_CARD_BLOCK_ATTRIBUTE));
    menu.addItem({
      icon: enabled ? "iconClose" : "iconLink",
      label: enabled ? "关闭链接卡片" : "启用链接卡片",
      click: async () => {
        try {
          await setBlockAttrs(blockId, enabled
            ? {
                [OG_CARD_BLOCK_ATTRIBUTE]: null,
                [OG_CARD_IMAGE_ATTRIBUTE]: null,
              }
            : {
                [OG_CARD_BLOCK_ATTRIBUTE]: "true",
              });
          if (enabled) {
            blockElement.removeAttribute(OG_CARD_BLOCK_ATTRIBUTE);
            blockElement.removeAttribute(OG_CARD_IMAGE_ATTRIBUTE);
            clearOgCardMetadata(target.content);
          } else {
            blockElement.setAttribute(OG_CARD_BLOCK_ATTRIBUTE, "true");
          }
          if (!enabled) {
            void this.processOgCardBlock(blockElement, "enable");
          }
        } catch (error) {
          logger.warn("toggle OG card failed", {
            blockId,
            reason: getErrorMessage(error),
          });
        }
      },
    });
  }

  private async queryIconUsage(stmt: string): Promise<LinkIconUsageQueryResponse> {
    const result = await fetchSyncPost("/api/query/sql", { stmt });
    return {
      code: result?.code,
      data: result?.data,
    };
  }

  private async cleanUnusedCustomIcons(
    icons: CustomIconRecord[],
    onProgress: (progress: LinkIconCleanupProgress) => void,
  ): Promise<LinkIconCleanupResult> {
    return cleanUnusedLinkIcons({
      icons,
      queryUsage: (stmt) => this.queryIconUsage(stmt),
      deleteIconFile: (iconUrl) => this.deleteLocalIconFiles([iconUrl]),
      onProgress,
      logger,
    });
  }

  private async saveCustomIcons(
    nextIcons: CustomIconRecord[],
    deleteList: string[] = []
  ): Promise<CustomIconRecord[]> {
    const mergeResult = mergeCustomIconRecords(nextIcons);
    const unusedLocalIconUrls = getUnusedLocalIconUrls(
      mergeResult.icons,
      mergeResult.removedIcons,
      deleteList
    );

    await this.deleteLocalIconFiles(unusedLocalIconUrls);
    this.setCustomIcons(mergeResult.icons);
    await plugin.saveData(LINK_ICON_CUSTOM_FILE, mergeResult.icons);
    return [...mergeResult.icons];
  }

  private async loadCustomIcons(): Promise<void> {
    const customIcons = await plugin.loadData(LINK_ICON_CUSTOM_FILE);
    const rawIcons = Array.isArray(customIcons) ? (customIcons as CustomIconRecord[]) : [];
    const mergeResult = mergeCustomIconRecords(rawIcons);
    const unusedLocalIconUrls = getUnusedLocalIconUrls(mergeResult.icons, mergeResult.removedIcons);

    this.setCustomIcons(mergeResult.icons);
    if (mergeResult.hasChanges || unusedLocalIconUrls.length > 0) {
      await this.deleteLocalIconFiles(unusedLocalIconUrls);
      await plugin.saveData(LINK_ICON_CUSTOM_FILE, mergeResult.icons);
    }
  }

  private ensureDocBaseStyle(): void {
    const styleElement = document.getElementById(LINK_ICON_DOC_STYLE_ID) ?? document.createElement("style");
    styleElement.id = LINK_ICON_DOC_STYLE_ID;
    styleElement.textContent = getDefaultDocIconCss();
    if (!styleElement.parentElement) {
      document.head.appendChild(styleElement);
    }
  }

  private refreshStaticIcons(): void {
    const config = getLinkIconConfig();
    this.dynamicStyle.removeAllIcons();

    if (!config.showExternalIcon) {
      this.dynamicStyle.flushStyle();
      return;
    }

    this.customIcons.forEach((icon) => {
      this.dynamicStyle.addIcon(icon.href, icon.iconUrl, false);
    });
    this.dynamicStyle.flushStyle();
    this.dynamicStyle.markIPLinks();
  }

  private async processProtyle(root: Element): Promise<void> {
    this.observeOgCards(root);
    const config = getLinkIconConfig();
    this.dynamicStyle.markLocalFileLinks(root);

    if (config.insertDocRefIcon) {
      const dynamicRefs = Array.from(
        root.querySelectorAll<HTMLElement>("span[data-type='block-ref'][data-subtype='d'][data-id]")
      ).filter((el) => !hasAppliedDocIcon(el));

      const uniqueIds = [...new Set(dynamicRefs.map((el) => el.dataset.id!).filter(Boolean))];
      const iconMap = new Map<string, DocIconInfo | null>();
      await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            iconMap.set(id, await queryDocIcon(id));
          } catch (error) {
            logger.debug("queryDocIcon failed", { id, reason: getErrorMessage(error) });
            iconMap.set(id, null);
          }
        })
      );

      dynamicRefs.forEach((element) => {
        const icon = iconMap.get(element.dataset.id!);
        if (icon) {
          applyDocIcon(element, icon);
        }
      });
    }

    if (config.insertStaticRefIcon) {
      const staticRefs = Array.from(
        root.querySelectorAll<HTMLElement>("span[data-type='block-ref'][data-subtype='s'][data-id]")
      ).filter((el) => !hasAppliedDocIcon(el));

      const uniqueStaticIds = [...new Set(staticRefs.map((el) => el.dataset.id!).filter(Boolean))];
      const staticIconMap = new Map<string, DocIconInfo | null>();
      await Promise.all(
        uniqueStaticIds.map(async (id) => {
          try {
            staticIconMap.set(id, await queryDocIcon(id));
          } catch (error) {
            logger.debug("queryStaticDocIcon failed", { id, reason: getErrorMessage(error) });
            staticIconMap.set(id, null);
          }
        })
      );

      staticRefs.forEach((element) => {
        const icon = staticIconMap.get(element.dataset.id!);
        if (icon) {
          applyDocIcon(element, icon);
        }
      });
    }

    if (config.showExternalIcon && config.autoFetchIcon) {
      await this.processAutoFetch(root);
    }

    await this.processOgCards(root);
  }

  private observeOgCards(root: Element): void {
    if (!(root instanceof HTMLElement) || this.ogCardObservers.has(root)) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const shouldRefresh = mutations.some((mutation) => {
        if (mutation.type === "characterData" || mutation.type === "childList") {
          return true;
        }

        return mutation.attributeName === OG_CARD_BLOCK_ATTRIBUTE ||
          mutation.attributeName === OG_CARD_IMAGE_ATTRIBUTE ||
          mutation.attributeName === "data-href" ||
          mutation.attributeName === "href" ||
          mutation.attributeName === "data-title" ||
          mutation.attributeName === "title";
      });

      if (shouldRefresh) {
        this.scheduleOgCardRefresh(root);
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        OG_CARD_BLOCK_ATTRIBUTE,
        OG_CARD_IMAGE_ATTRIBUTE,
        "data-href",
        "href",
        "data-title",
        "title",
      ],
    });
    this.ogCardObservers.set(root, observer);
  }

  private scheduleOgCardRefresh(root: HTMLElement): void {
    const previousTimer = this.ogCardRefreshTimers.get(root);
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }

    const timer = window.setTimeout(() => {
      this.ogCardRefreshTimers.delete(root);
      if (!this.disposed && root.isConnected) {
        void this.processOgCards(root);
      }
    }, 160);
    this.ogCardRefreshTimers.set(root, timer);
  }

  private async processOgCards(root: Element): Promise<void> {
    const blocks = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(
      `[data-type="NodeParagraph"][${OG_CARD_BLOCK_ATTRIBUTE}]`,
    ).forEach((block) => blocks.add(block));
    root.querySelectorAll<HTMLElement>(
      `[data-type="NodeParagraph"][${OG_CARD_IMAGE_ATTRIBUTE}]`,
    ).forEach((block) => blocks.add(block));
    root.querySelectorAll<HTMLElement>(`[${OG_CARD_RENDER_ATTRIBUTE}]`).forEach((content) => {
      const block = content.closest<HTMLElement>('[data-type="NodeParagraph"]');
      if (block) {
        blocks.add(block);
      }
    });

    if (root.matches?.(`[data-type="NodeParagraph"]`)) {
      blocks.add(root as HTMLElement);
    }

    await Promise.all([...blocks].map((block) => this.processOgCardBlock(block)));
  }

  private async clearOgCardBlock(block: HTMLElement, clearImage = false): Promise<void> {
    block.removeAttribute(OG_CARD_BLOCK_RENDER_ATTRIBUTE);
    block.querySelectorAll<HTMLElement>(`[${OG_CARD_RENDER_ATTRIBUTE}]`).forEach((content) => {
      clearOgCardMetadata(content);
    });
    block.querySelectorAll(`[${OG_CARD_REFRESH_BUTTON_ATTRIBUTE}]`).forEach((button) => {
      button.remove();
    });

    const blockId = getOgCardBlockId(block);
    if (!clearImage || !blockId || !block.hasAttribute(OG_CARD_IMAGE_ATTRIBUTE)) {
      return;
    }

    try {
      await withTimeout(
        setBlockAttrs(blockId, { [OG_CARD_IMAGE_ATTRIBUTE]: null }),
        OG_CARD_PERSIST_TIMEOUT_MS,
        "OG card image attribute cleanup timed out",
      );
      block.removeAttribute(OG_CARD_IMAGE_ATTRIBUTE);
    } catch (error) {
      logger.debug("clearOgCardBlock failed", {
        blockId,
        reason: getErrorMessage(error),
      });
    }
  }

  private processOgCardBlock(block: HTMLElement, mode: OgCardLoadMode = "render"): Promise<void> {
    const previousTask = this.ogCardBlockTasks.get(block) ?? Promise.resolve();
    const task = previousTask
      .catch(() => undefined)
      .then(() => this.runOgCardBlock(block, mode))
      .catch((error) => {
        logger.debug("processOgCardBlock failed", {
          blockId: getOgCardBlockId(block),
          reason: getErrorMessage(error),
        });
      });
    this.ogCardBlockTasks.set(block, task);
    return task.finally(() => {
      if (this.ogCardBlockTasks.get(block) === task) {
        this.ogCardBlockTasks.delete(block);
      }
    });
  }

  private async runOgCardBlock(block: HTMLElement, mode: OgCardLoadMode): Promise<void> {
    if (this.disposed) {
      return;
    }

    const enabled = isOgCardEnabledValue(block.getAttribute(OG_CARD_BLOCK_ATTRIBUTE));
    const target = findOgCardTarget(block);
    if (!target) {
      await this.clearOgCardBlock(block, !enabled);
      return;
    }

    const normalizedUrl = normalizeOgCardUrl(target.href);
    if (!normalizedUrl) {
      await this.clearOgCardBlock(block, !enabled);
      return;
    }

    const nativeMetadata = readOgCardNativeMetadata(target);
    if (!nativeMetadata) {
      await this.clearOgCardBlock(block, !enabled);
      return;
    }

    const cardDomain = normalizeLinkIconHref(new URL(normalizedUrl).hostname);
    const ordinaryIconUrl = cardDomain ? this.findMatchingLocalIcon(cardDomain) : "";

    const nativeImagePath = normalizeOgCardAssetPath(nativeMetadata.imageAssetPath || "") || "";
    const cachedImagePath = mode === "enable" && !nativeImagePath
      ? await this.findOgCardCachedImage(normalizedUrl)
      : null;
    const fetchedMetadata = mode === "refresh" ||
      (mode === "enable" && !nativeImagePath && !cachedImagePath)
      ? await this.fetchOgCardMetadataDedup(normalizedUrl)
      : null;
    const currentTarget = findOgCardTarget(block);
    if (!currentTarget || normalizeOgCardUrl(currentTarget.href) !== normalizedUrl) {
      await this.clearOgCardBlock(
        block,
        !isOgCardEnabledValue(block.getAttribute(OG_CARD_BLOCK_ATTRIBUTE)),
      );
      return;
    }

    const latestTarget = findOgCardTarget(block);
    if (!latestTarget || normalizeOgCardUrl(latestTarget.href) !== normalizedUrl) {
      return;
    }
    const latestFields = readOgCardLinkFields(latestTarget.link);

    const metadata: OgCardMetadata = {
      ...(fetchedMetadata || nativeMetadata),
      // Reuse the existing ordinary-link icon. The remote favicon parsed from
      // OG metadata is intentionally ignored and is never persisted.
      faviconUrl: ordinaryIconUrl,
      // Keep the native image while a refreshed image is being downloaded.
      // There is no separate image-source attribute by design, so a failed
      // refresh must not discard the last usable local asset.
      imageAssetPath: nativeImagePath || cachedImagePath || "",
    };
    const renderTarget = findOgCardTarget(block);
    if (!renderTarget) {
      return;
    }

    const renderMetadata: OgCardMetadata = {
      ...metadata,
      imageUrl: "",
      title: fetchedMetadata || isEmptyOgCardAnchorText(latestFields.anchorText)
        ? metadata.title
        : latestFields.anchorText,
      description: fetchedMetadata || !latestFields.description
        ? metadata.description
        : latestFields.description,
    };
    applyOgCardMetadata(renderTarget, renderMetadata);
    this.mountOgCardRefreshButton(renderTarget);

    if (fetchedMetadata) {
      void this.persistOgCardState(block, normalizedUrl, metadata, true, {
        persistImage: false,
      });
    } else if (cachedImagePath) {
      void this.persistOgCardState(block, normalizedUrl, metadata, false, {
        persistDom: false,
      });
    }

    if (fetchedMetadata && metadata.imageUrl) {
      void this.hydrateOgCardImage(block, normalizedUrl, metadata);
    }
  }

  private async hydrateOgCardImage(
    block: HTMLElement,
    normalizedUrl: string,
    metadata: OgCardMetadata,
  ): Promise<void> {
    const imageUrl = metadata.imageUrl;
    const imageAssetPath = await this.ensureOgCardImageAsset(imageUrl, normalizedUrl);
    if (!imageAssetPath) {
      if (this.isCurrentOgCardBlock(block, normalizedUrl)) {
        const target = findOgCardTarget(block);
        if (target) {
          const fields = readOgCardLinkFields(target.link);
          applyOgCardMetadata(target, {
            ...metadata,
            imageUrl: "",
            title: isEmptyOgCardAnchorText(fields.anchorText) ? metadata.title : fields.anchorText,
            description: fields.description || metadata.description,
          });
          this.mountOgCardRefreshButton(target);
        }
      }
      return;
    }
    if (!block.isConnected) {
      return;
    }

    if (!this.isCurrentOgCardBlock(block, normalizedUrl)) {
      return;
    }

    const latestMetadata = { ...metadata, imageAssetPath };

    const renderTarget = findOgCardTarget(block);
    if (!renderTarget) {
      return;
    }

    const fields = readOgCardLinkFields(renderTarget.link);
    applyOgCardMetadata(renderTarget, {
      ...latestMetadata,
      title: isEmptyOgCardAnchorText(fields.anchorText) ? latestMetadata.title : fields.anchorText,
      description: fields.description || latestMetadata.description,
    });
    this.mountOgCardRefreshButton(renderTarget);

    void this.persistOgCardState(block, normalizedUrl, latestMetadata, false, {
      persistDom: false,
    });
  }

  private async fetchOgCardMetadataDedup(url: string): Promise<OgCardMetadata | null> {
    const currentTask = this.ogCardTasks.get(url);
    if (currentTask) {
      return currentTask;
    }

    const task = fetchOgCardMetadata(url)
      .catch((error) => {
        logger.debug("fetchOgCardMetadata failed", { url, reason: getErrorMessage(error) });
        return null;
      })
      .finally(() => {
        this.ogCardTasks.delete(url);
      });

    this.ogCardTasks.set(url, task);
    return task;
  }

  private async findOgCardCachedImage(normalizedUrl: string): Promise<string | null> {
    try {
      const cacheKey = await getOgCardCacheKey(normalizedUrl);
      const directoryResponse = await withTimeout(
        fetchSyncPost("/api/file/readDir", { path: OG_CARD_ASSETS_READ_DIR }),
        OG_CARD_PERSIST_TIMEOUT_MS,
        "OG card cache directory read timed out",
      );
      assertSiyuanFileSuccess(directoryResponse, "OG card cache directory read failed");
      const entries = (Array.isArray(directoryResponse?.data) ? directoryResponse.data : []) as OgCardAssetDirectoryEntry[];
      const filePattern = new RegExp(
        `^${cacheKey}(?:-[a-z0-9-]+)?\\.(?:${OG_CARD_CACHE_EXTENSIONS.join("|")})$`,
        "i",
      );
      const candidates = entries
        .filter((entry) => entry.isDir !== true && entry.isSymlink !== true)
        .map((entry) => {
          const fileName = typeof entry.name === "string" ? entry.name : "";
          return {
            assetPath: normalizeOgCardAssetPath(`${OG_CARD_ASSET_PUBLIC_DIR}${fileName}`),
            fileName,
            updated: typeof entry.updated === "number" ? entry.updated : 0,
          };
        })
        .filter((entry): entry is { assetPath: string; fileName: string; updated: number } =>
          Boolean(entry.assetPath) && filePattern.test(entry.fileName),
        )
        .sort((left, right) => right.updated - left.updated);

      const existingPaths = await Promise.all(candidates.map(async ({ assetPath }) => {
        try {
          const response = await withTimeout(
            fetchSyncPost("/api/asset/statAsset", { path: assetPath }),
            OG_CARD_PERSIST_TIMEOUT_MS,
            "OG card cache asset stat timed out",
          );
          return response?.code === 0 ? assetPath : null;
        } catch {
          return null;
        }
      }));
      return existingPaths.find((assetPath): assetPath is string => Boolean(assetPath)) || null;
    } catch (error) {
      logger.debug("findOgCardCachedImage failed", {
        url: normalizedUrl,
        reason: getErrorMessage(error),
      });
      return null;
    }
  }

  private async ensureOgCardImageAsset(imageUrl: string, pageUrl: string): Promise<string | null> {
    const normalizedImageUrl = normalizeOgCardUrl(imageUrl);
    const normalizedPageUrl = normalizeOgCardUrl(pageUrl);
    if (!normalizedImageUrl || !normalizedPageUrl) {
      return null;
    }

    const taskKey = `${normalizedPageUrl}\n${normalizedImageUrl}`;
    const currentTask = this.ogCardImageTasks.get(taskKey);
    if (currentTask) {
      return currentTask;
    }

    const task = this.downloadAndUploadOgCardImage(normalizedImageUrl, normalizedPageUrl)
      .catch((error) => {
        logger.debug("downloadAndUploadOgCardImage failed", {
          imageUrl: normalizedImageUrl,
          reason: getErrorMessage(error),
        });
        return null;
      })
      .finally(() => {
        this.ogCardImageTasks.delete(taskKey);
      });
    this.ogCardImageTasks.set(taskKey, task);
    return task;
  }

  private async downloadAndUploadOgCardImage(imageUrl: string, pageUrl: string): Promise<string | null> {
    const image = await this.downloadOgCardImage(imageUrl);
    if (!image) {
      return null;
    }

    const cacheKey = await getOgCardCacheKey(pageUrl);
    const fileName = getOgCardImageFileName(cacheKey, image.contentType);
    if (!fileName) {
      return null;
    }
    const file = new File([image.blob], fileName, { type: image.contentType });
    const result = await withTimeout(
      upload(OG_CARD_ASSETS_DIR, [file]),
      OG_CARD_IMAGE_FETCH_TIMEOUT_MS,
      "OG card image upload timed out",
    );
    return normalizeOgCardAssetPath(result?.succMap?.[fileName] || "");
  }

  private async downloadOgCardImage(imageUrl: string): Promise<OgCardImageDownload | null> {
    try {
      const { response, body: blob } = await fetchWithBodyTimeout(
        imageUrl,
        {
          method: "GET",
          headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.8" },
        },
        OG_CARD_IMAGE_FETCH_TIMEOUT_MS,
        (response) => {
          const responseContentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
          const contentLength = Number(response.headers.get("content-length") || 0);
          if (!response.ok ||
            (responseContentType && !OG_CARD_IMAGE_EXTENSIONS[responseContentType]) ||
            contentLength > MAX_OG_CARD_IMAGE_BYTES) {
            throw new Error("OG card image response rejected");
          }
          return response.blob();
        },
      );
      const responseContentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
      const contentType = (blob.type || responseContentType).split(";", 1)[0].trim().toLowerCase();
      if (blob.size <= MAX_OG_CARD_IMAGE_BYTES && OG_CARD_IMAGE_EXTENSIONS[contentType]) {
        return { blob, contentType };
      }
    } catch {
      // Retry through the kernel proxy below when browser CORS blocks the image.
    }

    try {
      const response = await withTimeout(
        forwardProxy(
          imageUrl,
          "GET",
          null,
          [{ "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.8" }],
          OG_CARD_IMAGE_FETCH_TIMEOUT_MS,
          "application/octet-stream",
          "base64",
        ) as Promise<{
          body?: string;
          bodyEncoding?: string;
          contentType?: string;
          status?: number;
        }>,
        OG_CARD_IMAGE_FETCH_TIMEOUT_MS,
        "OG card image proxy request timed out",
      );
      const contentType = (response.contentType || "").split(";", 1)[0].trim().toLowerCase();
      const body = response.body || "";
      if ((response.status !== undefined && (response.status < 200 || response.status >= 400)) ||
        response.bodyEncoding !== "base64" || !OG_CARD_IMAGE_EXTENSIONS[contentType] ||
        body.length > Math.ceil(MAX_OG_CARD_IMAGE_BYTES * 4 / 3) + 16) {
        return null;
      }

      const binary = atob(body);
      if (binary.length > MAX_OG_CARD_IMAGE_BYTES) {
        return null;
      }
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return { blob: new Blob([bytes], { type: contentType }), contentType };
    } catch {
      return null;
    }
  }

  private async persistOgCardState(
    block: HTMLElement,
    expectedUrl: string,
    metadata: OgCardMetadata,
    force: boolean,
    options: { persistDom?: boolean; persistImage?: boolean } = {},
  ): Promise<void> {
    const blockId = getOgCardBlockId(block);
    if (!blockId) {
      return;
    }

    if (options.persistDom !== false) {
      try {
        if (!this.isCurrentOgCardBlock(block, expectedUrl)) {
          return;
        }
        const blockData = await withTimeout(
          getBlockDOM(blockId),
          OG_CARD_PERSIST_TIMEOUT_MS,
          "OG card block read timed out",
        );
        const canonicalDom = stripOgCardRuntimeAttributes(blockData?.dom || "");
        const update = updateOgCardLinkDom(
          canonicalDom,
          { title: metadata.title, description: metadata.description },
          force,
          expectedUrl,
        );
        if (update.changed) {
          if (!this.isCurrentOgCardBlock(block, expectedUrl)) {
            return;
          }
          await withTimeout(
            updateBlock("dom", update.dom, blockId),
            OG_CARD_PERSIST_TIMEOUT_MS,
            "OG card block update timed out",
          );
        }
      } catch (error) {
        logger.debug("persistOgCardLink failed", {
          blockId,
          reason: getErrorMessage(error),
        });
      }
    }

    if (options.persistImage === false) {
      return;
    }

    const assetPath = normalizeOgCardAssetPath(metadata.imageAssetPath || "") || "";
    if (!this.isCurrentOgCardBlock(block, expectedUrl)) {
      return;
    }
    const currentAssetPath = readOgCardImageAssetPath(block) || "";
    if (assetPath === currentAssetPath) {
      return;
    }

    try {
      await withTimeout(
        setBlockAttrs(blockId, { [OG_CARD_IMAGE_ATTRIBUTE]: assetPath || null }),
        OG_CARD_PERSIST_TIMEOUT_MS,
        "OG card image attribute update timed out",
      );
      if (!this.isCurrentOgCardBlock(block, expectedUrl)) {
        return;
      }
      if (assetPath) {
        block.setAttribute(OG_CARD_IMAGE_ATTRIBUTE, assetPath);
      } else {
        block.removeAttribute(OG_CARD_IMAGE_ATTRIBUTE);
      }
    } catch (error) {
      logger.debug("persistOgCardImage failed", {
        blockId,
        assetPath,
        reason: getErrorMessage(error),
      });
    }
  }

  private isCurrentOgCardBlock(block: HTMLElement, expectedUrl: string): boolean {
    const target = findOgCardTarget(block);
    return Boolean(
      block.isConnected &&
      isOgCardEnabledValue(block.getAttribute(OG_CARD_BLOCK_ATTRIBUTE)) &&
      target &&
      normalizeOgCardUrl(target.href) === expectedUrl,
    );
  }

  private mountOgCardRefreshButton(target: ReturnType<typeof findOgCardTarget>): void {
    if (!target) {
      return;
    }

    const existing = target.block.querySelector<HTMLButtonElement>(
      `[${OG_CARD_REFRESH_BUTTON_ATTRIBUTE}]`,
    );
    if (existing) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dodo-og-card-refresh";
    button.setAttribute(OG_CARD_REFRESH_BUTTON_ATTRIBUTE, "true");
    button.setAttribute("contenteditable", "false");
    button.setAttribute("aria-label", "刷新链接信息");
    button.title = "刷新链接信息";
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 32 32"><use xlink:href="#iconRefresh"></use></svg>';
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }

      button.disabled = true;
      button.classList.add("is-loading");
      void this.processOgCardBlock(target.block, "refresh").finally(() => {
        button.disabled = false;
        button.classList.remove("is-loading");
      });
    });
    target.block.appendChild(button);
  }

  private findMatchingCustomIcon(domain: string): CustomIconRecord | null {
    const exactIcon = this.customIcons.find((icon) => icon.href === domain);
    if (exactIcon) {
      return exactIcon;
    }

    return (
      this.customIcons.find((icon) => matchLinkIconRule(icon.href, domain, this.dynamicStyle.isIPAddress)) ??
      null
    );
  }

  private findMatchingLocalIcon(domain: string): string {
    const exactIcon = this.customIcons.find((icon) =>
      icon.href === domain && Boolean(normalizeManagedIconUrl(icon.iconUrl)),
    );
    if (exactIcon) {
      return normalizeManagedIconUrl(exactIcon.iconUrl) || "";
    }

    const matchingIcon = this.customIcons.find((icon) =>
      matchLinkIconRule(icon.href, domain, this.dynamicStyle.isIPAddress) &&
      Boolean(normalizeManagedIconUrl(icon.iconUrl)),
    );
    return matchingIcon ? normalizeManagedIconUrl(matchingIcon.iconUrl) || "" : "";
  }

  private async ensureAutoFetchedIcon(domain: string): Promise<string | null> {
    const normalizedDomain = normalizeLinkIconHref(domain);
    if (!normalizedDomain) {
      return null;
    }

    const currentTask = this.autoFetchTasks.get(normalizedDomain);
    if (currentTask) {
      return currentTask;
    }

    const task = this.fetchAndStoreAutoFetchedIcon(normalizedDomain);
    this.autoFetchTasks.set(normalizedDomain, task);

    try {
      return await task;
    } finally {
      this.autoFetchTasks.delete(normalizedDomain);
    }
  }

  private async fetchAndStoreAutoFetchedIcon(domain: string): Promise<string | null> {
    try {
      const cachedIconUrl = this.iconCache.get(domain);
      if (cachedIconUrl) {
        return cachedIconUrl;
      }

      const matchingIcon = this.findMatchingCustomIcon(domain);
      if (matchingIcon) {
        this.iconCache.set(domain, matchingIcon.iconUrl);
        return matchingIcon.iconUrl;
      }

      const config = getLinkIconConfig();
      const remoteUrl = await resolveBestFavicon(domain, config.faviconServiceTemplates);
      if (!remoteUrl) {
        return null;
      }

      const localUrl = await this.downloadAndSaveFavicon(domain, remoteUrl);
      if (localUrl) {
        const savedIcons = await this.saveCustomIcons([...this.customIcons, { href: domain, iconUrl: localUrl }]);
        const savedIcon = savedIcons.find((icon) => icon.href === domain);
        const iconUrl = savedIcon?.iconUrl ?? localUrl;
        this.iconCache.set(domain, iconUrl);
        return iconUrl;
      }

      this.iconCache.set(domain, remoteUrl);
      return remoteUrl;
    } catch (error) {
      logger.debug("fetchAndStoreAutoFetchedIcon failed", { domain, reason: getErrorMessage(error) });
      return null;
    }
  }

  private async processAutoFetch(root: Element): Promise<void> {
    const linkElements = Array.from(
      root.querySelectorAll<HTMLElement>("span[data-type=a]:not([data-href^=siyuan])")
    );
    const domains = new Set<string>();

    linkElements.forEach((element) => {
      const href = element.getAttribute("data-href");
      if (!href) {
        return;
      }

      try {
        const normalizedDomain = normalizeLinkIconHref(new URL(href).hostname);
        if (normalizedDomain) {
          domains.add(normalizedDomain);
        }
      } catch {
        // ignore invalid URL
      }
    });

    for (const domain of domains) {
      if (this.findMatchingCustomIcon(domain)) {
        continue;
      }

      const cachedIconUrl = this.iconCache.get(domain);
      if (cachedIconUrl) {
        this.dynamicStyle.addIcon(domain, cachedIconUrl, false);
        continue;
      }

      const fetchedIconUrl = await this.ensureAutoFetchedIcon(domain);
      if (fetchedIconUrl) {
        this.dynamicStyle.addIcon(domain, fetchedIconUrl, false);
      }
    }

    this.dynamicStyle.markIPLinks(root);
    this.dynamicStyle.flushStyle();
  }

  private async downloadAndSaveFavicon(domain: string, remoteUrl: string): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(remoteUrl, {}, ICON_FETCH_TIMEOUT);
      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (contentType && !FAVICON_ALLOWED_CONTENT_TYPES.has(contentType)) {
        return null;
      }

      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_ICON_DOWNLOAD_BYTES) {
        return null;
      }

      const blob = await response.blob();
      if (blob.size > MAX_ICON_DOWNLOAD_BYTES) {
        return null;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = objectUrl;
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      const canvas = document.createElement("canvas");
      if (img.width > MAX_ICON_DIMENSION || img.height > MAX_ICON_DIMENSION) {
        return null;
      }

      canvas.width = img.width || DEFAULT_ICON_SIZE;
      canvas.height = img.height || DEFAULT_ICON_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.drawImage(img, 0, 0);
      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png");
      });
      if (!pngBlob) {
        return null;
      }

      const fileName = `${domain.replace(/[^\w.-]/g, "_")}.png`;
      const iconPath = `/data${ICON_DIR}/${fileName}`;
      const formData = new FormData();
      formData.append("path", iconPath);
      formData.append("file", pngBlob, fileName);
      formData.append("isDir", "false");
      formData.append("modTime", Date.now().toString());

      const json = await fetchJsonWithTimeout<SiyuanFileResponse>("/api/file/putFile", {
        method: "POST",
        body: formData,
      }, {
        timeoutMs: SIYUAN_FILE_REQUEST_TIMEOUT_MS,
        errorPrefix: "Siyuan putFile",
      });
      if (json.code !== 0) {
        return null;
      }

      return `${ICON_DIR}/${fileName}`;
    } catch (error) {
      logger.debug("downloadAndSaveFavicon failed", { domain, remoteUrl, reason: getErrorMessage(error) });
      return null;
    }
  }

  private openManager(): void {
    if (this.managerDialog) {
      this.managerDialog.element.querySelector(".b3-dialog")?.classList.remove("fn__none");
      return;
    }

    const onSave = async (newIcons: CustomIconRecord[], deleteList: string[]): Promise<CustomIconRecord[]> => {
      const savedIcons = await this.saveCustomIcons(newIcons, deleteList);
      this.refreshStaticIcons();
      document.querySelectorAll(".protyle").forEach((protyle) => {
        void this.processOgCards(protyle);
      });
      return savedIcons;
    };

    const onUpload = async (file: File, href: string): Promise<string | null> => {
      const normalizedHref = normalizeLinkIconHref(href);
      const safeHref = normalizedHref || href.trim();
      const ext = file.name.split(".").pop() ?? "png";
      const fileName = `${safeHref.replace(/[^a-zA-Z0-9._-]/g, "_")}_${Date.now()}.${ext}`;
      const iconPath = `${ICON_DIR}/${fileName}`;

      const formData = new FormData();
      formData.append("path", `/data${iconPath}`);
      formData.append("file", file, fileName);
      const json = await fetchJsonWithTimeout<SiyuanFileResponse>("/api/file/putFile", {
        method: "POST",
        body: formData,
      }, {
        timeoutMs: SIYUAN_FILE_REQUEST_TIMEOUT_MS,
        errorPrefix: "Siyuan putFile",
      });
      if (json.code !== 0) {
        return null;
      }

      return iconPath;
    };
    const onCleanUnused = (
      icons: CustomIconRecord[],
      onProgress: (progress: LinkIconCleanupProgress) => void,
    ): Promise<LinkIconCleanupResult> =>
      this.cleanUnusedCustomIcons(icons, onProgress);

    const container = document.createElement("div");
    container.style.cssText = "display:flex;flex-direction:column;height:100%;";
    this.managerComponent = new IconManager({
      target: container,
      props: {
        icons: [...this.customIcons],
        onSave,
        onUpload,
        onCleanUnused,
      },
    });

    this.managerDialog = new Dialog({
      title: "链接图标管理",
      content: '<div class="dodo-link-icon-manager" style="height:100%;"></div>',
      width: "720px",
      height: "580px",
      destroyCallback: () => {
        this.managerComponent?.$destroy();
        this.managerComponent = null;
        this.managerDialog = null;
      },
    });

    const mountPoint = this.managerDialog.element.querySelector(".dodo-link-icon-manager");
    if (mountPoint) {
      mountPoint.appendChild(container);
    }
  }
}
