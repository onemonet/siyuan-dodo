import { debounce } from 'lodash';
import CryptoJS from 'crypto-js';
import { createRoot } from 'react-dom/client';
import React from 'react';
import {
  Excalidraw,
  loadFromBlob,
  getCommonBounds,
  serializeAsJSON,
  parseLibraryTokensFromUrl,
  loadLibraryFromBlob,
  mergeLibraryItems,
  serializeLibraryAsJSON,
  MainMenu,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw';
import { exportToSvg, exportToBlob } from "./excalidraw-export";
import '@excalidraw/excalidraw/index.css';
import './app.scss';
import {
  addStyle,
  locatePNGtEXt,
  HTMLToElement,
  blobToArray,
  blobToDataURL,
  base64ToUnicode,
  replaceSubArray,
  base64ToArray,
  getSVGSize,
  getPNGSize,
} from '../utils';
import { isMac, matchHotKey, updateHotkeyTip } from '../utils/hotkey';
import defaultImageContent from "../default.json";
import { nanoid } from "nanoid";
import { handleAgentCanvasCommand, repairCanvasBindings } from "./canvas";
import { addAgentImage, mermaidAgentElements } from "./agent-advanced";
import { ToolbarHost } from "./toolbar/ToolbarHost";
import { browserPreferenceFactory } from "./toolbar/browser-preference-client";
import { browserEditorUrl } from "../browser-editor-url";
import {
  captureAllIframes,
  getSnapshotCaptureStats,
  getIframeCacheMap,
  needsIframeCapture,
  putIframeCacheMap,
  replaceIframesWithImages,
} from './utils/iframeCapture';

addStyle("/stage/protyle/js/katex/katex.min.css", "protyleKatexStyle");

window.EXCALIDRAW_ASSET_PATH = new URL("./", location.href).href;
window.EXCALIDRAW_LIBRARY_PATH = `/data/storage/petal/${new URL(location.href).pathname.split("/")[2]}/excalidraw-library.excalidrawlib`;
const urlParams = new URLSearchParams(window.location.search);
const langCode = urlParams.get('lang') || 'en';
const enableAutoSave = urlParams.get('enableAutoSave') === 'true';
const autoSaveInterval = Math.max(parseFloat(urlParams.get('autoSaveInterval') || '0') * 1000, 300);
const fullSaveDelay = Math.max(parseFloat(urlParams.get('fullSaveDelay') || '0') * 1000, 300);
let saveStatus = {
  fullSave: true,
  saving: false,
};
const saveTimeout = 10_000;
let mimeType = 'image/svg+xml';
let imageURL = '';
const exportPadding = 10;
let savedSvg: HTMLElement | null = null;
let savedPngBinaryArray: Uint8Array | null = null;
let defaultSvg: HTMLElement | null = null;
let defaultPngBinaryArray: Uint8Array | null = null;
let iframeCacheMap = new Map<string, IframeCache>();
let enhancementRoot: ReturnType<typeof createRoot> | null = null;
const mountEnhancements = (api: any) => {
  if (enhancementRoot) return;
  const container = document.createElement("div");
  container.id = "dodo-excalidraw-enhancements";
  document.body.append(container);
  enhancementRoot = createRoot(container);
  enhancementRoot.render(<ToolbarHost api={api} createPreferenceClient={window.parent === window ? browserPreferenceFactory : undefined}/>);
};
window.addEventListener("pagehide", () => { enhancementRoot?.unmount(); enhancementRoot = null; document.getElementById("dodo-excalidraw-enhancements")?.remove(); });

// Native tab/window close cannot await a save. Keep unsaved scenes for reopening.
const recoveryKey = () => `dodo-excalidraw-recovery:${urlParams.get("imageURL")}`;
const sceneRevision = (elements: readonly any[]) => elements.map(element => `${element.id}:${element.version}:${element.versionNonce}`).join("|");
let persistedRevision = "";
const markSaved = (revision: string) => {
  persistedRevision = revision;
  localStorage.removeItem(recoveryKey());
};
const preserveRecovery = () => {
  const api = window.excalidrawAPI;
  if (!api || sceneRevision(api.getSceneElements()) === persistedRevision) return;
  localStorage.setItem(recoveryKey(), serializeAsJSON(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(), "local"));
};
window.addEventListener("pagehide", preserveRecovery);
window.addEventListener("beforeunload", (event) => {
  try { preserveRecovery(); }
  catch { event.preventDefault(); event.returnValue = ""; }
});

const postMessage = (message: any) => {
  if (window.parent !== window) window.parent.postMessage(JSON.stringify(message), location.origin);
};

const getEmbeddableLink = (element: any): string => {
  if (element?.type !== 'embeddable') return '';

  const link = element?.link || '';

  // 处理 Markdown 链接 (通过检查 customData.embedMarkdown 是否存在)
  if (element?.customData?.embedMarkdown) {
    return `${new URL("../embed/markdown/", location.href).pathname}?elementId=${element.id}`;
  }

  // 处理思源块链接
  if (link?.startsWith('siyuan://blocks/')) {
    const blockId = link.split('siyuan://blocks/')[1];
    return `${new URL("../embed/siyuan/", location.href).pathname}?elementId=${element.id}&blockId=${blockId}`;
  }

  return link;
}

/**
 * SiYuan block previews stay non-interactive so Excalidraw retains regular
 * selection/drag/resize behaviour. Only the two hover actions accept pointer
 * events; no intermediate "click to interact" activation is required.
 */
const signalSiyuanBlock = (elementId: string, action: 'edit' | 'refresh'): void => {
  const iframe = [...document.querySelectorAll<HTMLIFrameElement>('.dodo-siyuan-embed iframe')]
    .find(node => {
      try {
        const url = new URL(node.src, location.href);
        return url.searchParams.get('elementId') === elementId
          && url.pathname.includes('/excalidraw/embed/siyuan/');
      } catch { return false; }
    });
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({
    event: action === 'edit' ? 'dodoSiyuanRequestEdit' : 'dodoSiyuanRequestRefresh',
    elementId,
  }), location.origin);
};

