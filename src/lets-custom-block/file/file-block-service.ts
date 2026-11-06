import { getBlockAttrs, setBlockAttrs, updateBlock } from "../../api";
import { IframeTemplateService } from "./iframe-template-service";

export const FILE_BLOCK_ATTR = "custom-dodo-block";
export const FILE_BLOCK_TYPE = "file";
export const FILE_ASSET_ATTR = "custom-data-assets-backup-0";
export const FILE_ASSET_ATTR_PREFIX = "custom-data-assets-backup-";
export const FILE_LEGACY_BACKUP_ATTR = "custom-kmarkdown-backup";
export const FILE_LEGACY_BACKUP_VERSION_ATTR = "custom-backup-version";

const FILE_ASSET_ATTR_PATTERN = new RegExp(
  `^${FILE_ASSET_ATTR_PREFIX}(\\d+)$`,
);
const SUPPORTED_EXTENSIONS = new Set([
  ".docx",
  ".epub",
  ".glb",
  ".gltf",
  ".pptx",
  ".txt",
  ".xls",
  ".xlsx",
]);
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
const FILE_ACTIVE_ATTR = "data-file-active";
const DOUBLE_TAP_DELAY = 350;
const DOUBLE_TAP_DISTANCE = 24;

interface PendingFileTap {
  block: HTMLElement;
  time: number;
  x: number;
  y: number;
}

export interface FileBlockOperationResult {
  success: boolean;
  message?: string;
  fileBlockId?: string;
  asset?: string;
}

export class FileBlockService {
  private static activationCleanup: (() => void) | null = null;
  private static pendingTap: PendingFileTap | null = null;
  private static pendingTapTimer: number | null = null;

  static isFileBlock(blockElement: HTMLElement): boolean {
    return blockElement.getAttribute(FILE_BLOCK_ATTR) === FILE_BLOCK_TYPE;
  }

