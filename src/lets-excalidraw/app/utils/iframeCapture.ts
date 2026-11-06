import { snapdom } from '@zumer/snapdom';
import CryptoJS from 'crypto-js';

/**
 * 判断元素是否需要 iframe 捕获处理
 * 目前支持：思源块嵌入、Markdown 元素
 */
export function needsIframeCapture(element: any): boolean {
  // Markdown 元素
  if (element?.type === "embeddable" && element?.customData?.embedMarkdown) return true;

  // 思源块嵌入（通过 link 判断）
  if (element?.type === "embeddable" && element?.link?.startsWith('siyuan://blocks/')) return true;

  return false;
}

/**
 * 获取 iframe 元素
 */
export function getIframeForElement(element: any): HTMLIFrameElement | null {
  // Markdown 元素
  if (element?.customData?.embedMarkdown) {
    const src = `${new URL("../embed/markdown/", location.href).pathname}?elementId=${element.id}`;
    return document.querySelector(
      `iframe.excalidraw__embeddable[src*="${src}"]`
    ) as HTMLIFrameElement;
  }

  // 思源块嵌入（通过 link 中的 blockId 查找）
  if (element?.link?.startsWith('siyuan://blocks/')) {
    const blockId = element.link.split('siyuan://blocks/')[1];
    const src = `${new URL("../embed/siyuan/", location.href).pathname}?elementId=${element.id}&blockId=${blockId}`;
    return document.querySelector(
      `iframe.excalidraw__embeddable[src*="${src}"]`
    ) as HTMLIFrameElement;
  }

  return null;
}

/**
 * 捕获 iframe 并转换为 SVG 字符串
 */