/** Hit-test the transformed preview rectangle, not Excalidraw's center-third hover hint. */
const setupSiyuanBlockHover = () => {
  const findAt = (x: number, y: number): HTMLElement | undefined =>
    [...document.querySelectorAll<HTMLElement>('.dodo-siyuan-embed')].reverse().find(wrapper => {
      const rect = wrapper.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });

  // Keep scrolling long SiYuan previews without activating the embedded
  // iframe; normal Excalidraw wheel/zoom behaviour remains elsewhere.
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const wrapper = findAt(event.clientX, event.clientY);
    const iframe = wrapper?.querySelector<HTMLIFrameElement>('iframe');
    let scroller: HTMLElement | null = null;
    try {
      scroller = iframe?.contentDocument?.querySelector<HTMLElement>('.protyle-content, #preview') || null;
    } catch { return; }
    if (!scroller) return;
    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 :
      event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? Math.max(1, scroller.clientHeight) : 1;
    const dy = event.deltaY * multiplier;
    const dx = event.deltaX * multiplier;
    const maxY = scroller.scrollHeight - scroller.clientHeight;
    const maxX = scroller.scrollWidth - scroller.clientWidth;
    const nextY = Math.max(0, Math.min(maxY, scroller.scrollTop + dy));
    const nextX = Math.max(0, Math.min(maxX, scroller.scrollLeft + dx));
    if (nextY === scroller.scrollTop && nextX === scroller.scrollLeft) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    scroller.scrollTo({ top: nextY, left: nextX, behavior: 'instant' });
  };

  // Preserve double-click-to-edit after removing pointer events from the
  // iframe; do not interfere with ordinary canvas double-clicks or menus.
  const onDoubleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.excalidraw') ||
        target.closest('button, input, textarea, [contenteditable="true"]')) return;
    const wrapper = findAt(event.clientX, event.clientY);
    if (!wrapper?.dataset.elementId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    signalSiyuanBlock(wrapper.dataset.elementId, 'edit');
  };

  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  document.addEventListener('dblclick', onDoubleClick, true);
  return () => {
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('dblclick', onDoubleClick, true);
  };
};
const disposeSiyuanBlockHover = setupSiyuanBlockHover();
window.addEventListener('pagehide', disposeSiyuanBlockHover);

const renderEmbeddable = (element: any, _appState: any): React.JSX.Element | null => {
  const src = getEmbeddableLink(element);
  if (!src) return null;

  const iframe = (
    <iframe
      className="excalidraw__embeddable"
      src={src}
      referrerPolicy="no-referrer-when-downgrade"
      title="Excalidraw Embedded Content"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen={true}
      style={needsIframeCapture(element) ? {filter: 'var(--theme-filter)'} : {}}
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"
    />
  );
  const isSiyuanBlock = element.link?.startsWith('siyuan://blocks/');
  if (!isSiyuanBlock) return iframe;

  return (
    <div className="dodo-siyuan-embed" data-element-id={element.id}
      style={element.fillStyle === 'solid' && element.backgroundColor && element.backgroundColor !== 'transparent'
        ? { backgroundColor: element.backgroundColor }
        : undefined}>
      {iframe}
    </div>
  );

}

window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  let data: {event?:string;elementId?:string};
  try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
  catch { return; }
  if (data?.event !== "dodoSiyuanEditLink" || !data.elementId) return;
  // Host Protyle editor closed. Show the same native URL input used for
  // empty Web-Embeds, rather than a separate SiYuan link editor.
  if (!window.excalidrawAPI?.getSceneElements().some((item: any) =>
    item.id === data.elementId && item.type === "embeddable" &&
    item.link?.startsWith("siyuan://blocks/"))) return;
  window.excalidrawAPI.updateScene({
    appState: {
      selectedElementIds: { [data.elementId]: true },
      showHyperlinkPopup: "editor",
    },
  });
});

const fixSvgContent = (svg: HTMLElement): HTMLElement => {
  // 当图像为空时，使用默认的占位图
  const imageSize = getSVGSize(svg);
  if (imageSize && imageSize.width <= 20 && imageSize.height <= 20) {
    svg = defaultSvg as HTMLElement;
  }
  return svg;
}

const fixPngContent = (pngBinaryArray: Uint8Array): Uint8Array => {
  const imageSize = getPNGSize(pngBinaryArray);
  if (imageSize && imageSize.width <= 20 && imageSize.height <= 20) {
    pngBinaryArray = defaultPngBinaryArray as Uint8Array;
  }
  return pngBinaryArray;
}

const triggleToast = (messageType: 'saving' | 'savedone' | 'savetimeout' | 'savecancel') => {
  if (!window.excalidrawAPI) return;
  let message = '';
  let duration = 1000;
  if (messageType == 'savedone') {
    message = langCode.startsWith('zh') ? '保存成功' : 'Saved';
    duration = 2000;
  } else if (messageType == 'savetimeout') {
    message = langCode.startsWith('zh') ? '保存超时' : 'Save timeout';
    duration = 2000;
  } else if (messageType == 'savecancel') {
    message = langCode.startsWith('zh') ? '保存取消' : 'Save canceled';
  } else if (messageType == 'saving') {
    message = langCode.startsWith('zh') ? '保存中...' : 'Saving...';
    duration = Infinity;
  }
  window.excalidrawAPI.setToast(null);
  window.excalidrawAPI.setToast({
    message: message,
    closable: false,
    duration: duration,
  });
}

