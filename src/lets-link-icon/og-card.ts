import { forwardProxy } from "@/api";
import { cssUrl, fetchWithBodyTimeout, parseHttpUrl, withTimeout } from "@/security-utils";

export const OG_CARD_BLOCK_ATTRIBUTE = "custom-dodo-og-card";
export const OG_CARD_IMAGE_ATTRIBUTE = "custom-data-assets-og-card";
export const OG_CARD_RENDER_ATTRIBUTE = "data-dodo-og-card";
export const OG_CARD_BLOCK_RENDER_ATTRIBUTE = "data-dodo-og-card-block";

const OG_CARD_LINK_ATTRIBUTE = "data-dodo-og-card-link";
const OG_CARD_GENERATED_ATTRIBUTE = "data-dodo-og-card-generated";
export const OG_CARD_REFRESH_BUTTON_ATTRIBUTE = "data-dodo-og-card-refresh";
const LINK_SELECTOR = "span[data-type~='a'][data-href], span[data-type~='url'][data-href], a[href]";
const OG_CARD_FETCH_TIMEOUT_MS = 15_000;
const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 360;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

export interface OgCardTarget {
  block: HTMLElement;
  content: HTMLElement;
  link: HTMLElement;
  href: string;
}

export interface OgCardMetadata {
  title: string;
  description: string;
  siteName: string;
  imageUrl: string;
  faviconUrl: string;
  finalUrl: string;
  imageAssetPath?: string;
}

interface ForwardProxyResponse {
  body?: string;
  status?: number;
  url?: string;
  contentType?: string;
}

export function isOgCardEnabledValue(value: string | null): boolean {
  return ["true", "1", "yes", "on"].includes((value || "").trim().toLowerCase());
}

function isDesktopEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as Window & { require?: unknown }).require);
}

