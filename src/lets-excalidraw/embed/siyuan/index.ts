import Vditor from 'vditor';
import 'vditor/dist/index.css';
import type { SiyuanBlockData } from './types';
import { getElementData, getParentWindow } from './utils';

// 获取 URL 参数
const urlParams = new URLSearchParams(window.location.search);
const elementId = urlParams.get('elementId');
const blockId = urlParams.get('blockId');
let currentBlockData: SiyuanBlockData | null = null;
let nativeEditPending = false;
let nativeEditAcknowledged = false;
let fallbackTimer: number | null = null;

const requestHost = (event: string): void => {
  if (!blockId || !elementId || window.top === window) return;
  try {
    window.top?.postMessage(JSON.stringify({ event, blockId, elementId }), location.origin);
  } catch (error) {
    console.warn("Native SiYuan bridge unavailable:", error);
  }
};


/**
 * A lightweight preview must still inherit the exact editor typography,
 * theme variables and icon sprite. The host Protyle sets these at runtime;
 * just copying its static CSS is not enough.
 */
function hostDocument(): Document | null {
  try { return window.top && window.top !== window ? window.top.document : null; }
  catch { return null; }
}

function syncNativeAppearance(): void {
  const host = hostDocument();
  if (!host) return;
  if (document.head.dataset.siyuanNativeStyles !== 'ready') {
    const importedLinks = new Set<string>();
    // SiYuan's host often loads its base stylesheet via relative hrefs.
    // cloneNode() copies that *raw* attribute, which then resolves against
    // /plugins/.../excalidraw/embed/siyuan/ instead of the host document.
    // This silently 404s, breaking native heading and list layout.
    for (const source of host.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      'link[rel~="stylesheet"], style',
    )) {
      if (source instanceof HTMLLinkElement) {
        if (!source.href || importedLinks.has(source.href)) continue;
        const copy = source.cloneNode(true) as HTMLLinkElement;
        copy.removeAttribute('id');
        copy.href = source.href; // the source document's absolute, resolved URL
        importedLinks.add(copy.href);
        document.head.append(copy);
      } else {
        const copy = source.cloneNode(true) as HTMLStyleElement;
        copy.removeAttribute('id');
        document.head.append(copy);
      }
    }
    // Some SiYuan versions install native stylesheets through CSSOM rather
    // than <link> elements. Include those resolved hrefs as a fallback.
    for (const sheet of Array.from(host.styleSheets)) {
      if (!sheet.href || importedLinks.has(sheet.href)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      importedLinks.add(sheet.href);
      document.head.append(link);
    }
    if (document.head.querySelector('link[rel~="stylesheet"], style')) {
      document.head.dataset.siyuanNativeStyles = 'ready';
    } else {
      console.warn('[Excalidraw] SiYuan host provided no native stylesheet for block preview');
    }
  }

  // The inline editor font/line-height and CSS variables are computed in
  // the host document (some themes set them on body, not :root).
  for (const [from, to] of [
    [host.documentElement, document.documentElement],
    [host.body, document.body],
  ] as const) {
    const styles = window.top!.getComputedStyle(from);
    for (let index = 0; index < styles.length; index++) {
      const key = styles.item(index);
      if (key.startsWith('--b3-')) to.style.setProperty(key, styles.getPropertyValue(key));
    }
  }
  document.documentElement.className = host.documentElement.className;
  document.body.className = host.body.className;
  const nativeEditor = host.querySelector<HTMLElement>('.protyle-wysiwyg');
  const preview = document.querySelector<HTMLElement>('#root .protyle-wysiwyg');
  if (nativeEditor && preview) {
    const style = window.top!.getComputedStyle(nativeEditor);
    for (const name of ['font-size', 'font-family', 'font-weight', 'line-height', 'letter-spacing']) {
      preview.style.setProperty(name, style.getPropertyValue(name));
    }
  }
}

/** Copy symbols referenced by <use href="#..."> from the host SVG sprite. */
/**
 * The Excalidraw scene owns the embed background. SiYuan host theme styles
 * may paint a white background on the iframe's html/body or Protyle layers,
 * masking the scene fill color. Keep only the outer layers transparent;
 * individual SiYuan blocks can still keep their own styled backgrounds.
 */