/** The iframe load event fires before SiYuan's async block DOM fetch. */
async function waitForContent(iframe: HTMLIFrameElement): Promise<boolean> {
  for (let i = 0; i < 55; i++) {
    try {
      const doc = iframe.contentDocument;
      if (doc?.querySelector('#root .protyle-wysiwyg, #root .vditor-ir, #root .vditor-reset, #preview .vditor-reset')) {
        return true;
      }
    } catch { return false; }
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  return false;
}

/** Export embeds outside Excalidraw's visible/cached iframe region. */
function mountOffscreenFrame(element: any): HTMLIFrameElement | null {
  const isSiyuan = typeof element.link === 'string' && element.link.startsWith('siyuan://blocks/');
  const isMarkdown = Boolean(element.customData?.embedMarkdown);
  if (!isSiyuan && !isMarkdown) return null;
  const url = new URL(isSiyuan ? '../embed/siyuan/' : '../embed/markdown/', location.href);
  url.searchParams.set('elementId', element.id);
  if (isSiyuan) {
    const blockId = element.link.slice('siyuan://blocks/'.length);
    if (!/^\d{14}-[a-z0-9]{7}$/i.test(blockId)) return null;
    url.searchParams.set('blockId', blockId);
    // Offscreen export is read-only: it must never modify scene revision
    // while save() snapshots and checks for concurrent scene edits.
    url.searchParams.set('snapshot', '1');
  }
  const iframe = document.createElement('iframe');
  iframe.src = url.toString();
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = [
    'position:fixed', 'left:-100000px', 'top:0', 'border:0',
    'opacity:0', 'pointer-events:none',
    'width:' + Math.max(1, Math.ceil(element.width)) + 'px',
    'height:' + Math.max(1, Math.ceil(element.height)) + 'px',
  ].join(';');
  document.body.append(iframe);
  return iframe;
}

export async function captureIframe(
  iframe: HTMLIFrameElement
): Promise<string | null> {
  try {
    if (!await waitForContent(iframe) || !iframe.contentDocument?.body) {
      console.warn('[Excalidraw] Embedded iframe not ready for export', iframe.src);
      return null;
    }
    // An SVG containing <foreignObject> can render when loaded directly,
    // but loses its HTML text when embedded again as an <image> in the saved
    // Excalidraw SVG (and in some SVG-to-PNG export paths). Rasterize just
    // the embedded DOM once so both SVG and PNG canvas previews are reliable.
    const width = Math.max(1, iframe.clientWidth);
    const height = Math.max(1, iframe.clientHeight);
    const img = await snapdom.toPng(iframe.contentDocument.body, {
      width,
      height,
      scale: Math.min(2, 2048 / Math.max(width, height)),
      dpr: 1,
      embedFonts: true,
      backgroundColor: 'transparent',
      exclude: ['#button-container'],
    });
    return img.src;
  } catch (error) {
    console.error('Failed to capture iframe:', error);
    return null;
  }
}

/**
 * 为所有需要处理的元素捕获 iframe
 */
export type SnapshotCaptureStats = {
  total: number;
  reused: number;
  captured: number;
  failed: number;
  elapsedMs: number;
};

let snapshotStats: SnapshotCaptureStats = {total: 0, reused: 0, captured: 0, failed: 0, elapsedMs: 0};
export function getSnapshotCaptureStats(): SnapshotCaptureStats { return {...snapshotStats}; }

function snapshotSourceKey(element: any): string {
  // Match source link + content revision, not only geometry. An absent nonce
  // must be stable; never replace it with a random value on each save.
  const nonce = element.customData?.embedIframeVersionNonce ?? null;
  const storedHash = element.customData?.embedSiyuan?.contentHash || '';
  const markdown = element.customData?.embedMarkdown?.content || '';
  const mdHash = markdown && nonce === null ? CryptoJS.SHA256(markdown).toString() : '';
  return JSON.stringify([element.link || '', nonce, storedHash, mdHash]);
}

export async function captureAllIframes(
  elements: any[],
  iframeCacheMap: Map<string, IframeCache>,
): Promise<Map<string, IframeCache>> {
  const started = performance.now();
  const elementsToCapture = elements.filter(needsIframeCapture);
  const next = new Map<string, IframeCache>();
  const stats: SnapshotCaptureStats = {total: elementsToCapture.length, reused: 0, captured: 0, failed: 0, elapsedMs: 0};
  try {
    // Sequential SnapDOM rasterization bounds memory at sixty+ blocks.
    for (const element of elementsToCapture) {
      const previous = iframeCacheMap.get(element.id);
      const key = snapshotSourceKey(element);
      if (previous?.dataURL && previous.sourceKey === key &&
          previous.width === element.width && previous.height === element.height) {
        next.set(element.id, previous);
        stats.reused++;
        continue;
      }
      const cache: IframeCache = {
        dataURL: previous?.dataURL || null,
        sourceKey: key,
        embedIframeVersionNonce: element.customData?.embedIframeVersionNonce ?? null,
        width: element.width,
        height: element.height,
      };
      const mounted = getIframeForElement(element);
      const iframe = mounted || mountOffscreenFrame(element);
      if (!iframe) {
        stats.failed++;
        if (!cache.dataURL) throw new Error('无法加载嵌入块 ' + element.id + '，预览未保存');
        next.set(element.id, previous!);
        continue;
      }
      try {
        const capture = await captureIframe(iframe);
        if (!capture) {
          stats.failed++;
          if (!cache.dataURL) throw new Error('思源块 ' + element.id + ' 尚未渲染完成，保存已取消以避免空白预览');
          // Keep the old key so we retry instead of treating fallback as fresh.
          next.set(element.id, previous!);
          continue;
        }
        cache.dataURL = capture;
        next.set(element.id, cache);
        stats.captured++;
      } finally {
        if (!mounted) iframe.remove();
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return next;
  } finally {
    stats.elapsedMs = Math.round(performance.now() - started);
    snapshotStats = stats;
    console.info('[dodo-excalidraw] snapshot capture', stats);
  }
}
/**
 * 创建 Excalidraw 文件对象
 */
export function createImageFile(
  elementId: string,
  dataURL: string
): { fileId: string; file: any } {
  const fileId = `file-${elementId}-${Date.now()}`;

  return {
    fileId,
    file: {
      id: fileId,
      dataURL,
      mimeType: dataURL.startsWith('data:image/png') ? 'image/png' : 'image/svg+xml',
      created: Date.now(),
    },
  };
}

/**
 * 替换元素中的 iframe 为图像
 * 每个 embeddable 元素会被替换成：矩形背景 + SVG 图像
 */
export function replaceIframesWithImages(
  elements: any[],
  iframeCacheMap: Map<string, IframeCache>,
  files: any
): { elements: any[]; files: any } {
  const newFiles: any = {};

  // 使用 flatMap 将每个元素映射为 1 个或 2 个元素
  const processedElements = elements.flatMap((element) => {
    const cache = iframeCacheMap.get(element.id);
    if (!(cache?.dataURL)) {
      return [element]; // 没有捕获到 iframe，保持原样
    }

    const { fileId, file } = createImageFile(element.id, cache.dataURL);
    newFiles[fileId] = file;

    // 返回两个元素：矩形背景 + SVG 图像
    return [
      {
        // 矩形背景元素
        id: `${element.id}-rect`,
        type: 'rectangle',
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: element.angle,
        strokeColor: element.strokeColor,
        backgroundColor: element.backgroundColor,
        fillStyle: element.fillStyle,
        strokeWidth: element.strokeWidth,
        strokeStyle: element.strokeStyle,
        roundness: element.roundness,
        opacity: element.opacity,
        groupIds: element.groupIds,
        frameId: element.frameId,
      },
      {
        // SVG 图像元素
        id: `${element.id}-image`,
        type: 'image',
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: element.angle,
        fileId: fileId,
        opacity: element.opacity,
        groupIds: element.groupIds,
        frameId: element.frameId,
        roundness: element.roundness,
      },
    ];
  });

  return { elements: processedElements, files: { ...files, ...newFiles } };
}

export function computeHash(str: string): string {
  const hashHex = CryptoJS.SHA256(str).toString();
  return hashHex;
}

const CACHE_VERSION = 1;
export async function putIframeCacheMap(imageURL: string, iframeCacheMap: Map<string, IframeCache>) {
  const imageHash = computeHash(imageURL);
  const cacheData = {
    cacheVersion: CACHE_VERSION,
    imageURL: imageURL,
    iframeCacheData: Object.fromEntries(iframeCacheMap),
  }
  const iframeCacheData = JSON.stringify(cacheData);
  const file = new File([iframeCacheData], `cache-${imageHash}.json`, { type: 'application/json' });
  const formData = new FormData();
  formData.append('path', `/temp/siyuan-dodo/excalidraw/cache/cache-${imageHash}.json`);
  formData.append('file', file);
  formData.append('isDir', 'false');
  await fetch('/api/file/putFile', {
    method: 'POST',
    body: formData,
  });
}

export async function getIframeCacheMap(imageURL: string): Promise<Map<string, IframeCache>> {
  const imageHash = computeHash(imageURL);
  const response = await fetch('/api/file/getFile', {
    method: 'POST',
    body: JSON.stringify({
      path: `/temp/siyuan-dodo/excalidraw/cache/cache-${imageHash}.json`,
    }),
  });
  if (response.ok && response.status === 200) {
    const iframeCacheData = await response.json();
    if (iframeCacheData.cacheVersion === CACHE_VERSION && iframeCacheData.iframeCacheData) {
      return new Map<string, IframeCache>(Object.entries(iframeCacheData.iframeCacheData));
    }
  }
  return new Map<string, IframeCache>();
}