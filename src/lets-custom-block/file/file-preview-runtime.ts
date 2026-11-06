import { showMessage } from "siyuan";

const OPEN_FILE_MESSAGE_TYPE = "openOfficeFile";
const PREVIEW_BRIDGE_REQUEST_TYPE = "dodoPreviewRequest";
const PREVIEW_BRIDGE_RESPONSE_TYPE = "dodoPreviewResponse";
const FILE_UPLOAD_MESSAGE_TYPE = "dodoFileUpload";
const FILE_UPLOAD_RESULT_TYPE = "dodoFileUploadResult";
const FILE_CONFIG_ATTR = "custom-dodo-file-config";
const ASSET_PATH_PATTERN = /^assets\/[^?#<>"'`\\]+$/;
const BLOCK_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/i;
const PREVIEW_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".docx",
  ".epub",
  ".glb",
  ".gltf",
  ".jpeg",
  ".jpg",
  ".png",
  ".pptx",
  ".svg",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx",
]);
const PREVIEW_RESOURCE_PATHS = new Set([
  "gallery/iframe/app.css",
  "src/epub.min.js",
  "src/js-preview/docx.css",
  "src/js-preview/docx.umd.js",
  "src/js-preview/excel.css",
  "src/js-preview/excel.umd.js",
  "src/js-preview/pptx-preview.umd.js",
  "src/jszip.min.js",
  "src/model-viewer/model-viewer.min.js",
]);

interface PreviewFrameContext {
  frame: HTMLIFrameElement;
  blockId: string;
}

const bridgeClients = new Set<FilePreviewRuntime>();
const sharedMessageHandler = (event: MessageEvent) => {
  const client = bridgeClients.values().next().value as FilePreviewRuntime | undefined;
  void client?.handleMessage(event);
};

/**
 * 文件块运行时桥接。
 * 文件块本身由 lets-custom-block 管理，这里只负责 iframe 资源读取和系统打开。
 */
export default class FilePreviewRuntime {
  onload() {
    if (bridgeClients.size === 0) {
      window.addEventListener("message", sharedMessageHandler);
    }
    bridgeClients.add(this);
  }

  onunload() {
    bridgeClients.delete(this);
    if (bridgeClients.size === 0) {
      window.removeEventListener("message", sharedMessageHandler);
    }
  }

  async handleMessage(event: MessageEvent) {
    const context = this.getTrustedPreviewContext(event);
    if (!context) {
      return;
    }

    if (event.data?.type === OPEN_FILE_MESSAGE_TYPE) {
      try {
        const relativePath = this.normalizeAssetPath(event.data.path);
        if (!relativePath || !(await this.isFrameAsset(context.blockId, relativePath))) {
          showMessage('文件路径无效');
          return;
        }

        const response = await fetch('/api/asset/resolveAssetPath', {
          method: 'POST',
          headers: this.getSiyuanHeaders('application/json'),
          body: JSON.stringify({ path: relativePath })
        });

        const result = await response.json();
        
        if (result.code !== 0) {
          showMessage(`解析文件路径失败：${result.msg}`);
          return;
        }

        const absolutePath = result.data;
        const os = (window as any).siyuan?.config?.system?.os;
        if (os === 'android') {
          (window as any).JSAndroid?.openExternal(absolutePath);
          showMessage('正在打开文件...');
        } else if (os === 'ios') {
          (window as any).webkit?.messageHandlers?.openLink?.postMessage(absolutePath);
          showMessage('正在打开文件...');
        } else {
          await this.openLocalFile(absolutePath);
          showMessage('已打开文件');
        }
      } catch (error) {
        showMessage(`打开文件失败：${(error as Error).message}`);
      }
    }

    if (event.data?.type === FILE_UPLOAD_MESSAGE_TYPE) {
      await this.handleFileUpload(event, context);
      return;
    }

    if (event.data?.type === PREVIEW_BRIDGE_REQUEST_TYPE) {
      await this.handlePreviewBridgeRequest(event, context);
    }
  }