function syncTransparentCanvasLayers(): void {
  const selectors = ['html', 'body', '#root', '#root > .protyle',
    '#root > .protyle > .protyle-content',
    '#root > .protyle > .protyle-content > .protyle-wysiwyg',
    '#root > #preview'];
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) continue;
    node.style.setProperty('background', 'transparent', 'important');
    node.style.setProperty('background-color', 'transparent', 'important');
  }
}

function syncNativeIcons(root: HTMLElement): void {
  const host = hostDocument();
  if (!host) return;
  let sprite = document.getElementById('dodo-siyuan-preview-icons') as unknown as SVGSVGElement | null;
  const svgNS = 'http://www.w3.org/2000/svg';
  for (const use of root.querySelectorAll<SVGUseElement>('use')) {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    if (!/^#[a-zA-Z][\w:-]*$/.test(href)) continue;
    const id = href.slice(1);
    if (document.getElementById(id)) continue;
    const symbol = host.getElementById(id);
    if (!symbol || symbol.localName.toLowerCase() !== 'symbol') continue;
    if (!sprite) {
      sprite = document.createElementNS(svgNS, 'svg');
      sprite.id = 'dodo-siyuan-preview-icons';
      sprite.setAttribute('aria-hidden', 'true');
      sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      document.body.append(sprite);
    }
    sprite.append(symbol.cloneNode(true));
  }
}

const PREVIEW_HEADING_SCOPE = 'dodo-excalidraw-preview';
let headingVersion = 0;

/**
 * SiYuan heading numbering is generated, not stored in block DOM.
 * Request the same kernel numbering map used by native Protyle, then
 * apply the layout rules from headingNumberCore to this read-only DOM.
 */
async function syncNativeHeadingNumbers(wysiwyg: HTMLElement): Promise<void> {
  const current = ++headingVersion;
  const host = window.top as typeof window & {
    siyuan?: { config?: { editor?: { headingNumber?: boolean } } };
  };
  if (!host?.siyuan?.config?.editor?.headingNumber ||
      !wysiwyg.querySelector('[data-type="NodeHeading"][data-node-id]') || !blockId) return;

  const request = async (path: string, payload: object): Promise<any> => {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`SiYuan ${path}: HTTP ${response.status}`);
    const data = await response.json();
    if (data.code !== 0) throw new Error(`SiYuan ${path}: ${data.msg || data.code}`);
    return data.data;
  };
  try {
    const info = await request('/api/block/getBlockInfo', { id: blockId });
    const rootID = info?.rootID;
    if (!rootID || current !== headingVersion || !wysiwyg.isConnected) return;
    const numbers: Record<string, string> = await request('/api/outline/getDocHeadingNumbers', { id: rootID });
    if (current !== headingVersion || !wysiwyg.isConnected || !numbers) return;
    const headings = wysiwyg.querySelectorAll<HTMLElement>('[data-type="NodeHeading"][data-node-id]');
    if (!headings.length) return;
    wysiwyg.setAttribute('data-heading-number-scope', PREVIEW_HEADING_SCOPE);
    if (!document.getElementById('dodo-preview-heading-style')) {
      const css = document.createElement('style');
      css.id = 'dodo-preview-heading-style';
      css.textContent = `
        .protyle-wysiwyg[data-heading-number-scope="${PREVIEW_HEADING_SCOPE}"]
          [data-type="NodeHeading"][data-node-id] > :first-child[contenteditable] {
          position:relative;
          padding-inline-start:var(--b3-protyle-heading-number-offset,0px);
        }
        .protyle-wysiwyg[data-heading-number-scope="${PREVIEW_HEADING_SCOPE}"]
          [data-type="NodeHeading"][data-node-id] > :first-child[contenteditable]::before {
          content:var(--b3-protyle-heading-number,"");
          position:absolute;
          inset-inline-start:calc(0px - var(--b3-protyle-heading-number-trim-start,0px));
          top:0;
          background:transparent;
          color:var(--b3-theme-on-surface-light);
          user-select:none;
          pointer-events:none;
        }`;
      document.head.append(css);
    }
    headings.forEach(heading => {
      const number = numbers[heading.dataset.nodeId || ''];
      const editable = heading.querySelector<HTMLElement>(':scope > :first-child[contenteditable]');
      if (!editable || !number) return;
      const measure = document.createElement('span');
      measure.className = 'protyle-heading-number__measure';
      measure.textContent = number;
      measure.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;';
      heading.append(measure);
      const width = measure.getBoundingClientRect().width || number.length * 9;
      measure.remove();
      const trimStart = number.startsWith('（') ? '.5em' : '0px';
      const needSpace = !/[、）]$/.test(number);
      const offset = `calc(${width}px ${needSpace ? '+ .5em' : ''} ${trimStart !== '0px' ? '- ' + trimStart : ''})`;
      heading.style.setProperty('--b3-protyle-heading-number', JSON.stringify(number));
      heading.style.setProperty('--b3-protyle-heading-number-offset', offset);
      heading.style.setProperty('--b3-protyle-heading-number-trim-start', trimStart);
    });
  } catch (error) {
    console.warn('Native SiYuan heading numbers unavailable for preview:', error);
  }
}