const renderImageContentWithOnlyMetadata = async (): Promise<Blob> => {
  const elements = window.excalidrawAPI.getSceneElements();
  const files = window.excalidrawAPI.getFiles();
  const appState = window.excalidrawAPI.getAppState();

  let blob: Blob | null = null;

  if (mimeType === 'image/svg+xml') {
    // ===== SVG 分支 =====

    // a. 导出原始 SVG（包含完整 iframe 渲染）
    const originalSvg = await exportToSvg({
      elements: elements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: files,
      renderEmbeddables: false,
    });

    // b. 替换 metadata
    if (savedSvg) {
      const originalMetadata = originalSvg.querySelector('metadata')?.innerHTML;
      const savedMetadataEl = savedSvg.querySelector('metadata');
      if (savedMetadataEl && originalMetadata) {
        savedMetadataEl.innerHTML = originalMetadata;
      }
    } else {
      savedSvg = originalSvg;
    }

    savedSvg = fixSvgContent(savedSvg as HTMLElement);

    // c. 转换为 dataURL
    blob = new Blob([savedSvg!.outerHTML], { type: 'image/svg+xml' });
  } else {
    // ===== PNG 分支 =====

    // a. 导出原始 PNG（包含完整 iframe 渲染）
    const originalPngBlob = await exportToBlob({
      elements: elements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: files,
      mimeType: 'image/png',
      exportPadding: exportPadding,
    });
    const originalBinaryArray = await blobToArray(originalPngBlob);

    if (savedPngBinaryArray) {
      // 从原始 PNG 中提取 tEXt 块
      const originLocation = locatePNGtEXt(originalBinaryArray);
      const savedLocation = locatePNGtEXt(savedPngBinaryArray);
      if (originLocation && savedLocation) {
        // 插入 tEXt 块到处理后 PNG
        savedPngBinaryArray = replaceSubArray(
          originalBinaryArray,
          originLocation,
          savedPngBinaryArray,
          savedLocation,
        );
      } else {
        savedPngBinaryArray = originalBinaryArray;
      }
    } else {
      savedPngBinaryArray = originalBinaryArray;
    }

    savedPngBinaryArray = fixPngContent(savedPngBinaryArray);
    blob = new Blob([savedPngBinaryArray as any], { type: "image/png" });
  }

  return blob;
}

const renderImageContentWithMetadataAndImage = async (): Promise<Blob> => {
  let elements = window.excalidrawAPI.getSceneElements();
  const files = window.excalidrawAPI.getFiles();
  const appState = window.excalidrawAPI.getAppState();

  // Only persist the snapshot cache when content/size/source changes.
  // Earlier versions re-uploaded the entire base64 cache on EVERY full save.
  const captureStarted = performance.now();
  const previousCache = iframeCacheMap;
  iframeCacheMap = await captureAllIframes(elements, previousCache);
  const snapshotMetrics = getSnapshotCaptureStats();
  const cacheDirty = snapshotMetrics.captured > 0 ||
    previousCache.size !== iframeCacheMap.size ||
    [...iframeCacheMap].some(([key, val]) => previousCache.get(key) !== val);
  if (cacheDirty) {
    await putIframeCacheMap(imageURL, iframeCacheMap);
  }
  const capturesMs = Math.round(performance.now() - captureStarted);
  const composeStarted = performance.now();
  const { elements: processedElements, files: processedFiles } = replaceIframesWithImages(elements, iframeCacheMap, files);
  console.info('[dodo-excalidraw] embed snapshots', {
    ...snapshotMetrics, cacheWritten: cacheDirty, snapshotsMs: capturesMs,
    transformedMs: Math.round(performance.now() - composeStarted),
  });

  // ========== 第二步：根据 mimeType 选择分支处理 ==========
  const imageExportStarted = performance.now();
  let blob: Blob | null = null;

  if (mimeType === 'image/svg+xml') {
    // ===== SVG 分支 =====

    // a. 导出原始 SVG（包含完整 iframe 渲染）
    const originalSvg = await exportToSvg({
      elements: elements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: files,
      renderEmbeddables: false,
    });

    // b. 导出处理后 SVG（iframe 已替换为图像）
    let processedSvg = await exportToSvg({
      elements: processedElements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: processedFiles,
      renderEmbeddables: false,
    });

    // c. 替换 metadata
    const originalMetadata = originalSvg.querySelector('metadata')?.innerHTML;
    const processedMetadataEl = processedSvg.querySelector('metadata');
    if (!processedMetadataEl || !originalMetadata) {
      throw new Error('SVG 导出缺少原始画布元数据，已取消保存以避免丢失可编辑的块引用');
    }
    processedMetadataEl.innerHTML = originalMetadata;

    processedSvg = fixSvgContent(processedSvg);

    // 保存最后一次渲染的图像数据
    savedSvg = processedSvg;

    // d. 转换为 blob
    blob = new Blob([processedSvg.outerHTML], { type: 'image/svg+xml' });
  } else {
    // ===== PNG 分支 =====

    // a. 导出原始 PNG（包含完整 iframe 渲染）
    const originalPngBlob = await exportToBlob({
      elements: elements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: files,
      mimeType: 'image/png',
      exportPadding: exportPadding,
    });
    const originalBinaryArray = await blobToArray(originalPngBlob);

    // b. 导出处理后 PNG（iframe 已替换为图像）
    const processedPngBlob = await exportToBlob({
      elements: processedElements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: processedFiles,
      mimeType: 'image/png',
      exportPadding: exportPadding,
    });
    let processedBinaryArray = await blobToArray(processedPngBlob);

    // c. 从 PNG 中提取 tEXt 块
    const originLocation = locatePNGtEXt(originalBinaryArray);
    const processedLocation = locatePNGtEXt(processedBinaryArray);
    if (originLocation && processedLocation) {
      // d. 替换 tEXt 块到处理后 PNG
      processedBinaryArray = replaceSubArray(
        originalBinaryArray,
        originLocation,
        processedBinaryArray,
        processedLocation,
      );
    } else {
      // Previously this silently replaced the newly-rendered PNG with the
      // old iframe-less image, producing a blank preview while claiming save
      // succeeded. Preserve both scene and appearance or fail explicitly.
      throw new Error('PNG 导出缺少场景元数据，已取消保存以避免空白预览或丢失块引用');
    }

    processedBinaryArray = fixPngContent(processedBinaryArray);

    // 保存最后一次渲染的图像数据
    savedPngBinaryArray = processedBinaryArray;

    blob = new Blob([processedBinaryArray as any], { type: 'image/png' });
  }

  console.info('[dodo-excalidraw] full preview export', {
    format: mimeType, ms: Math.round(performance.now() - imageExportStarted),
    sizeBytes: blob?.size || 0,
  });
  return blob;
}

const setSavingBegin = (): boolean => {
  if (saveStatus.saving) return false;
  saveStatus.saving = true;
  return true;
}

const setSavingEnd = () => {
  saveStatus.saving = false;
}