  private async handlePreviewBridgeRequest(
    event: MessageEvent,
    context: PreviewFrameContext,
  ): Promise<void> {
    const requestId = event.data?.requestId;
    if (typeof requestId !== "string" || !requestId) {
      return;
    }

    try {
      switch (event.data?.action) {
        case "getBlockAttrs": {
          const blockId = event.data?.blockId;
          if (!this.isAllowedBlockId(blockId) || blockId !== context.blockId) {
            throw new Error("块 ID 无效");
          }

          const result = await this.fetchBlockAttrs(context.blockId);
          this.postPreviewBridgeResponse(event.source, requestId, {
            attrs: result,
          });
          return;
        }

        case "getAsset": {
          const path = this.normalizeAssetPath(event.data?.path);
          if (!path || !(await this.isFrameAsset(context.blockId, path))) {
            throw new Error("资源路径无效");
          }

          const response = await fetch(`/${path}`, {
            headers: this.getSiyuanHeaders(),
          });
          const contentType = response.headers.get("Content-Type") || "";
          if (!response.ok || response.url.includes("/check-auth") || /text\/html/i.test(contentType)) {
            throw new Error(`资源读取失败: ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          this.postPreviewBridgeResponse(
            event.source,
            requestId,
            {
              arrayBuffer,
              contentType: contentType || this.getFallbackContentType(path),
            },
            [arrayBuffer],
          );
          return;
        }

        case "setEpubProgress": {
          const asset = this.normalizeAssetPath(event.data?.asset);
          const progress = event.data?.progress;
          if (!asset || !this.isAllowedPreviewAssetPath(asset)) {
            throw new Error("文件路径无效");
          }
          if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
            throw new Error("阅读进度无效");
          }

          const normalizedProgress: Record<string, unknown> = {};
          if (typeof progress.cfi === "string" && progress.cfi.length <= 4096) {
            normalizedProgress.cfi = progress.cfi;
          }
          if (typeof progress.href === "string" && progress.href.length <= 4096) {
            normalizedProgress.href = progress.href;
          }
          if (
            typeof progress.percentage === "number" &&
            Number.isFinite(progress.percentage)
          ) {
            normalizedProgress.percentage = progress.percentage;
          }
          if (!normalizedProgress.cfi && !normalizedProgress.href) {
            throw new Error("阅读进度为空");
          }

          const existing = await this.fetchBlockAttrs(context.blockId);
          const boundAsset = this.normalizeAssetPath(
            existing["custom-data-assets-backup-0"],
          );
          if (!boundAsset || boundAsset !== asset) {
            throw new Error("文件块资源已发生变化");
          }

          let existingConfig: Record<string, any> = {};
          try {
            const parsed = JSON.parse(existing[FILE_CONFIG_ATTR] || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              existingConfig = parsed;
            }
          } catch (_error) {
            // Ignore malformed historical config and replace it with a valid one.
          }

          const existingEpubConfig =
            existingConfig.epub &&
            typeof existingConfig.epub === "object" &&
            !Array.isArray(existingConfig.epub)
              ? existingConfig.epub
              : {};
          const config = {
            ...existingConfig,
            version: 1,
            asset,
            epub: {
              ...existingEpubConfig,
              progress: normalizedProgress,
            },
          };
          const serialized = JSON.stringify(config);
          if (serialized.length > 16000) {
            throw new Error("文件块配置过大");
          }

          await this.setBlockAttrs(context.blockId, {
            [FILE_CONFIG_ATTR]: serialized,
          });
          this.postPreviewBridgeResponse(event.source, requestId, {
            success: true,
          });
          return;
        }

        case "getPreviewResource": {
          const path = this.normalizePreviewResourcePath(event.data?.path);
          if (!path) {
            throw new Error("预览资源路径无效");
          }

          const response = await fetch(
            `/plugins/siyuan-dodo/preview/${path}`,
            { headers: this.getSiyuanHeaders() },
          );
          const contentType = response.headers.get("Content-Type") || "";
          if (!response.ok || response.url.includes("/check-auth") || /text\/html/i.test(contentType)) {
            throw new Error(`预览资源读取失败: ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          this.postPreviewBridgeResponse(
            event.source,
            requestId,
            {
              arrayBuffer,
              contentType: contentType || this.getPreviewResourceContentType(path),
            },
            [arrayBuffer],
          );
          return;
        }

        default:
          throw new Error("不支持的预览请求");
      }
    } catch (error) {
      this.postPreviewBridgeResponse(event.source, requestId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleFileUpload(
    event: MessageEvent,
    context: PreviewFrameContext,
  ): Promise<void> {
    const requestId = event.data?.requestId;
    try {
      const file = event.data?.file;
      if (!(file instanceof Blob) || typeof file.name !== "string" || !file.name) {
        throw new Error("未找到要上传的文件");
      }
      if (!this.isAllowedPreviewAssetPath(`assets/${file.name}`)) {
        throw new Error("当前文件格式暂不支持预览");
      }

      const form = new FormData();
      form.append("assetsDirPath", "/assets/");
      form.append("file[]", file, file.name);
      const response = await fetch("/api/asset/upload", {
        method: "POST",
        headers: this.getSiyuanHeaders(),
        body: form,
      });
      if (!response.ok) {
        throw new Error(`文件上传失败: ${response.status}`);
      }

      const result = await response.json();
      if (result.code !== 0) {
        throw new Error(result.msg || "文件上传失败");
      }

      const uploaded = result.data?.succMap?.[file.name];
      const path = this.normalizeAssetPath(uploaded);
      if (!path) {
        throw new Error("文件上传后路径无效");
      }

      const existing = await this.fetchBlockAttrs(context.blockId);
      const attrs: Record<string, string | null> = {
        "custom-dodo-block": "file",
        "custom-data-assets-backup-0": path,
      };
      Object.keys(existing).forEach((key) => {
        if (
          key.startsWith("custom-data-assets-backup-") &&
          key !== "custom-data-assets-backup-0"
        ) {
          attrs[key] = null;
        }
      });
      await this.setBlockAttrs(context.blockId, attrs);

      this.postFileUploadResult(event.source, requestId, {
        success: true,
        path,
      });
    } catch (error) {
      this.postFileUploadResult(event.source, requestId, {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private postFileUploadResult(
    source: MessageEventSource | null,
    requestId: unknown,
    payload: Record<string, unknown>,
  ): void {
    if (!source || typeof requestId !== "string" || !requestId) {
      return;
    }

    (source as Window).postMessage(
      {
        type: FILE_UPLOAD_RESULT_TYPE,
        requestId,
        ...payload,
      },
      "*",
    );
  }

  private postPreviewBridgeResponse(
    source: MessageEventSource | null,
    requestId: string,
    payload: Record<string, unknown>,
    transfer?: Transferable[],
  ): void {
    if (!source || !("postMessage" in source)) {
      return;
    }

    (source as Window).postMessage(
      {
        type: PREVIEW_BRIDGE_RESPONSE_TYPE,
        requestId,
        ...payload,
      },
      "*",
      transfer || [],
    );
  }

  private getTrustedPreviewContext(
    event: MessageEvent,
  ): PreviewFrameContext | null {
    if (!event.source) {
      return null;
    }

    if (event.origin !== window.location.origin && event.origin !== "null") {
      return null;
    }

    const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe")).find(
      (iframe) => iframe.contentWindow === event.source
    );

    if (!frame) {
      return null;
    }

    const framePath = this.getFramePath(frame);
    if (!framePath.startsWith("/plugins/siyuan-dodo/preview/")) {
      return null;
    }

    const block = frame.closest<HTMLElement>("[data-node-id]");
    const blockId = block?.dataset.nodeId || "";
    return this.isAllowedBlockId(blockId) ? { frame, blockId } : null;
  }

  private getFramePath(frame: HTMLIFrameElement): string {
    try {
      return new URL(frame.src, window.location.origin).pathname;
    } catch (_error) {
      return "";
    }
  }

  private isAllowedAssetPath(path: unknown): path is string {
    return (
      typeof path === "string" &&
      ASSET_PATH_PATTERN.test(path) &&
      !path.split("/").includes("..")
    );
  }

  private isAllowedPreviewAssetPath(path: unknown): path is string {
    return (
      this.isAllowedAssetPath(path) &&
      PREVIEW_ASSET_EXTENSIONS.has(this.getPathExtension(path))
    );
  }

  private normalizePreviewResourcePath(path: unknown): string | null {
    return typeof path === "string" && PREVIEW_RESOURCE_PATHS.has(path)
      ? path
      : null;
  }

  private normalizeAssetPath(path: unknown): string | null {
    if (!this.isAllowedAssetPath(path)) {
      return null;
    }

    try {
      const url = new URL(`/${path}`, window.location.origin);
      const decodedPath = decodeURIComponent(url.pathname);
      if (!decodedPath.startsWith("/assets/") || decodedPath.split("/").includes("..")) {
        return null;
      }

      const normalized = `assets${decodedPath.slice("/assets".length)}${url.search}`;
      return this.isAllowedPreviewAssetPath(normalized) ? normalized : null;
    } catch (_error) {
      return null;
    }
  }

  private async fetchBlockAttrs(blockId: string): Promise<Record<string, string>> {
    const response = await fetch("/api/attr/getBlockAttrs", {
      method: "POST",
      headers: this.getSiyuanHeaders("application/json"),
      body: JSON.stringify({ id: blockId }),
    });
    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(result.msg || "获取块属性失败");
    }
    return result.data || {};
  }

  private async setBlockAttrs(
    blockId: string,
    attrs: Record<string, string | null>,
  ): Promise<void> {
    const response = await fetch("/api/attr/setBlockAttrs", {
      method: "POST",
      headers: this.getSiyuanHeaders("application/json"),
      body: JSON.stringify({ id: blockId, attrs }),
    });
    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(result.msg || "保存文件块属性失败");
    }
  }

  private async isFrameAsset(blockId: string, path: string): Promise<boolean> {
    const attrs = await this.fetchBlockAttrs(blockId);
    return Object.entries(attrs)
      .filter(([key]) => key.startsWith("custom-data-assets-backup-"))
      .some(([, value]) => this.normalizeAssetPath(value) === path);
  }

  private isAllowedBlockId(blockId: unknown): blockId is string {
    return typeof blockId === "string" && BLOCK_ID_PATTERN.test(blockId);
  }

  private getPathExtension(path: string): string {
    const dotIndex = path.lastIndexOf(".");
    return dotIndex >= 0 ? path.slice(dotIndex).toLowerCase() : "";
  }

  private getFallbackContentType(path: string): string {
    const extension = this.getPathExtension(path);
    if ([".avif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension)) {
      return extension === ".svg" ? "image/svg+xml" : `image/${extension.slice(1).replace("jpg", "jpeg")}`;
    }
    if (extension === ".txt") {
      return "text/plain";
    }
    if (extension === ".epub") {
      return "application/epub+zip";
    }
    return "application/octet-stream";
  }

  private getPreviewResourceContentType(path: string): string {
    return path.endsWith(".css") ? "text/css" : "text/javascript";
  }

  private getSiyuanHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const token =
      (window as any).siyuan?.config?.api?.token ||
      window.localStorage?.getItem("SIYUAN_API_TOKEN");
    if (typeof token === "string" && token) {
      headers.Authorization = `Token ${token}`;
    }
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  private async openLocalFile(absolutePath: string): Promise<void> {
    const electron = this.getElectronModule();
    if (electron?.shell?.openPath) {
      const errorMessage = await electron.shell.openPath(absolutePath);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
      return;
    }

    await this.openWithExecFile(absolutePath);
  }

  private getElectronModule(): any {
    try {
      return require("electron");
    } catch (_error) {
      return null;
    }
  }

  private openWithExecFile(absolutePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { execFile } = require("child_process");
      const platform = require("os").platform();
      const command =
        platform === "win32"
          ? "powershell.exe"
          : platform === "darwin"
            ? "open"
            : "xdg-open";
      const args =
        platform === "win32"
          ? ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", absolutePath]
          : [absolutePath];

      execFile(command, args, { windowsHide: true }, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

}
