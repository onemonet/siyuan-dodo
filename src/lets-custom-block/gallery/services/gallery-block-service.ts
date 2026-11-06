import {
  getBlockAttrs,
  setBlockAttrs,
  updateBlock,
} from "../../../api";
import {
  DEFAULT_GALLERY_CONFIG,
  GalleryConfig,
  GalleryDisplayMode,
  GalleryObjectFit,
} from "../types";

export const GALLERY_BLOCK_ATTR = "custom-dodo-block";
export const GALLERY_BLOCK_TYPE = "gallery";
export const GALLERY_CONFIG_ATTR = "custom-dodo-gallery-config";
export const GALLERY_ASSET_ATTR_PREFIX = "custom-data-assets-backup-";
export const GALLERY_LEGACY_BACKUP_ATTR = "custom-kmarkdown-backup";
export const GALLERY_LEGACY_BACKUP_VERSION_ATTR = "custom-backup-version";
export const GALLERY_IFRAME_PATH =
  "/plugins/siyuan-dodo/preview/gallery/iframe/index.html";

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const ASSET_ATTR_PATTERN = new RegExp(
  `^${GALLERY_ASSET_ATTR_PREFIX}(\\d+)$`,
);

export interface GalleryBlockOperationResult {
  success: boolean;
  message?: string;
  galleryBlockId?: string;
}

export class GalleryBlockService {
  static isGalleryBlock(blockElement: HTMLElement): boolean {
    return blockElement.getAttribute(GALLERY_BLOCK_ATTR) === GALLERY_BLOCK_TYPE;
  }

  static isLegacyGalleryBlock(blockElement: HTMLElement): boolean {
    if (!blockElement.hasAttribute(GALLERY_LEGACY_BACKUP_ATTR)) {
      return false;
    }

    return Array.from(blockElement.querySelectorAll<HTMLIFrameElement>("iframe"))
      .some((frame) => {
        try {
          return new URL(frame.src, window.location.origin).pathname.endsWith(
            "/preview/gallery.html",
          );
        } catch (_error) {
          return false;
        }
      });
  }