const save = async (eventName: 'save' | 'autosave', agent = false) => {
  const api = window.excalidrawAPI;
  // Parent/plugin-issued explicit saves may arrive while focus is on the
  // SiYuan host, not on the embedded Excalidraw iframe. Only defer unattended
  // autosaves when the canvas is not focused.
  if (!api || (eventName === 'autosave' && !agent && !document.hasFocus())) return { saved: false };
  if (!setSavingBegin()) {
    if (agent) throw new Error('画布正在保存，请稍后重试。');
    return { saved: false };
  }
  const revision = () => api.getSceneElements().map((element: any) => `${element.id}:${element.version}:${element.versionNonce}`).join('|');
  const before = revision();
  // Explicit saves MUST refresh the visible preview regardless of focus.
  // renderImageContentWithOnlyMetadata() preserves the existing picture and
  // is appropriate only for background autosave, never a user/agent save.
  const fullPreview = eventName === 'save';
  const startedAt = performance.now();
  try {
    if (eventName === 'save') triggleToast('saving');
    const renderStartedAt = performance.now();
    // Background saves retain the last static image and update editable data.
    const blob = fullPreview ? await renderImageContentWithMetadataAndImage() : await renderImageContentWithOnlyMetadata();
    const renderMs = Math.round(performance.now() - renderStartedAt);
    if (revision() !== before) throw new Error('渲染期间画布已变化，请重新保存。');

    const formData = new FormData();
    formData.append('path', 'data/' + imageURL);
    formData.append('file', new File([blob], imageURL.split('/').pop()!, { type: blob.type }));
    formData.append('isDir', 'false');
    const response = await fetch('/api/file/putFile', { method: 'POST', body: formData, signal: AbortSignal.timeout(saveTimeout) });
    if (!response.ok) throw new Error(`保存失败：HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 0) throw new Error(result.msg || '思源未确认文件保存成功。');
    postMessage({ event: eventName, imageURL });
    if (revision() !== before) throw new Error('文件已写入，但画布随后有新修改，请再次保存。');
    markSaved(before);
    if (fullPreview) saveStatus.fullSave = true;
    if (eventName === 'save') triggleToast('savedone');
    console.info('[dodo-excalidraw] save completed', {
      type: eventName, elements: api.getSceneElements().length,
      renderMs, uploadMs: Math.round(performance.now() - renderStartedAt - renderMs),
      totalMs: Math.round(performance.now() - startedAt),
      bytes: blob.size,
    });
    return { saved: true, previewUpdated: fullPreview, canvasId: imageURL };
  } catch (error) {
    saveStatus.fullSave = false;
    api.setToast({ message: error instanceof Error ? error.message : String(error) });
    if (agent) throw error;
    return { saved: false };
  } finally {
    setSavingEnd();
  }
}

const openLink = (element: any, event: CustomEvent<{ nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement>; }>) => {
  event.preventDefault();

  if (!element.link) return;

  const match = element.link.match(/^(element|group)=([^&?#\s]+)$/i);
  if (match) {
    const linktype = match[1].toLowerCase() as 'element' | 'group';
    const value = match[2];

    const sceneElements = window.excalidrawAPI.getSceneElements();
    const targets = sceneElements.filter((element: any) => {
      if (linktype === 'element') {
        return element.id === value;
      } else {
        return element.groupIds?.includes(value);
      }
    });
    if (targets.length > 0) {
      window.excalidrawAPI.scrollToContent(targets, {
        animate: true,
      });
    }
  }
  else {
    window.open(element.link, '_blank');
  }
}

const App = (props: { initialData: any }) => {
  let lastAutoSaveTime = 0;
  const debouncedAutoSave = debounce(() => {
    let currentTime = Date.now();
    if (!saveStatus.saving && currentTime - lastAutoSaveTime > autoSaveInterval) {
      lastAutoSaveTime = currentTime;
      save("autosave");
      lastAutoSaveTime = Date.now();
    }
  }, 300);

  // 一段时间没有修改才完整保存
  let fullSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (fullSaveTimer) clearTimeout(fullSaveTimer);
    const count = window.excalidrawAPI?.getSceneElements().filter(needsIframeCapture).length || 0;
    // Large scenes should not repeatedly rasterize a minute's worth of
    // embeds during short editing pauses. Fast autosaves still run normally.
    const delay = count >= 20 ? Math.max(fullSaveDelay, 20_000) : fullSaveDelay;
    fullSaveTimer = setTimeout(() => {
      fullSaveTimer = null;
      if (!saveStatus.fullSave && !saveStatus.saving &&
          !window.excalidrawAPI.getAppState().activeEmbeddable) {
        void save("save");
      }
    }, delay);
  };

  let changeInitStatus = true;
  let lastVersionNonceSum = 0;
  const handleChange = async (_elements: readonly any[], _state: any) => {
    const selectedIds = Object.keys(_state?.selectedElementIds || {})
      .filter(id => _state.selectedElementIds[id]);
    const selectedSiyuan = selectedIds.length === 1 && _elements.some((el: any) =>
      el.id === selectedIds[0] && el.type === "embeddable" &&
      el.link?.startsWith("siyuan://blocks/"));
    const selectedEmptyEmbed = selectedIds.length === 1 && _elements.some((el: any) =>
      el.id === selectedIds[0] && el.type === "embeddable" &&
      !String(el.link || "").trim() && !el.customData?.embedMarkdown);
    const canvasRoot = document.querySelector(".excalidraw");
    canvasRoot?.classList.toggle("dodo-siyuan-link-selected",
      selectedSiyuan && _state?.showHyperlinkPopup !== "editor");
    // Blank Web-Embeds have no useful link to show. Suppress the automatic
    // "未设定链接" info bar, but preserve the native editor when explicitly
    // opened (Ctrl+K, context menu, etc.), including @ block search.
    canvasRoot?.classList.toggle(
      "dodo-empty-embed-link-info",
      selectedEmptyEmbed && _state?.showHyperlinkPopup !== "editor"
    );
    // Excalidraw activates web embeds on a center click. SiYuan previews no
    // longer need that mode: clear it immediately so focus and save shortcuts
    // are not blocked by the obsolete intermediate interaction state.
    const active = _state?.activeEmbeddable;
    if (active?.element?.link?.startsWith('siyuan://blocks/')) {
      queueMicrotask(() => {
        const api = window.excalidrawAPI;
        const current = api?.getAppState()?.activeEmbeddable;
        if (current?.element?.link?.startsWith('siyuan://blocks/')) {
          api.updateScene({ appState: { activeEmbeddable: null } });
        }
      });
    }
    if (changeInitStatus) {
      // 忽略初始化导致的第一次变化
      changeInitStatus = false;
      return;
    }
    if (!window.excalidrawAPI) return;

    const versionNonceSum = window.excalidrawAPI.getSceneElements().reduce((sum: number, element: any) => sum + element.versionNonce, 0);
    if (versionNonceSum !== lastVersionNonceSum) {
      lastVersionNonceSum = versionNonceSum;
      saveStatus.fullSave = false;

      // 只有启用自动保存时才执行防抖保存
      if (enableAutoSave) {
        debouncedAutoSave();
        debouncedSave();
      }
    }
  };

  const handlePaste = (): boolean => {
    return true;
  }

  let libraryChangeInitStatus = true;
  const handleLibraryChange = async (libraryItems: any) => {
    if (libraryChangeInitStatus) {
      // 忽略初始化导致的第一次变化
      libraryChangeInitStatus = false;
      return;
    }
    await saveLibrary(libraryItems);
  };

  const setExcalidrawAPI = (api: any | null) => {
    // Excalidraw next calls onExcalidrawAPI(null) when the editor unmounts.
    // Never mount the enhancement toolbar against a destroyed editor API.
    if (!api) {
      window.excalidrawAPI = null;
      enhancementRoot?.unmount();
      enhancementRoot = null;
      document.getElementById("dodo-excalidraw-enhancements")?.remove();
      return;
    }
    window.excalidrawAPI = api;
    mountEnhancements(api);

    // 通知已准备好
    postMessage({ event: 'ready' });
    if (localStorage.getItem(recoveryKey())) api.setToast({ message: '已恢复上次关闭时未保存的画布，请保存以写回附件。', duration: 8000 });
  };

  return (
    <Excalidraw
      initialData={props.initialData}
      langCode={langCode}
      onChange={handleChange}
      onPaste={handlePaste}
      onLibraryChange={handleLibraryChange}
      onExcalidrawAPI={setExcalidrawAPI}
      validateEmbeddable={true}
      renderEmbeddable={renderEmbeddable}
      generateLinkForSelection={(id: string, type: "element" | "group") => { return `${type}=${id}`; }}
      onLinkOpen={openLink}
      UIOptions={{
        canvasActions: {
          loadScene: true,
          saveToActiveFile: false,
        },
      }}
    >
      <MainMenu>
        <MainMenu.Item
          icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5651" width="32" height="32"><path d="M921.6 450.133333c-6.4-8.533333-14.933333-12.8-25.6-12.8h-10.666667V341.333333c0-40.533333-34.133333-74.666667-74.666666-74.666666H514.133333c-4.266667 0-6.4-2.133333-8.533333-4.266667l-38.4-66.133333c-12.8-21.333333-38.4-36.266667-64-36.266667H170.666667c-40.533333 0-74.666667 34.133333-74.666667 74.666667v597.333333c0 6.4 2.133333 12.8 6.4 19.2 6.4 8.533333 14.933333 12.8 25.6 12.8h640c12.8 0 25.6-8.533333 29.866667-21.333333l128-362.666667c4.266667-10.666667 2.133333-21.333333-4.266667-29.866667zM170.666667 224h232.533333c4.266667 0 6.4 2.133333 8.533333 4.266667l38.4 66.133333c12.8 21.333333 38.4 36.266667 64 36.266667H810.666667c6.4 0 10.666667 4.266667 10.666666 10.666666v96H256c-12.8 0-25.6 8.533333-29.866667 21.333334l-66.133333 185.6V234.666667c0-6.4 4.266667-10.666667 10.666667-10.666667z m573.866666 576H172.8l104.533333-298.666667h571.733334l-104.533334 298.666667z" fill="#666666" p-id="5652"></path></svg>}
          onSelect={() => { document.querySelector("#root .excalidraw")?.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'keyO', ctrlKey: !isMac(), metaKey: isMac(), bubbles: true, cancelable: true })) }}
        >{langCode.startsWith('zh') ? '打开' : 'Open'}
        </MainMenu.Item>
        <MainMenu.Item
          icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7082" width="32" height="32"><path d="M928 896V314.24c0-8.32-3.488-16.64-9.6-22.72l-187.84-186.24a31.36 31.36 0 0 0-22.4-9.28H672v160c0 52.8-43.2 96-96 96H256c-52.8 0-96-43.2-96-96V96H128c-17.6 0-32 14.4-32 32v768c0 17.6 14.4 32 32 32h64v-288c0-52.8 43.2-96 96-96h448c52.8 0 96 43.2 96 96v288h64c17.632 0 32-14.4 32-32z m-160 32v-288c0-17.6-14.368-32-32-32H288c-17.6 0-32 14.4-32 32v288h512zM224 96v160c0 17.6 14.4 32 32 32h320c17.632 0 32-14.4 32-32V96H224z m739.52 150.08c18.272 17.92 28.48 42.88 28.48 68.16V896c0 52.8-43.2 96-96 96H128c-52.8 0-96-43.2-96-96V128c0-52.8 43.2-96 96-96h580.16c25.632 0 49.632 9.92 67.52 27.84l187.84 186.24zM512 256a32 32 0 0 1-32-32V160a32 32 0 0 1 64 0v64a32 32 0 0 1-32 32z" fill="#404853" p-id="7083"></path></svg>}
          onSelect={() => { save("save"); }}
          shortcut={updateHotkeyTip('⌘S')}
        >{langCode.startsWith('zh') ? '保存' : 'Save'}
        </MainMenu.Item>
        <MainMenu.Item onSelect={() => {
          const pluginName = location.pathname.split("/")[2];
          const link = browserEditorUrl(imageURL, pluginName, location.href, {
            dodoBuild: urlParams.get("dodoBuild") || undefined,
            lang: langCode,
            dark: urlParams.get("dark") || 0,
            enableAutoSave,
            autoSaveInterval: urlParams.get("autoSaveInterval") || 0,
            fullSaveDelay: urlParams.get("fullSaveDelay") || 5,
          });
          window.open(link, "_blank", "noopener,noreferrer");
        }}>{langCode.startsWith("zh") ? "在浏览器中打开" : "Open in browser"}</MainMenu.Item>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.Item onSelect={() => window.dispatchEvent(new Event("dodo-enhancement-settings"))}>画布增强设置</MainMenu.Item>
        <MainMenu.Item
          icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5086" width="32" height="32"><path d="M768 640 768 512 448 512 448 384 768 384 768 256 960 448ZM704 576 704 832 384 832 384 1024 0 832 0 0 704 0 704 320 640 320 640 64 128 64 384 192 384 768 640 768 640 576Z" fill="#000000" p-id="5087"></path></svg>}
          onSelect={() => { postMessage({ event: 'exit' }); }}
        >{langCode.startsWith('zh') ? '退出' : 'Exit'}
        </MainMenu.Item>
        {
          urlParams.get('fullscreenBtn') == '1' &&
          <MainMenu.Item
            icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6075" width="32" height="32"><path d="M692.705882 24.094118h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235294h-240.941177c-36.141176 0-60.235294-24.094118-60.235294-60.235294s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6076"></path><path d="M933.647059 24.094118c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235294s-60.235294-24.094118-60.235294-60.235294v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6077"></path><path d="M915.576471 96.376471c18.070588 24.094118 18.070588 60.235294 0 84.329411l-246.964706 246.964706c-24.094118 24.094118-60.235294 24.094118-84.329412 0-24.094118-24.094118-24.094118-60.235294 0-84.329412l246.964706-246.964705c24.094118-18.070588 60.235294-18.070588 84.329412 0zM90.352941 867.388235h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235295H90.352941c-36.141176 0-60.235294-24.094118-60.235294-60.235295s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6078"></path><path d="M90.352941 626.447059c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235295s-60.235294-24.094118-60.235294-60.235295v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6079"></path><path d="M102.4 909.552941c-24.094118-24.094118-24.094118-60.235294 0-84.329412l246.964706-246.964705c24.094118-24.094118 60.235294-24.094118 84.329412 0 24.094118 24.094118 24.094118 60.235294 0 84.329411l-246.964706 246.964706c-24.094118 18.070588-60.235294 18.070588-84.329412 0zM90.352941 24.094118h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235294H90.352941c-36.141176 0-60.235294-24.094118-60.235294-60.235294s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6080"></path><path d="M90.352941 24.094118c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235294s-60.235294-24.094118-60.235294-60.235294v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6081"></path><path d="M102.4 96.376471c-18.070588 24.094118-18.070588 60.235294 0 84.329411l246.964706 246.964706c24.094118 24.094118 60.235294 24.094118 84.329412 0 24.094118-24.094118 24.094118-60.235294 0-84.329412L186.729412 96.376471c-24.094118-18.070588-60.235294-18.070588-84.329412 0zM692.705882 867.388235h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235295h-240.941177c-36.141176 0-60.235294-24.094118-60.235294-60.235295s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6082"></path><path d="M933.647059 626.447059c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235295s-60.235294-24.094118-60.235294-60.235295v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6083"></path><path d="M915.576471 909.552941c24.094118-24.094118 24.094118-60.235294 0-84.329412l-246.964706-246.964705c-24.094118-24.094118-60.235294-24.094118-84.329412 0-24.094118 24.094118-24.094118 60.235294 0 84.329411l246.964706 246.964706c24.094118 18.070588 60.235294 18.070588 84.329412 0z" fill="#1E2330" p-id="6084"></path></svg>}
            onSelect={() => { postMessage({ event: 'toggleFullscreen' }); }}
            shortcut={updateHotkeyTip('⌥Y')}
          >{langCode.startsWith('zh') ? '切换全屏' : 'Toggle Fullscreen'}
          </MainMenu.Item>
        }
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu>
    </Excalidraw>
  );
};

/** Migrate older saved scenes that embedded entire SiYuan DOM and Markdown.
 * Renderers fetch content by block ID; only a stable checksum is persisted.
 */
const compactLegacySiyuanElements = (elements: any[]) => elements.map(element => {
  const previous = element.customData?.embedSiyuan;
  if (!previous || !("content" in previous || "dom" in previous)) return element;
  const hash = CryptoJS.SHA256(
    (previous.blockId || '') + "\\0" + (previous.content || '') + "\\0" + (previous.dom || '')
  ).toString();
  const { content: _unusedContent, dom: _unusedDom, ...compact } = previous;
  return {
    ...element,
    customData: {
      ...element.customData,
      embedSiyuan: { ...compact, contentHash: hash },
    },
    version: element.version + 1,
    versionNonce: Math.floor(Math.random() * 0x7fffffff),
    updated: Date.now(),
  };
});

const load = async () => {
  imageURL = urlParams.get('imageURL') || '';
  if (!/^assets\/.+\.(svg|png)$/.test(imageURL) || imageURL.split("/").some(part => part === ".." || part === ".") || /[?#\\]/.test(imageURL)) throw new Error("无效的画布附件路径。");

  const response = await fetch(`/${imageURL}`, { cache: 'reload' });
  if (!response.ok) return;

  const blob = await response.blob();
  mimeType = blob.type;

  if (mimeType === 'image/svg+xml') {
    const dataURL = await blobToDataURL(blob);
    savedSvg = HTMLToElement(base64ToUnicode(dataURL.split(',')[1]));
    defaultSvg = HTMLToElement(base64ToUnicode(defaultImageContent['svg'].split(',')[1]));
  } else {
    savedPngBinaryArray = await blobToArray(blob);
    defaultPngBinaryArray = base64ToArray(defaultImageContent['png'].split(',')[1]);
  }

  iframeCacheMap = await getIframeCacheMap(imageURL);

  let contents = await loadFromBlob(blob, null, null);
  persistedRevision = sceneRevision(contents.elements);
  const recovery = localStorage.getItem(recoveryKey());
  if (recovery) {
    contents = await loadFromBlob(new Blob([recovery], { type: "application/json" }), null, null);
    console.info("Excalidraw：已恢复上次关闭时未保存的画布，请保存以写回附件。");
  }
  contents.elements = compactLegacySiyuanElements(contents.elements);
  contents.appState.theme = urlParams.get('dark') == '1' ? 'dark' : 'light';
  createRoot(document.getElementById('root')!).render(React.createElement(App, {
    initialData: {
      elements: repairCanvasBindings(contents.elements),
      appState: contents.appState,
      files: contents.files,
      scrollToContent: true,
      libraryItems: await loadLibary(),
    },
  }));
};

const executeAgentCommand = async (action: string, payload: Record<string, any>): Promise<Record<string, unknown>> => {
  // Async actions (Mermaid, screenshot, image import) bypass the synchronous
  // canvas command dispatcher, so enforce the same canvas identity here.
  if (action !== 'read' && payload.canvasId !== imageURL)
    throw new Error('目标画布已变化，请先读取当前画布并传入正确的 canvasId。');
  if (action === 'save') {
    const deadline = Date.now() + saveTimeout;
    while (saveStatus.saving && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (payload.canvasId !== imageURL) throw new Error('保存必须指定当前画布的 canvasId。');
    return await save('save', true);
  }
  if (action === 'screenshot') {
    if (payload.canvasId !== imageURL) throw new Error('截图必须指定当前画布的 canvasId。');
    const api = window.excalidrawAPI;
    const scene = api.getSceneElements();
    const ids: string[] | undefined = payload.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length>100 ||
      ids.some(id=>typeof id !== 'string'))) throw new Error('截图 ids 无效');
    const selected = ids?.length ? scene.filter(e => ids.includes(e.id)) : scene;
    if (!selected.length) throw new Error('当前画布没有可截图元素');
    if (ids?.length && selected.length !== ids.length) throw new Error('截图目标 ID 不存在');
    const maxSize = Number(payload.maxSize ?? 1200);
    if (!Number.isFinite(maxSize) || maxSize<256 || maxSize>2048) throw new Error('maxSize 应在 256–2048 之间');
    const bounds = getCommonBounds(selected as any);
    const scale = Math.min(1, maxSize / Math.max(bounds[2]-bounds[0]+32,bounds[3]-bounds[1]+32));
    const blob = await exportToBlob({
      elements: selected,
      appState: { ...api.getAppState(), exportBackground: true, exportEmbedScene: false,
        exportWithDarkMode: false, exportScale: scale },
      files: api.getFiles(), mimeType: 'image/png', exportPadding: 16,
    });
    if (blob.size>4_000_000) throw new Error('截图超过 4MB，请减少元素数量或降低 maxSize');
    return { canvasId: imageURL, mimeType: 'image/png', dataURL: await blobToDataURL(blob),
      sizeBytes: blob.size, count: selected.length, bounds, saved: true };
  }
  const result = {
    ...(action === 'from_mermaid' ? await mermaidAgentElements(payload as any)
      : action === 'add_image' ? await addAgentImage(payload as any)
        : handleAgentCanvasCommand(action, payload)),
    canvasId: imageURL,
  };
  const advancedActions = ['align','distribute','group','ungroup','duplicate','from_mermaid','add_image'];
  if (advancedActions.includes(action) && payload.finalize !== false) {
    const created = (result as any).created || (result as any).grouped ||
      (result as any).aligned || (result as any).distributed || (result as any).ungrouped || [];
    try {
      if (created.length) handleAgentCanvasCommand('viewport', { canvasId: imageURL, ids: created });
      Object.assign(result, await save('save', true));
    } catch(error) {
      Object.assign(result, { saved: false, error: error instanceof Error ? error.message : String(error) });
    }
    return result;
  }
  if ((action === 'add' && payload.finalize !== false) || (action === 'update' && payload.finalize === true)) {
    const ids = action === 'add' ? Object.values((result as any).idMap) : (result as any).updated;
    try {
      const snapshot = ids.length ? handleAgentCanvasCommand('read', { canvasId: imageURL, ids, limit: 250 }) : { elements: [], bounds: null };
      Object.assign(result, { elements: snapshot.elements, bounds: snapshot.bounds });
      if (ids.length) handleAgentCanvasCommand('viewport', { canvasId: imageURL, ids });
      Object.assign(result, await save('save', true));
    } catch (error) {
      // The mutation already happened. Preserve its IDs so a save retry does not duplicate the drawing.
      Object.assign(result, { saved: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
};

const messageHandler = async (event: MessageEvent) => {
  if (event.source !== window.parent || event.origin !== location.origin) return;
  let message: any;
  try {
    message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch (err) {
    console.error('[dodo-excalidraw] Invalid parent message', err);
    return;
  }
  if (!message || typeof message !== 'object') return;

  if (message.event === 'agentCommand' && typeof message.requestId === 'string') {
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    const respond = (result: unknown) => {
      window.parent?.postMessage(JSON.stringify({ event: 'agentCommandResult', requestId: message.requestId, result }), event.origin);
    };
    try {
      respond(await executeAgentCommand(String(message.action || ''), payload));
    } catch (error) {
      respond({ error: error instanceof Error ? error.message : String(error) });
    }
  }
};
const loadLibary = async () => {
  const response = await fetch('/api/file/getFile', {
    method: 'POST',
    body: JSON.stringify({
      path: window.EXCALIDRAW_LIBRARY_PATH,
    }),
  });
  let libraryItems: any = [];
  try {
    const blob = await response.blob();
    libraryItems = await loadLibraryFromBlob(blob);
  } catch (error) { }
  return libraryItems;
}

const saveLibrary = async (libraryItems: any) => {
  const newLibraryData = serializeLibraryAsJSON(libraryItems);
  const file = new File([newLibraryData], 'library.excalidraw', { type: 'application/json' });
  const formData = new FormData();
  formData.append('path', window.EXCALIDRAW_LIBRARY_PATH);
  formData.append('file', file);
  formData.append('isDir', 'false');
  const response = await fetch('/api/file/putFile', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw new Error(result.msg || '素材库保存失败。');
}

const addLibrary = async (libraryUrlTokens: { libraryUrl: string, idToken: string | null }) => {
  let ok = true;
  try {
    const libraryUrl = decodeURIComponent(libraryUrlTokens.libraryUrl);
    let request = await fetch(libraryUrl);
    let blob = await request.blob();
    const addedLibraryItems = await loadLibraryFromBlob(blob, "published");
    const localLibraryItems = await loadLibary();
    const mergedLibraryItems = mergeLibraryItems(localLibraryItems, addedLibraryItems);
    await saveLibrary(mergedLibraryItems);
    console.log('add library success');
  } catch (error) {
    ok = false;
    console.error(error);
    console.log('add library fail');
  }
  document.getElementById('root')!.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100vh;">${ok ? 'Add Library Success' : 'Add Library Fail'}</div>`;
}

const getMarkdownToolButton = () => {
  const html = `
<button data-testid="toolbar-markdown" class="dropdown-menu-item dropdown-menu-item-base">
  <div class="dropdown-menu-item__icon">
    <svg aria-hidden="true" focusable="false" role="img" t="1772027273314" class="" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7889" width="20" height="20"><path d="M92 192C42.24 192 0 232.128 0 282.016v459.968C0 791.904 42.24 832 92 832h840C981.76 832 1024 791.872 1024 741.984V282.016C1024 232.16 981.76 192 932 192z m0 64h840c16.512 0 28 12.256 28 26.016v459.968c0 13.76-11.52 26.016-28 26.016H92C75.488 768 64 755.744 64 741.984V282.016c0-13.76 11.52-25.984 28-25.984zM160 352v320h96v-212.992l96 127.008 96-127.04V672h96V352h-96l-96 128-96-128z m544 0v160h-96l144 160 144-160h-96v-160z" p-id="7890"></path></svg>
  </div>
  <div class="dropdown-menu-item__text"> Markdown </div>
</button>`.trim();
  const element = HTMLToElement(html);
  element.addEventListener('click', () => {
    const elementId = nanoid();
    const appState = window.excalidrawAPI.getAppState();
    const { x, y } = viewportCoordsToSceneCoords(
      { clientX: appState.width / 2, clientY: appState.height / 2 },
      appState,
    );

    // 创建 Markdown embeddable 元素
    const newElement = {
      id: elementId,
      type: 'embeddable',
      x,
      y,
      width: 300,
      height: 185,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'aO',
      roundness: {
        type: 3,
      },
      seed: Math.floor(Math.random() * 10000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 10000),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: `markdown`,
      locked: false,
      customData: {
        embedMarkdown: {
          content: '',
          config: {
          },
        },
        embedIframeVersionNonce: Math.floor(Math.random() * 10000),
      },
    };

    const sceneElements = window.excalidrawAPI.getSceneElements();
    window.excalidrawAPI.updateScene({ elements: [...sceneElements, newElement] });
  });

  return element;
}

window.triggleHoverBlock = (blockId: string, location: { x: number, y: number }) => {
  if (!window.frameElement) return;
  const frameRect = window.frameElement.getBoundingClientRect();
  postMessage({
    event: 'triggleHoverBlock',
    blockID: blockId,
    x: frameRect.left + location.x,
    y: frameRect.top + location.y,
  });
}

const setupMutationObserver = () => {
  const mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const addedElement = node as HTMLElement;
            addedElement.querySelectorAll(".library-menu-browse-button").forEach(element => {
              element.addEventListener('click', () => {
                postMessage({ event: 'browseLibrary' });
              });
            });
            const embeddableTool = addedElement.querySelector(".dropdown-menu-item[data-testid='toolbar-embeddable']");
            if (embeddableTool) {
              const embeddableToolText = embeddableTool.querySelector('.dropdown-menu-item__text');
              if (embeddableToolText) {
                embeddableToolText.textContent = embeddableToolText.textContent + (langCode.startsWith('zh') ? '/思源超链接' : '/SiYuan Hyperlink');
              }
              embeddableTool.insertAdjacentElement('afterend', getMarkdownToolButton());
            }
          }
        });
      }
      else if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'class'
          && mutation.target.nodeType === Node.ELEMENT_NODE
          && (mutation.target as HTMLElement).classList.contains('excalidraw-tooltip--visible')
          && window.frameElement
          && mutation.target.textContent?.startsWith('siyuan://blocks/')
        ) {
          const tooltip = mutation.target as HTMLElement;
          const rect = tooltip.getBoundingClientRect();
          const blockId = tooltip.textContent.split('siyuan://blocks/').pop();
          if (blockId) {
            window.triggleHoverBlock(blockId, {x: rect.left, y: rect.top});
          }
        }
      }
    }
  });

  mutationObserver.observe(document, {
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
    subtree: true
  });
}