/** Render SiYuan's block DOM in a read-only Protyle-compatible container. */
function renderNativeBlock(rootElement: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, object').forEach(node => node.remove());
  template.content.querySelectorAll<HTMLElement>('*').forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) ||
          /^(?:href|src)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value)) {
        node.removeAttribute(attribute.name);
      }
    }
    if (node.hasAttribute('contenteditable')) node.setAttribute('contenteditable', 'false');
  });
  rootElement.replaceChildren();
  const container = document.createElement('div');
  container.className = 'protyle';
  container.style.cssText = 'width:100%;height:100%;overflow:hidden;background:transparent;';
  const content = document.createElement('div');
  content.className = 'protyle-content';
  content.style.cssText = 'width:100%;height:100%;overflow:auto;overscroll-behavior:contain;';
  const wysiwyg = document.createElement('div');
  wysiwyg.className = 'protyle-wysiwyg';
  wysiwyg.style.cssText = 'min-height:100%;box-sizing:border-box;';
  wysiwyg.setAttribute('contenteditable', 'false');
  wysiwyg.setAttribute('data-readonly', 'true');
  wysiwyg.append(template.content);
  content.append(wysiwyg);
  container.append(content);
  rootElement.append(container);
  syncNativeAppearance();
  syncTransparentCanvasLayers();
  syncNativeIcons(wysiwyg);
  void syncNativeHeadingNumbers(wysiwyg);
}

/**
 * 渲染思源块 Markdown 内容为静态 HTML
 */
async function renderBlock(blockData: SiyuanBlockData): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  if (blockData.dom) {
    renderNativeBlock(rootElement, blockData.dom);
    // Run the real SiYuan highlight/math/diagram renderers in the host,
    // avoiding a separate copy of their ever-changing implementation.
    requestHost("dodoSiyuanNativeRender");
    return;
  }

  // 原生 API 不可用时回退到原有 Markdown 预览
  rootElement.innerHTML = '';

  // 创建预览容器
  const previewContainer = document.createElement('div');
  previewContainer.id = 'preview';
  previewContainer.className = 'vditor-reset';
  rootElement.appendChild(previewContainer);
  syncTransparentCanvasLayers();

  // 使用 Vditor.preview 渲染 Markdown
  Vditor.preview(previewContainer, blockData.content, {
    mode: 'light',
    cdn: new URL("../markdown/vditor", location.href).href,
    speech: {
      enable: false,
    },
  });

}

/**
 * 更新按钮状态（聚焦时显示）
 */
function setupButtonVisibility(): void {
  const buttonContainer = document.getElementById('button-container');
  if (!buttonContainer) return;

  // 鼠标移入 iframe 时显示按钮
  document.addEventListener('mouseenter', () => {
    buttonContainer.classList.toggle('button-visible', true);
  });

  // 鼠标移出 iframe 时隐藏按钮
  document.addEventListener('mouseleave', () => {
    buttonContainer.classList.toggle('button-visible', false);
  });
}

/**
 * 更新按钮功能 - 重新获取 Markdown 数据并在内容变化时更新
 */