  static extractImageAssetPaths(blockElement: HTMLElement): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();
    const push = (value: string | null | undefined) => {
      const normalized = this.normalizeImagePath(value);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        paths.push(normalized);
      }
    };

    blockElement
      .querySelectorAll<HTMLElement>('span[data-type="a"], img')
      .forEach((element) => {
        push(
          element.getAttribute("data-href") ||
            element.getAttribute("data-src") ||
            element.getAttribute("src") ||
            element.getAttribute("href"),
        );
      });

    return paths;
  }

  static readIndexedAssets(attrs: Record<string, string>): string[] {
    return Object.entries(attrs)
      .map(([key, value]) => {
        const match = key.match(ASSET_ATTR_PATTERN);
        return match ? { index: Number(match[1]), value } : null;
      })
      .filter((item): item is { index: number; value: string } => !!item)
      .sort((left, right) => left.index - right.index)
      .map((item) => this.normalizeImagePath(item.value))
      .filter((value): value is string => !!value);
  }

  static parseConfig(raw: string | undefined): GalleryConfig {
    let parsed: Partial<GalleryConfig> = {};
    if (raw) {
      try {
        const value = JSON.parse(raw);
        if (value && typeof value === "object") {
          parsed = value as Partial<GalleryConfig>;
        }
      } catch (error) {
        console.warn("[相册块] 相册配置 JSON 解析失败，使用默认配置", error);
      }
    }

    return this.sanitizeConfig(parsed);
  }

  static getDefaultConfig(): GalleryConfig {
    return this.sanitizeConfig({ ...DEFAULT_GALLERY_CONFIG });
  }

  static async convertBlock(
    blockId: string,
    blockElement: HTMLElement,
  ): Promise<GalleryBlockOperationResult> {
    try {
      if (this.isGalleryBlock(blockElement)) {
        return { success: false, message: "该块已经是相册块" };
      }
      if (blockElement.hasAttribute(GALLERY_LEGACY_BACKUP_ATTR)) {
        return {
          success: false,
          message: "该块已有旧文件块备份，请先处理旧文件块",
        };
      }

      const assets = this.extractImageAssetPaths(blockElement);
      const config = this.getDefaultConfig();
      await updateBlock("markdown", this.buildIframe(blockId), blockId);
      await this.writeGalleryAttrs(blockId, assets, config);
      return { success: true, galleryBlockId: blockId };
    } catch (error) {
      console.error("[相册块] 转换相册失败", error);
      return { success: false, message: "转换相册失败，请查看控制台日志" };
    }
  }

  static async migrateLegacyBlock(
    blockId: string,
  ): Promise<GalleryBlockOperationResult> {
    try {
      const attrs = await getBlockAttrs(blockId);
      const assets = this.readIndexedAssets(attrs);
      if (!assets.length) {
        return { success: false, message: "旧相册没有可用图片" };
      }

      const config = this.parseConfig(attrs[GALLERY_CONFIG_ATTR]);
      await updateBlock("markdown", this.buildIframe(blockId), blockId);
      await this.writeGalleryAttrs(blockId, assets, config, true);
      return { success: true, galleryBlockId: blockId };
    } catch (error) {
      console.error("[相册块] 迁移旧相册失败", error);
      return { success: false, message: "迁移旧相册失败，请查看控制台日志" };
    }
  }

  static async updateGallery(
    blockId: string,
    assets: string[],
    config: Partial<GalleryConfig>,
  ): Promise<GalleryBlockOperationResult> {
    try {
      const normalizedAssets = assets
        .map((asset) => this.normalizeImagePath(asset))
        .filter((asset): asset is string => !!asset);
      const nextConfig = this.sanitizeConfig(config);
      await this.writeGalleryAttrs(blockId, normalizedAssets, nextConfig);
      this.notifyGalleryFrames(blockId);
      return { success: true, galleryBlockId: blockId };
    } catch (error) {
      console.error("[相册块] 更新相册失败", error);
      return { success: false, message: "更新相册失败，请查看控制台日志" };
    }
  }

  static buildIframe(blockId: string): string {
    const params = new URLSearchParams({ blockId });
    return `<iframe src="${GALLERY_IFRAME_PATH}?${params.toString()}" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>`;
  }

  private static async writeGalleryAttrs(
    blockId: string,
    assets: string[],
    config: GalleryConfig,
    clearLegacyBackup = false,
  ): Promise<void> {
    const existing = await getBlockAttrs(blockId);
    const attrs: Record<string, string | null> = {
      [GALLERY_BLOCK_ATTR]: GALLERY_BLOCK_TYPE,
      [GALLERY_CONFIG_ATTR]: JSON.stringify(config),
    };

    if (clearLegacyBackup) {
      attrs[GALLERY_LEGACY_BACKUP_ATTR] = null;
      attrs[GALLERY_LEGACY_BACKUP_VERSION_ATTR] = null;
    }

    Object.keys(existing).forEach((key) => {
      if (ASSET_ATTR_PATTERN.test(key)) {
        attrs[key] = null;
      }
    });

    assets.forEach((asset, index) => {
      attrs[`${GALLERY_ASSET_ATTR_PREFIX}${index}`] = asset;
    });

    Object.keys(attrs).forEach((key) => {
      if (attrs[key] === undefined) {
        delete attrs[key];
      }
    });

    await setBlockAttrs(blockId, attrs);
  }

  private static notifyGalleryFrames(blockId: string): void {
    document
      .querySelectorAll<HTMLIFrameElement>(`[data-node-id="${blockId}"] iframe`)
      .forEach((frame) => {
        frame.contentWindow?.postMessage(
          { type: "dodoGalleryRefresh", blockId },
          window.location.origin,
        );
      });
  }

  static normalizeImagePath(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const raw = value.trim();
    if (!raw) {
      return null;
    }

    try {
      if (/^https?:\/\//i.test(raw)) {
        const url = new URL(raw);
        return IMAGE_EXTENSIONS.has(this.getExtension(url.pathname)) ? url.href : null;
      }

      const url = new URL(raw.startsWith("/") ? raw : `/${raw}`, window.location.origin);
      const decodedPath = decodeURIComponent(url.pathname);
      if (!decodedPath.startsWith("/assets/") || decodedPath.split("/").includes("..")) {
        return null;
      }

      return `assets${decodedPath.slice("/assets".length)}${url.search}`;
    } catch (_error) {
      return null;
    }
  }

  private static getExtension(path: string): string {
    const dotIndex = path.lastIndexOf(".");
    return dotIndex >= 0 ? path.slice(dotIndex).toLowerCase() : "";
  }

  private static sanitizeConfig(config: Partial<GalleryConfig>): GalleryConfig {
    const mode: GalleryDisplayMode =
      config.mode === "grid" || config.mode === "carousel"
        ? config.mode
        : "masonry";
    const defaultObjectFit: GalleryObjectFit =
      mode === "carousel"
        ? "contain"
        : mode === "grid"
          ? "cover"
          : DEFAULT_GALLERY_CONFIG.objectFit;
    const objectFit: GalleryObjectFit =
      config.objectFit === "cover" || config.objectFit === "contain"
        ? config.objectFit
        : defaultObjectFit;
    const itemWidth = this.toPositiveInt(
      config.itemWidth,
      DEFAULT_GALLERY_CONFIG.itemWidth,
      96,
      800,
    );
    return {
      version: 1,
      mode,
      itemWidth,
      itemHeight: this.toPositiveInt(
        config.itemHeight,
        mode === "grid" ? itemWidth : DEFAULT_GALLERY_CONFIG.itemHeight,
        96,
        800,
      ),
      gap: this.toPositiveInt(config.gap, DEFAULT_GALLERY_CONFIG.gap, 0, 64),
      objectFit,
      background:
        typeof config.background === "string" && config.background.trim()
          ? config.background.trim()
          : DEFAULT_GALLERY_CONFIG.background,
      borderRadius: this.toPositiveInt(
        config.borderRadius,
        DEFAULT_GALLERY_CONFIG.borderRadius,
        0,
        32,
      ),
    };
  }

  private static toPositiveInt(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ): number {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value)))
      : fallback;
  }
}