function compactText(value: string | null | undefined): string {
  return (value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limitText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;
}


const OG_CARD_ASSET_PATH_PATTERN = /^assets\/[^?#<>"'`\\]+$/;

export function normalizeOgCardAssetPath(value: string): string | null {
  const normalized = value.trim().replace(/^\/+/, "");
  if (
    !OG_CARD_ASSET_PATH_PATTERN.test(normalized) ||
    normalized.includes("..") ||
    normalized.includes("//")
  ) {
    return null;
  }

  return normalized;
}

function getOgCardAssetUrl(assetPath: string): string {
  return `/${assetPath}`;
}

function getContentElement(block: HTMLElement): HTMLElement | null {
  for (const child of Array.from(block.children)) {
    if (!(child instanceof HTMLElement) || child.classList.contains("protyle-attr")) {
      continue;
    }

    if (child.hasAttribute("contenteditable")) {
      return child;
    }
  }

  return block.querySelector<HTMLElement>(
    "div[contenteditable]:not(.protyle-attr), .p:not(.protyle-attr)",
  );
}

function getHref(element: HTMLElement): string {
  return (
    element.getAttribute("data-href") ||
    element.getAttribute("href") ||
    ""
  ).trim();
}

function getTextWithoutGeneratedCard(content: HTMLElement): string {
  const clone = content.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${OG_CARD_LINK_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(OG_CARD_LINK_ATTRIBUTE);
  });
  clone.querySelectorAll(`[${OG_CARD_REFRESH_BUTTON_ATTRIBUTE}]`).forEach((element) => {
    element.remove();
  });
  return compactText(clone.textContent);
}

export function findOgCardTarget(block: HTMLElement, requireEnabled = true): OgCardTarget | null {
  if (
    block.getAttribute("data-type") !== "NodeParagraph" ||
    (requireEnabled && !isOgCardEnabledValue(block.getAttribute(OG_CARD_BLOCK_ATTRIBUTE)))
  ) {
    return null;
  }

  const content = getContentElement(block);
  if (!content) {
    return null;
  }

  const links = Array.from(content.querySelectorAll<HTMLElement>(LINK_SELECTOR)).filter(
    (link, index, allLinks) => allLinks.indexOf(link) === index,
  );
  if (links.length !== 1) {
    return null;
  }

  const link = links[0];
  const href = getHref(link);
  if (!parseHttpUrl(href)) {
    return null;
  }

  const contentText = getTextWithoutGeneratedCard(content);
  const linkText = compactText(link.textContent);
  if (contentText !== linkText) {
    return null;
  }

  return { block, content, link, href };
}

export interface OgCardLinkFields {
  anchorText: string;
  description: string;
}

export function readOgCardLinkFields(link: HTMLElement): OgCardLinkFields {
  const dataTitle = compactText(link.getAttribute("data-title"));
  const title = compactText(link.getAttribute("title"));
  return {
    anchorText: compactText(link.textContent),
    description: dataTitle || title,
  };
}

export function isEmptyOgCardAnchorText(value: string): boolean {
  const normalized = compactText(value).replace(/\\([\\[\]()_*#.!])/g, "$1");
  return !normalized || normalized === "*";
}

export function readOgCardImageAssetPath(block: HTMLElement): string | null {
  return normalizeOgCardAssetPath(block.getAttribute(OG_CARD_IMAGE_ATTRIBUTE) || "");
}

/**
 * Rebuild card metadata from values that are persisted in the native block/link.
 * Network metadata is only needed when the user explicitly enables or refreshes a card.
 */
export function readOgCardNativeMetadata(target: OgCardTarget): OgCardMetadata | null {
  const finalUrl = normalizeOgCardUrl(target.href);
  if (!finalUrl) {
    return null;
  }

  const parsedUrl = new URL(finalUrl);
  const fields = readOgCardLinkFields(target.link);
  const imageAssetPath = readOgCardImageAssetPath(target.block) || "";
  const title = isEmptyOgCardAnchorText(fields.anchorText)
    ? parsedUrl.hostname
    : fields.anchorText;

  return {
    title: limitText(title, MAX_TITLE_LENGTH),
    description: limitText(fields.description, MAX_DESCRIPTION_LENGTH),
    siteName: parsedUrl.hostname,
    imageUrl: "",
    faviconUrl: "",
    finalUrl,
    imageAssetPath,
  };
}

export function getOgCardBlockId(block: HTMLElement): string | null {
  const id = block.getAttribute("data-node-id") || block.dataset.nodeId || "";
  return id.trim() || null;
}

export function hasOgCardContent(block: HTMLElement): boolean {
  return Boolean(block.querySelector(
    "div[contenteditable]:not(.protyle-attr), .p:not(.protyle-attr)",
  ));
}

export function updateOgCardLinkDom(
  dom: string,
  metadata: Pick<OgCardMetadata, "title" | "description">,
  force = false,
  expectedUrl?: string,
): { dom: string; changed: boolean } {
  if (!dom.trim()) {
    return { dom, changed: false };
  }

  const parsed = new DOMParser().parseFromString(dom, "text/html");
  const root = parsed.body.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    return { dom, changed: false };
  }

  const links = Array.from(root.querySelectorAll<HTMLElement>(LINK_SELECTOR)).filter(
    (link, index, allLinks) => allLinks.indexOf(link) === index,
  );
  if (links.length !== 1 || !parseHttpUrl(getHref(links[0]))) {
    return { dom, changed: false };
  }

  const link = links[0];
  if (expectedUrl && normalizeOgCardUrl(getHref(link)) !== expectedUrl) {
    return { dom, changed: false };
  }
  const fields = readOgCardLinkFields(link);
  const nextAnchorText = force || isEmptyOgCardAnchorText(fields.anchorText)
    ? compactText(metadata.title)
    : fields.anchorText;
  const nextDescription = force || !fields.description
    ? compactText(metadata.description)
    : fields.description;
  const shouldUpdateAnchor = force || isEmptyOgCardAnchorText(fields.anchorText);
  const shouldUpdateDescription = force || !fields.description;

  if (!shouldUpdateAnchor && !shouldUpdateDescription) {
    return { dom, changed: false };
  }

  if (shouldUpdateAnchor) {
    link.textContent = nextAnchorText;
  }
  if (shouldUpdateDescription) {
    if (nextDescription) {
      link.setAttribute("data-title", nextDescription);
      link.removeAttribute("title");
    } else {
      link.removeAttribute("data-title");
      link.removeAttribute("title");
    }
  }

  const nextDom = root.outerHTML;
  return { dom: nextDom, changed: nextDom !== dom };
}

export function stripOgCardRuntimeAttributes(dom: string): string {
  if (!dom.trim()) {
    return dom;
  }

  const parsed = new DOMParser().parseFromString(dom, "text/html");
  const root = parsed.body.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    return dom;
  }

  root.querySelectorAll(`[${OG_CARD_REFRESH_BUTTON_ATTRIBUTE}]`).forEach((element) => element.remove());
  const renderedElements = [
    ...(root.matches(`[${OG_CARD_RENDER_ATTRIBUTE}]`) ? [root] : []),
    ...Array.from(root.querySelectorAll(`[${OG_CARD_RENDER_ATTRIBUTE}]`)),
  ];
  renderedElements.forEach((element) => {
    element.removeAttribute(OG_CARD_RENDER_ATTRIBUTE);
    element.removeAttribute(OG_CARD_GENERATED_ATTRIBUTE);
    element.removeAttribute("data-og-card-title");
    element.removeAttribute("data-og-card-description");
    element.removeAttribute("data-og-card-site");
    element.removeAttribute("data-og-card-url");
    element.removeAttribute("data-og-card-has-image");
    element.removeAttribute("aria-label");
    if (element instanceof HTMLElement) {
      element.style.removeProperty("--dodo-og-card-image");
      element.style.removeProperty("--dodo-og-card-favicon");
      if (!element.getAttribute("style")?.trim()) {
        element.removeAttribute("style");
      }
    }
  });
  const runtimeBlocks = [
    ...(root.matches(`[${OG_CARD_BLOCK_RENDER_ATTRIBUTE}]`) ? [root] : []),
    ...Array.from(root.querySelectorAll(`[${OG_CARD_BLOCK_RENDER_ATTRIBUTE}]`)),
  ];
  runtimeBlocks.forEach((element) => element.removeAttribute(OG_CARD_BLOCK_RENDER_ATTRIBUTE));
  root.querySelectorAll(`[${OG_CARD_LINK_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(OG_CARD_LINK_ATTRIBUTE);
    element.removeAttribute("data-og-card-title");
    element.removeAttribute("data-og-card-description");
    element.removeAttribute("data-og-card-site");
    element.removeAttribute("data-og-card-url");
    element.removeAttribute("aria-label");
    element.removeAttribute("tabindex");
  });

  return root.outerHTML;
}

export function normalizeOgCardUrl(href: string): string | null {
  const parsed = parseHttpUrl(href);
  if (!parsed) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString();
}

function readMeta(document: Document, names: string[]): string {
  const wantedNames = new Set(names.map((name) => name.toLowerCase()));
  for (const element of Array.from(document.querySelectorAll("meta"))) {
    const property = element.getAttribute("property")?.trim().toLowerCase();
    const name = element.getAttribute("name")?.trim().toLowerCase();
    if (!wantedNames.has(property || "") && !wantedNames.has(name || "")) {
      continue;
    }

    const content = compactText(element.getAttribute("content"));
    if (content) {
      return content;
    }
  }

  return "";
}

function resolveHttpUrl(value: string, baseUrl: string): string {
  if (!value.trim()) {
    return "";
  }

  try {
    const resolved = new URL(value, baseUrl);
    return parseHttpUrl(resolved.toString())?.toString() || "";
  } catch {
    return "";
  }
}

export function parseOgCardHtml(html: string, sourceUrl: string, finalUrl = sourceUrl): OgCardMetadata | null {
  if (!html.trim()) {
    return null;
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const baseUrl = normalizeOgCardUrl(finalUrl) || normalizeOgCardUrl(sourceUrl);
  if (!baseUrl) {
    return null;
  }

  const parsedBaseUrl = new URL(baseUrl);
  const title = limitText(
    readMeta(document, ["og:title", "twitter:title"]) || compactText(document.title) || parsedBaseUrl.hostname,
    MAX_TITLE_LENGTH,
  );
  const description = limitText(
    readMeta(document, ["og:description", "twitter:description", "description"]),
    MAX_DESCRIPTION_LENGTH,
  );
  const imageUrl = resolveHttpUrl(
    readMeta(document, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]),
    baseUrl,
  );
  const siteName = limitText(
    readMeta(document, ["og:site_name", "og:site"]) || parsedBaseUrl.hostname,
    MAX_TITLE_LENGTH,
  );

  return {
    title,
    description,
    siteName,
    imageUrl,
    // Card icons come from the ordinary-link icon rules, not from page HTML.
    faviconUrl: "",
    finalUrl: baseUrl,
  };
}

export async function fetchOgCardMetadata(href: string): Promise<OgCardMetadata | null> {
  const normalizedUrl = normalizeOgCardUrl(href);
  if (!normalizedUrl) {
    return null;
  }

  if (isDesktopEnvironment()) {
    const directMetadata = await fetchOgCardMetadataDirect(normalizedUrl);
    if (directMetadata) {
      return directMetadata;
    }
    return fetchOgCardMetadataViaProxy(normalizedUrl);
  }

  const proxyMetadata = await fetchOgCardMetadataViaProxy(normalizedUrl);
  if (proxyMetadata) {
    return proxyMetadata;
  }
  return fetchOgCardMetadataDirect(normalizedUrl);
}

async function fetchOgCardMetadataDirect(url: string): Promise<OgCardMetadata | null> {
  try {
    const { response, body: html } = await fetchWithBodyTimeout(
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          ...(isDesktopEnvironment() ? { "User-Agent": USER_AGENT } : {}),
        },
      },
      OG_CARD_FETCH_TIMEOUT_MS,
      (response) => response.text(),
    );

    if (!response.ok) {
      return null;
    }

    return parseOgCardHtml(html, url, response.url || url);
  } catch {
    return null;
  }
}

async function fetchOgCardMetadataViaProxy(url: string): Promise<OgCardMetadata | null> {
  try {
    const response = await withTimeout(
      forwardProxy(
        url,
        "GET",
        null,
        [{ "User-Agent": USER_AGENT }],
        OG_CARD_FETCH_TIMEOUT_MS,
        "text/html",
      ) as Promise<ForwardProxyResponse | null>,
      OG_CARD_FETCH_TIMEOUT_MS,
      "OG metadata proxy request timed out",
    );

    if (!response || typeof response.body !== "string") {
      return null;
    }

    if (typeof response.status === "number" && (response.status < 200 || response.status >= 400)) {
      return null;
    }

    if (typeof response.contentType === "string" && !response.contentType.toLowerCase().includes("html")) {
      return null;
    }

    return parseOgCardHtml(response.body, url, response.url || url);
  } catch {
    return null;
  }
}

export function applyOgCardMetadata(target: OgCardTarget, metadata: OgCardMetadata): void {
  const { content, link } = target;
  target.block.setAttribute(OG_CARD_BLOCK_RENDER_ATTRIBUTE, "ready");
  const assetPath = normalizeOgCardAssetPath(metadata.imageAssetPath || "");
  const imageUrl = assetPath ? getOgCardAssetUrl(assetPath) : metadata.imageUrl;

  content.setAttribute(OG_CARD_RENDER_ATTRIBUTE, "ready");
  content.setAttribute(OG_CARD_GENERATED_ATTRIBUTE, "true");
  content.setAttribute("data-og-card-title", metadata.title);
  content.setAttribute("data-og-card-description", metadata.description);
  content.setAttribute("data-og-card-site", metadata.siteName);
  content.setAttribute("data-og-card-url", metadata.finalUrl);
  content.setAttribute("data-og-card-has-image", imageUrl ? "true" : "false");
  link.setAttribute("data-og-card-title", metadata.title);
  link.setAttribute("data-og-card-description", metadata.description);
  link.setAttribute("data-og-card-site", metadata.siteName);
  link.setAttribute("data-og-card-url", metadata.finalUrl);
  link.setAttribute("aria-label", [metadata.title, metadata.description, metadata.siteName]
    .filter(Boolean)
    .join(" - "));
  link.setAttribute("tabindex", "0");

  if (imageUrl) {
    content.style.setProperty("--dodo-og-card-image", cssUrl(imageUrl));
  } else {
    content.style.removeProperty("--dodo-og-card-image");
  }

  if (metadata.faviconUrl) {
    content.style.setProperty("--dodo-og-card-favicon", cssUrl(metadata.faviconUrl));
  } else {
    content.style.removeProperty("--dodo-og-card-favicon");
  }

  link.setAttribute(OG_CARD_LINK_ATTRIBUTE, "true");
}

export function clearOgCardMetadata(content: HTMLElement): void {
  const block = content.closest<HTMLElement>('[data-type="NodeParagraph"]');
  const link = content.querySelector<HTMLElement>(`[${OG_CARD_LINK_ATTRIBUTE}]`);
  link?.removeAttribute(OG_CARD_LINK_ATTRIBUTE);

  content.removeAttribute(OG_CARD_RENDER_ATTRIBUTE);
  content.removeAttribute(OG_CARD_GENERATED_ATTRIBUTE);
  content.removeAttribute("data-og-card-title");
  content.removeAttribute("data-og-card-description");
  content.removeAttribute("data-og-card-site");
  content.removeAttribute("data-og-card-url");
  content.removeAttribute("data-og-card-has-image");
  content.style.removeProperty("--dodo-og-card-image");
  content.style.removeProperty("--dodo-og-card-favicon");
  block?.removeAttribute(OG_CARD_BLOCK_RENDER_ATTRIBUTE);

  link?.removeAttribute("data-og-card-title");
  link?.removeAttribute("data-og-card-description");
  link?.removeAttribute("data-og-card-site");
  link?.removeAttribute("data-og-card-url");
  link?.removeAttribute("aria-label");
  link?.removeAttribute("tabindex");

  block?.querySelectorAll(`[${OG_CARD_REFRESH_BUTTON_ATTRIBUTE}]`).forEach((button) => {
    button.remove();
  });
}