  static initializePreviewActivation(): void {
    if (this.activationCleanup) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const block = this.findPreviewBlock(event);
      this.getActivePreviewBlocks().forEach((activeBlock) => {
        if (activeBlock !== block) {
          this.deactivatePreview(activeBlock);
        }
      });

      if (event.pointerType !== "mouse" && block !== this.pendingTap?.block) {
        this.clearPendingTap();
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      const block = this.findPreviewBlock(event);
      if (!block || !this.isActivationTarget(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.activatePreview(block);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        return;
      }

      const block = this.findPreviewBlock(event);
      if (!block || !this.isActivationTarget(event)) {
        this.clearPendingTap();
        return;
      }

      const now = Date.now();
      const previous = this.pendingTap;
      const distance = previous
        ? Math.hypot(event.clientX - previous.x, event.clientY - previous.y)
        : Infinity;
      if (
        previous &&
        previous.block === block &&
        now - previous.time <= DOUBLE_TAP_DELAY &&
        distance <= DOUBLE_TAP_DISTANCE
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.clearPendingTap();
        this.activatePreview(block);
        return;
      }

      this.clearPendingTap();
      this.pendingTap = {
        block,
        time: now,
        x: event.clientX,
        y: event.clientY,
      };
      this.pendingTapTimer = window.setTimeout(
        () => this.clearPendingTap(),
        DOUBLE_TAP_DELAY,
      );
    };

    const handlePointerCancel = () => this.clearPendingTap();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      this.getActivePreviewBlocks().forEach((block) =>
        this.deactivatePreview(block),
      );
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("dblclick", handleDoubleClick, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    document.addEventListener("keydown", handleKeydown, true);

    this.activationCleanup = () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("dblclick", handleDoubleClick, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
      document.removeEventListener("keydown", handleKeydown, true);
      this.clearPendingTap();
      this.getActivePreviewBlocks().forEach((block) =>
        this.deactivatePreview(block),
      );
    };
  }

  static destroyPreviewActivation(): void {
    this.activationCleanup?.();
    this.activationCleanup = null;
  }

  private static activatePreview(block: HTMLElement): void {
    this.getActivePreviewBlocks().forEach((activeBlock) => {
      if (activeBlock !== block) {
        this.deactivatePreview(activeBlock);
      }
    });
    block.setAttribute(FILE_ACTIVE_ATTR, "true");
    this.clearNativeSelection(block);
  }

  private static deactivatePreview(block: HTMLElement): void {
    block.removeAttribute(FILE_ACTIVE_ATTR);
  }

  private static clearNativeSelection(block: HTMLElement): void {
    const clear = () => {
      const selection = window.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        block.contains(selection.anchorNode)
      ) {
        selection.removeAllRanges();
      }
      block.classList.remove("protyle-wysiwyg--select");
      block
        .querySelectorAll<HTMLElement>(".protyle-wysiwyg--select")
        .forEach((element) => element.classList.remove("protyle-wysiwyg--select"));
    };

    clear();
    window.requestAnimationFrame(clear);
    window.setTimeout(clear, 0);
  }

  private static getActivePreviewBlocks(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        `[${FILE_BLOCK_ATTR}="${FILE_BLOCK_TYPE}"][${FILE_ACTIVE_ATTR}="true"]`,
      ),
    );
  }

  private static clearPendingTap(): void {
    if (this.pendingTapTimer !== null) {
      window.clearTimeout(this.pendingTapTimer);
      this.pendingTapTimer = null;
    }
    this.pendingTap = null;
  }

  private static findPreviewBlock(event: MouseEvent | PointerEvent): HTMLElement | null {
    const candidates: Element[] = [];
    if (event.target instanceof Element) {
      candidates.push(event.target);
    }
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      candidates.push(...document.elementsFromPoint(event.clientX, event.clientY));
    }

    for (const candidate of candidates) {
      const block = candidate.closest<HTMLElement>(
        `[data-node-id][${FILE_BLOCK_ATTR}="${FILE_BLOCK_TYPE}"]`,
      );
      if (block && this.hasPreviewFrame(block)) {
        return block;
      }
    }
    return null;
  }

  private static isActivationTarget(event: MouseEvent | PointerEvent): boolean {
    if (event.target instanceof Element && event.target.closest(".protyle-icons")) {
      return false;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return !element?.closest(".protyle-icons");
  }

  private static hasPreviewFrame(block: HTMLElement): boolean {
    return Array.from(block.querySelectorAll<HTMLIFrameElement>("iframe")).some(
      (frame) => this.isPreviewFrame(frame),
    );
  }

  private static isPreviewFrame(frame: HTMLIFrameElement): boolean {
    try {
      return new URL(frame.src, window.location.origin).pathname.endsWith(
        "/preview/file.html",
      );
    } catch (_error) {
      return false;
    }
  }

  static ensurePreviewFrameAccess(blockElement: HTMLElement): void {
    if (!this.isFileBlock(blockElement)) {
      return;
    }

    blockElement.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
      try {
        const path = new URL(frame.src, window.location.origin).pathname;
        if (!path.endsWith("/preview/file.html")) {
          return;
        }
      } catch (_error) {
        return;
      }

      const sandbox = frame.getAttribute("sandbox");
      if (!sandbox || !/(?:^|\s)allow-same-origin(?:\s|$)/.test(sandbox)) {
        return;
      }

      const nextSandbox = sandbox
        .split(/\s+/)
        .filter((token) => token && token !== "allow-same-origin")
        .join(" ");
      frame.setAttribute("sandbox", nextSandbox);
      frame.src = frame.src;
    });
  }

  static isLegacyFileBlock(blockElement: HTMLElement): boolean {
    if (!blockElement.hasAttribute(FILE_LEGACY_BACKUP_ATTR)) {
      return false;
    }

    return Array.from(blockElement.querySelectorAll<HTMLIFrameElement>("iframe"))
      .some((frame) => {
        try {
          return new URL(frame.src, window.location.origin).pathname.endsWith(
            "/preview/file.html",
          );
        } catch (_error) {
          return false;
        }
      });
  }

  static extractAssetPaths(blockElement: HTMLElement): string[] {
    const assets: string[] = [];
    const seen = new Set<string>();
    const push = (value: string | null | undefined) => {
      const normalized = this.normalizeAssetPath(value);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        assets.push(normalized);
      }
    };

    blockElement
      .querySelectorAll<HTMLElement>('span[data-type="a"], span[data-type="img"], img')
      .forEach((element) => {
        push(
          element.getAttribute("data-href") ||
            element.getAttribute("data-src") ||
            element.getAttribute("src") ||
            element.getAttribute("href") ||
            element.querySelector("img")?.getAttribute("src"),
        );
      });

    return assets;
  }

  static readStoredAsset(attrs: Record<string, string>): string | null {
    const asset = this.normalizeAssetPath(attrs[FILE_ASSET_ATTR]);
    return asset && this.isSupportedFilePath(asset) ? asset : null;
  }

  static readIndexedAssets(attrs: Record<string, string>): string[] {
    return Object.entries(attrs)
      .map(([key, value]) => {
        const match = key.match(FILE_ASSET_ATTR_PATTERN);
        return match ? { index: Number(match[1]), value } : null;
      })
      .filter((item): item is { index: number; value: string } => !!item)
      .sort((left, right) => left.index - right.index)
      .map((item) => this.normalizeAssetPath(item.value))
      .filter((value): value is string => !!value);
  }

  static async convertBlock(
    blockId: string,
    blockElement: HTMLElement,
  ): Promise<FileBlockOperationResult> {
    try {
      if (this.isFileBlock(blockElement)) {
        return { success: false, message: "该块已经是文件块" };
      }

      const assets = this.extractAssetPaths(blockElement);
      if (assets.length > 1) {
        return { success: false, message: "文件块只支持绑定一个文件" };
      }
      const asset = assets[0] || null;
      if (asset && !this.isSupportedFilePath(asset)) {
        return { success: false, message: "当前文件格式暂不支持预览" };
      }

      const existing = await getBlockAttrs(blockId);
      const iframe = IframeTemplateService.generateIframe("file", assets, blockId);
      await updateBlock("markdown", iframe, blockId);
      await setBlockAttrs(blockId, this.buildAttrs(asset, existing));
      return { success: true, fileBlockId: blockId, asset: asset || undefined };
    } catch (error) {
      console.error("[文件块] 转换文件块失败", error);
      return { success: false, message: "转换文件块失败，请查看控制台日志" };
    }
  }

  static async updateAsset(
    blockId: string,
    asset: string,
  ): Promise<FileBlockOperationResult> {
    try {
      const normalized = this.normalizeAssetPath(asset);
      if (!normalized) {
        return { success: false, message: "请输入有效的思源资源路径" };
      }
      if (!this.isSupportedFilePath(normalized)) {
        return { success: false, message: "当前文件格式暂不支持预览" };
      }

      const existing = await getBlockAttrs(blockId);
      await setBlockAttrs(blockId, this.buildAttrs(normalized, existing));
      this.notifyFileFrames(blockId);
      return { success: true, fileBlockId: blockId, asset: normalized };
    } catch (error) {
      console.error("[文件块] 更新文件失败", error);
      return { success: false, message: "更新文件失败，请查看控制台日志" };
    }
  }

  static async migrateLegacyBlock(blockId: string): Promise<FileBlockOperationResult> {
    try {
      const existing = await getBlockAttrs(blockId);
      const assets = this.readIndexedAssets(existing);
      if (assets.length === 0) {
        return { success: false, message: "旧文件块没有可用文件" };
      }
      if (assets.length > 1) {
        return { success: false, message: "旧文件块包含多个文件，无法迁移" };
      }
      if (!this.isSupportedFilePath(assets[0])) {
        return { success: false, message: "旧文件格式暂不支持预览" };
      }

      await setBlockAttrs(blockId, this.buildAttrs(assets[0], existing));
      return { success: true, fileBlockId: blockId };
    } catch (error) {
      console.error("[文件块] 迁移旧文件块失败", error);
      return { success: false, message: "迁移文件块失败，请查看控制台日志" };
    }
  }

  static buildMarkdown(asset: string): string {
    const normalized = this.normalizeAssetPath(asset);
    if (!normalized) {
      return "";
    }

    const destination = /[\s()<>]/.test(normalized)
      ? `<${normalized}>`
      : normalized;
    const name = this.getFileName(normalized);
    return IMAGE_EXTENSIONS.has(this.getPathExtension(normalized))
      ? `![${name}](${destination})`
      : `[${name}](${destination})`;
  }

  static extractAssetPathsFromText(raw: string): string[] {
    const extracted = new Set<string>();
    const addCandidate = (value: string) => {
      const candidate = value
        .trim()
        .replace(/^<|>$/g, "")
        .replace(/^['"]|['"]$/g, "");
      const asset = this.normalizeAssetPath(candidate);
      if (asset && this.isSupportedFilePath(asset)) {
        extracted.add(asset);
      }
    };

    const markdownLinkPattern = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)]+?))\s*\)/g;
    for (const match of raw.matchAll(markdownLinkPattern)) {
      addCandidate(match[1] || match[2] || "");
    }

    const htmlLinkPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    for (const match of raw.matchAll(htmlLinkPattern)) {
      addCandidate(match[1] || "");
    }

    const absoluteUrlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;
    for (const match of raw.matchAll(absoluteUrlPattern)) {
      addCandidate(match[0] || "");
    }

    const extensions = "docx|epub|glb|gltf|pptx|txt|xls|xlsx";
    const assetPathPattern = new RegExp(
      `(?:^|[\\s"'(<])((?:\\/?assets\\/)[^)]*?\\.(?:${extensions})(?:\\?[^)\\]"'<>]*)?)(?=\\s*(?:\\/?assets\\/|[)\\]"'<>]|$))`,
      "gi",
    );
    for (const match of raw.matchAll(assetPathPattern)) {
      addCandidate(match[1] || "");
    }

    return Array.from(extracted);
  }

  static normalizeAssetPath(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    try {
      const raw = value.trim();
      if (!raw) {
        return null;
      }

      const url = /^https?:\/\//i.test(raw)
        ? new URL(raw)
        : new URL(raw.startsWith("/") ? raw : `/${raw}`, window.location.origin);
      if (url.origin !== window.location.origin) {
        return null;
      }
      const decodedPath = decodeURIComponent(url.pathname);
      if (
        !decodedPath.startsWith("/assets/") ||
        decodedPath.split("/").includes("..")
      ) {
        return null;
      }

      return `assets${decodedPath.slice("/assets".length)}${url.search}`;
    } catch (_error) {
      return null;
    }
  }

  static isSupportedFilePath(path: string): boolean {
    return SUPPORTED_EXTENSIONS.has(this.getPathExtension(path));
  }

  private static buildAttrs(
    asset: string | null,
    existing: Record<string, string>,
  ): Record<string, string | null> {
    const attrs: Record<string, string | null> = {
      [FILE_BLOCK_ATTR]: FILE_BLOCK_TYPE,
      [FILE_ASSET_ATTR]: asset,
      [FILE_LEGACY_BACKUP_ATTR]: null,
      [FILE_LEGACY_BACKUP_VERSION_ATTR]: null,
    };

    Object.keys(existing).forEach((key) => {
      if (FILE_ASSET_ATTR_PATTERN.test(key) && key !== FILE_ASSET_ATTR) {
        attrs[key] = null;
      }
    });

    return attrs;
  }

  private static notifyFileFrames(blockId: string): void {
    document
      .querySelectorAll<HTMLElement>("[data-node-id]")
      .forEach((block) => {
        if (block.dataset.nodeId !== blockId) {
          return;
        }
        block.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
          frame.contentWindow?.postMessage(
            { type: "dodoFileRefresh", blockId },
            "*",
          );
        });
      });
  }

  private static getFileName(path: string): string {
    try {
      const url = new URL(`/${path}`, window.location.origin);
      const name = decodeURIComponent(url.pathname)
        .slice("/assets/".length)
        .split("/")
        .pop()
        ?.trim();
      return name || "文件";
    } catch (_error) {
      return "文件";
    }
  }

  private static getPathExtension(path: string): string {
    const cleanPath = path.split(/[?#]/, 1)[0];
    const dotIndex = cleanPath.lastIndexOf(".");
    return dotIndex >= 0 ? cleanPath.slice(dotIndex).toLowerCase() : "";
  }
}