const handleUpdate = async (): Promise<void> => {
  if (!elementId || !blockId) return;

  const newBlockData = await getElementData(elementId, blockId);
  if (newBlockData === null) {
    console.error('Failed to fetch siyuan block');
    showErrorMessage();
    return;
  }

  // 判断内容是否变化
  if (currentBlockData && currentBlockData.content === newBlockData.content && currentBlockData.dom === newBlockData.dom) {
    console.log('No changes detected');
  }

  // 更新数据
  currentBlockData = newBlockData;
  
  // 重新渲染
  await renderBlock(currentBlockData);

}

/**
 * Request a real Protyle at the on-canvas coordinates. If the editor host
 * is missing (e.g. standalone browser or an old plugin build), keep the
 * existing SiYuan hover editor instead of leaving the control unusable.
 */
const openLegacyHover = () => {
  if (!blockId) return;
  try {
    const parent = getParentWindow();
    parent?.triggleHoverBlock?.(blockId, window.frameElement!.getBoundingClientRect());
  } catch (error) {
    console.warn("Unable to open SiYuan hover editor:", error);
  }
};

const handleEdit = (): void => {
  if (!blockId || nativeEditPending) return;
  if (window.top === window || !elementId) {
    openLegacyHover();
    return;
  }
  nativeEditPending = true;
  nativeEditAcknowledged = false;
  requestHost("dodoSiyuanNativeEdit");
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = null;
    if (!nativeEditAcknowledged) {
      nativeEditPending = false;
      openLegacyHover();
    }
  }, 900);
};

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  // The Excalidraw canvas owns the hover toolbar; its button messages are
  // forwarded only by this embed's immediate parent, not arbitrary frames.
  if (event.source === window.parent && window.parent !== window) {
    let command: { event?: string; elementId?: string };
    try { command = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
    catch { return; }
    if (command?.elementId !== elementId) return;
    if (command.event === 'dodoSiyuanRequestEdit') handleEdit();
    else if (command.event === 'dodoSiyuanRequestRefresh') void handleUpdate();
    return;
  }
  if (event.source !== window.top) return;
  let msg: { event?: string };
  try { msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
  catch { return; }
  if (msg?.event === "dodoSiyuanNativeEditStarted") {
    nativeEditAcknowledged = true;
    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
    nativeEditPending = false;
  } else if (msg?.event === "dodoSiyuanNativeEditUnavailable") {
    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
    nativeEditPending = false;
    openLegacyHover();
  } else if (msg?.event === "dodoSiyuanNativeEditFinished") {
    nativeEditPending = false;
    void handleUpdate();
  }
});

/**
 * 初始化按钮
 */
function initButtons(): void {
  const updateButton = document.getElementById('update-button');
  const editButton = document.getElementById('edit-button');

  if (updateButton) {
    updateButton.addEventListener('click', handleUpdate);
  }

  if (editButton) {
    editButton.addEventListener('click', handleEdit);
  }

  setupButtonVisibility();
}

/**
 * 从父页面获取数据并初始化
 */
async function loadData(): Promise<boolean> {
  if (!elementId && !blockId) {
    console.error('No elementId or blockId provided');
    return false;
  }

  // 如果有 elementId，从父页面获取数据
  if (elementId && blockId) {
    const blockData = await getElementData(elementId, blockId);
    if (blockData) {
      currentBlockData = blockData;
      await renderBlock(blockData);
      return true;
    }
    console.error('Failed to load block data for element:', elementId);
    return false;
  }

  return false;
}

function showErrorMessage() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;height:100vh;color:#666;">
        <div style="text-align:center;">
          <p>Load failed</p>
          <p style="font-size:12px;">data not found</p>
        </div>
      </div>
    `;
  }
}

// 初始化
async function init() {
  const success = await loadData();
  if (!success) {
    // 初始化失败，显示错误信息
    showErrorMessage();
  }

  // 初始化按钮
  initButtons();
  // Double click the visible block to edit in place; existing edit-button
  // and manual refresh remain available for older saved scenes.
  document.getElementById("root")?.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleEdit();
  });
}

init();

// 页面卸载时清理

