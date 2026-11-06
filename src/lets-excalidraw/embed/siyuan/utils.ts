import { SiyuanBlockData } from "./types";
import CryptoJS from "crypto-js";

/**
 * 获取父页面的 window 对象
 */
export function getParentWindow(): Window | null {
  return window.parent !== window ? window.parent : null;
}

/**
 * 获取父页面的 excalidraw API
 */
export function getParentExcalidrawAPI(): any {
  const parentWindow = getParentWindow();
  if (parentWindow && (parentWindow as any).excalidrawAPI) {
    return (parentWindow as any).excalidrawAPI;
  }
  return null;
}

export async function getElementData(elementId: string, blockId: string): Promise<SiyuanBlockData | null> {
  const api = getParentExcalidrawAPI();
  if (!api) return null;

  const element = api.getSceneElements().find((el : any) => el.id === elementId);
  if (element) {
    const [content, dom] = await Promise.all([fetchBlockMarkdown(blockId), fetchBlockDOM(blockId)]);
    if (content === null && dom === null) {
      if (element.customData?.embedSiyuan) {
        const elements = api.getSceneElements().map((element: any) => {
          if (element.id === elementId && element.customData) {
            element.customData.embedSiyuan = undefined;
            element.customData.embedIframeVersionNonce = undefined;
          }
          return element;
        })
        api.updateScene({ elements: elements });
      }
      return null;
    }

    const data: SiyuanBlockData = {
      blockId: blockId,
      content: OptimizeMarkdown(content || ""),
      ...(dom ? { dom } : {}),
      config: {},
    };

    if (element.customData?.embedSiyuan) data.config = element.customData.embedSiyuan.config;

    // Keep the DOM and Markdown only in the iframe; scenes store a small
    // SHA-256 fingerprint. Existing scenes are migrated on first load.
    const contentHash = CryptoJS.SHA256(data.blockId + "\0" + data.content + "\0" + (data.dom || "")).toString();
    const stored = element.customData?.embedSiyuan;
    if ((!stored || stored.blockId !== data.blockId ||
        stored.contentHash !== contentHash || "content" in stored || "dom" in stored) &&
        new URLSearchParams(location.search).get("snapshot") !== "1") {
      updateElementData(elementId, data, contentHash);
    }

    return data;
  }
  return null;
}

/**
 * 更新父页面的元素数据
 */
export function updateElementData(elementId: string, blockData: SiyuanBlockData, contentHash: string): void {
  const api = getParentExcalidrawAPI();
  if (!api) return;

  const elements = api.getSceneElements().map((element: any) => {
    if (element.id === elementId) {
      if (!element.customData) element.customData = {};
      element.customData.embedIframeVersionNonce = Date.now();
      element.customData.embedSiyuan = {
        blockId: blockData.blockId,
        contentHash,
        config: blockData.config,
      };
      element.version = element.version + 1;
      element.versionNonce = Math.floor(Math.random() * 10000);
      element.updated = Date.now();
    }
    return element;
  });
  api.updateScene({
    elements: elements,
  });
}

/**
 * 通过块 ID 获取思源内核的块 DOM。
 * 这比 Markdown 导出更接近思源原生外观；API 不可用时保留旧预览作为回退。
 */
async function fetchBlockDOM(blockId: string): Promise<string | null> {
  try {
    const response = await fetch('/api/block/getBlockDOM', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: blockId }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.code === 0 && typeof result.data?.dom === 'string' && result.data.dom.trim()
      ? result.data.dom : null;
  } catch (error) {
    console.warn('Native SiYuan block DOM unavailable, falling back to Markdown:', error);
    return null;
  }
}

/**
 * 从思源 API 获取块 Markdown 内容
 */
async function fetchBlockMarkdown(blockId: string): Promise<string | null> {
  try {
    const response = await fetch('/api/export/exportMdContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: blockId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.code === 0 && result.data) {
      return result.data.content;
    }
    console.error('Failed to fetch block markdown:', result.msg);
    return null;
  } catch (error) {
    console.error('Error fetching block markdown:', error);
    return null;
  }
}

function OptimizeMarkdown(markdown: string): string {
  // 去掉frontmatter
  const frontMatterRegex = /^---[\s\S]*?\n---\n?/;
  if (frontMatterRegex.test(markdown)) {
    markdown = markdown.replace(frontMatterRegex, '').trim();
  }
  // 去掉文件名标题
  if (markdown.startsWith('# ')) {
    markdown = markdown.replace(/^# [^\n]*\n?/, '').trim();
  }
  // 修复所有附件链接
  markdown = markdown.replace(/(\[.*?\])\(assets\/([^)]*)\)/g, '$1(/assets/$2)');
  return markdown;
}