const libraryUrlTokens = parseLibraryTokensFromUrl();
if (libraryUrlTokens) {
  addLibrary(libraryUrlTokens);
} else {
  window.addEventListener('message', messageHandler);
  load();
  postMessage({ event: 'init' });
  setupMutationObserver();
}

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (matchHotKey('⌘S', event)) {
    event.preventDefault();
    if (!saveStatus.saving && !window.excalidrawAPI.getAppState().activeEmbeddable) save("save");
  } else if (matchHotKey('⌥Y', event)) {
    event.preventDefault();
    postMessage({ event: 'toggleFullscreen' });
  }
});

window.addEventListener('drop', (event: DragEvent) => {
  const dragElement: HTMLElement | null = window.parent?.siyuan?.dragElement;
  if (dragElement) {
    let blockId = (dragElement.querySelector('.protyle-wysiwyg--select[data-node-id]') as HTMLElement)?.getAttribute('data-node-id');
    if (!blockId && dragElement.nodeName === 'DIV' && dragElement.childNodes.length === 1 && dragElement.firstChild?.nodeName === '#text') {
      blockId = dragElement.textContent;
    }
    if (blockId) {
      const elementId = nanoid();
      const appState = window.excalidrawAPI.getAppState();
      const { x, y } = viewportCoordsToSceneCoords(
        { clientX: event.clientX, clientY: event.clientY },
        appState,
      );

      // 创建 Markdown embeddable 元素
      const newElement = {
        id: elementId,
        type: 'embeddable',
        x,
        y,
        width: 300,
        height: 185,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: 'aO',
        roundness: {
          type: 3,
        },
        seed: Math.floor(Math.random() * 10000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 10000),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: `siyuan://blocks/${blockId}`,
        locked: false,
      };

      const sceneElements = window.excalidrawAPI.getSceneElements();
      window.excalidrawAPI.updateScene({ elements: [...sceneElements, newElement] });
    }
  }
});
