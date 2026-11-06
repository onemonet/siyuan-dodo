const MEMO_DOM_SELECTORS = {
  blockReference: "span[data-type='block-ref'][data-id]",
  editable: "[contenteditable]",
  link: "span[data-type~='a'][data-href], span[data-type~='url'][data-href], a[href]",
  previewImage: "img[data-src], img[src]",
  imageContainer: ".memo-image-item, [data-type='img']",
} as const;

export const MEMO_IMAGE_PREVIEW_LABEL = "memo 图片预览";

const BLOCK_URL_PREFIX = "siyuan://blocks/";
const BLOCK_URL_SUFFIX = "?focus=1";
const UNSAFE_PROTOCOLS = new Set(["javascript:", "vbscript:", "data:"]);
const UNSAFE_NODE_SELECTOR = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "textarea",
  "select",
].join(",");
const URL_ATTRIBUTE_NAMES = new Set([
  "href",
  "src",
  "data-href",
  "data-src",
  "xlink:href",
]);
const SAFE_DATA_IMAGE_REGEX = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;

export interface MemoNavigationTarget {
  href: string;
  target: "_blank" | "_self";
}

export function normalizeReadonlyMemoDOM(root: HTMLElement): void {
  const editableElements = root.querySelectorAll<HTMLElement>(
    MEMO_DOM_SELECTORS.editable,
  );

  editableElements.forEach((element) => {
    element.setAttribute("contenteditable", "false");
    element.setAttribute("spellcheck", "false");
    element.setAttribute("tabindex", "-1");
  });
}

export function sanitizeReadonlyMemoDOMContent(content: string): string {
  if (!content.trim() || typeof document === "undefined") {
    return "";
  }

  const template = document.createElement("template");
  template.innerHTML = content;

  template.content.querySelectorAll(UNSAFE_NODE_SELECTOR).forEach((element) => {
    element.remove();
  });

  template.content.querySelectorAll("*").forEach((element) => {
    sanitizeElementAttributes(element);
  });

  return template.innerHTML.trim();
}

export function normalizeMemoPreviewImageTargets(root: HTMLElement): void {
  const imageElements = root.querySelectorAll<HTMLImageElement>(
    MEMO_DOM_SELECTORS.previewImage,
  );

  imageElements.forEach((imageElement) => {
    imageElement.setAttribute("role", "button");
    imageElement.setAttribute("tabindex", "0");
    imageElement.setAttribute("aria-label", MEMO_IMAGE_PREVIEW_LABEL);
  });
}

export function normalizeMemoInlineNavigationTargets(root: HTMLElement): void {
  const linkElements = root.querySelectorAll<HTMLElement>(
    MEMO_DOM_SELECTORS.link,
  );
  const blockReferenceElements = root.querySelectorAll<HTMLElement>(
    MEMO_DOM_SELECTORS.blockReference,
  );

  linkElements.forEach((element) => {
    const href = getElementHref(element);
    if (!href || isUnsafeHref(href)) {
      return;
    }

    if (element.tagName.toLowerCase() === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    } else {
      element.setAttribute("role", "link");
      element.setAttribute("tabindex", "0");
    }

    element.setAttribute("title", href);
  });

  blockReferenceElements.forEach((element) => {
    const blockId = getBlockReferenceId(element);
    if (!blockId) {
      return;
    }

    element.setAttribute("role", "link");
    element.setAttribute("tabindex", "0");
    element.setAttribute("title", `打开块 ${blockId}`);
  });
}

export function collectMemoImageSources(root: HTMLElement): string[] {
  const imageElements = root.querySelectorAll<HTMLImageElement>(
    MEMO_DOM_SELECTORS.previewImage,
  );
  const sourceSet = new Set<string>();

  imageElements.forEach((imageElement) => {
    const imageSource = getMemoImageSource(imageElement);
    if (imageSource) {
      sourceSet.add(imageSource);
    }
  });

  return Array.from(sourceSet);
}

export function getTargetMemoPreviewImage(
  target: EventTarget | null,
): HTMLImageElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  return target.closest(
    MEMO_DOM_SELECTORS.previewImage,
  ) as HTMLImageElement | null;
}

export function getMemoNavigationTarget(
  target: EventTarget | null,
): MemoNavigationTarget | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const blockReferenceElement = target.closest<HTMLElement>(
    MEMO_DOM_SELECTORS.blockReference,
  );
  if (blockReferenceElement) {
    const blockId = getBlockReferenceId(blockReferenceElement);
    return blockId
      ? {
          href: `${BLOCK_URL_PREFIX}${blockId}${BLOCK_URL_SUFFIX}`,
          target: "_self",
        }
      : null;
  }

  const linkElement = target.closest<HTMLElement>(MEMO_DOM_SELECTORS.link);
  if (!linkElement) {
    return null;
  }

  const href = getElementHref(linkElement);
  if (!href || isUnsafeHref(href)) {
    return null;
  }

  return {
    href,
    target: href.startsWith(BLOCK_URL_PREFIX) ? "_self" : "_blank",
  };
}

export function getMemoImageSource(imageElement: HTMLImageElement): string {
  return (
    imageElement.dataset.src ||
    imageElement.getAttribute("src") ||
    ""
  ).trim();
}

export function blurMemoImageContainer(imageElement: HTMLImageElement): void {
  const imageContainer = imageElement.closest(MEMO_DOM_SELECTORS.imageContainer);
  if (imageContainer instanceof HTMLElement) {
    imageContainer.blur();
  }
}

function getBlockReferenceId(element: HTMLElement): string {
  return (element.dataset.id || element.getAttribute("data-id") || "").trim();
}

function getElementHref(element: HTMLElement): string {
  return (
    element.dataset.href ||
    element.getAttribute("data-href") ||
    element.getAttribute("href") ||
    ""
  ).trim();
}

function isUnsafeHref(href: string): boolean {
  const protocolMatch = href.match(/^[a-zA-Z][a-zA-Z\d+.-]*:/);
  return protocolMatch
    ? UNSAFE_PROTOCOLS.has(protocolMatch[0].toLowerCase())
    : false;
}

function sanitizeElementAttributes(element: Element): void {
  Array.from(element.attributes).forEach((attribute) => {
    const attributeName = attribute.name.toLowerCase();
    const attributeValue = attribute.value.trim();

    if (
      attributeName.startsWith("on") ||
      attributeName === "srcdoc" ||
      attributeName === "style"
    ) {
      element.removeAttribute(attribute.name);
      return;
    }

    if (!URL_ATTRIBUTE_NAMES.has(attributeName)) {
      return;
    }

    if (isUnsafeURLAttribute(attributeName, attributeValue)) {
      element.removeAttribute(attribute.name);
    }
  });
}

function isUnsafeURLAttribute(attributeName: string, value: string): boolean {
  if (!value) {
    return false;
  }

  if (attributeName === "src" || attributeName === "data-src") {
    return isUnsafeSourceURL(value);
  }

  return isUnsafeHref(value);
}

function isUnsafeSourceURL(value: string): boolean {
  const protocolMatch = value.match(/^[a-zA-Z][a-zA-Z\d+.-]*:/);
  if (!protocolMatch) {
    return false;
  }

  const protocol = protocolMatch[0].toLowerCase();
  if (protocol === "data:") {
    return !SAFE_DATA_IMAGE_REGEX.test(value);
  }

  return protocol === "javascript:" || protocol === "vbscript:";
}
