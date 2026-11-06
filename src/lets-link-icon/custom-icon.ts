import { fetchSyncPost } from "siyuan";
import { settings } from "@/settings";
import {
  cssUrl,
  decodeUriComponentSafely,
  escapeCssString,
  sqlString,
  stripHashAndQuery,
} from "@/security-utils";
import {
  LINK_ICON_DOC_REF_STATUS_ATTRIBUTE,
  LINK_ICON_DOC_REF_STATUS_MISSING,
  LINK_ICON_MISSING_DOC_ICON_CODE,
  type DocIconInfo,
  resolveDocIconInfo,
} from "./doc-icon";
import {
  LINK_ICON_CUSTOM_STYLE_ID,
  LINK_ICON_DOC_STYLE_ID,
  type LinkIconConfig,
  defaultLinkIconConfig,
} from "./settings";

export type { DocIconInfo } from "./doc-icon";

export interface CustomIconRecord {
  href: string;
  iconUrl: string;
}

export interface DynamicStyleManager {
  addIcon(href: string, iconUrl: string, flushStyle?: boolean): void;
  removeIcon(href: string): void;
  removeAllIcons(): void;
  clearStyle(): void;
  flushStyle(): void;
  markIPLinks(root?: ParentNode): void;
  markLocalFileLinks(root?: ParentNode): void;
  isIPAddress(hostname: string): boolean;
}

const BUILTIN_DOC_ICON_CODES = new Set(["#iconFile", "#iconFolder", LINK_ICON_MISSING_DOC_ICON_CODE]);
const DOC_ICON_FILTERED_CODES = new Set([LINK_ICON_MISSING_DOC_ICON_CODE]);

function getStyleElement(styleId: string): HTMLStyleElement {
  let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }
  return styleElement;
}

export function getLinkIconConfig(): LinkIconConfig {
  return {
    insertDocRefIcon:
      settings.getBySpace("link-icon", "insertDocRefIcon") ?? defaultLinkIconConfig.insertDocRefIcon,
    insertStaticRefIcon:
      settings.getBySpace("link-icon", "insertStaticRefIcon") ?? defaultLinkIconConfig.insertStaticRefIcon,
    showMissingDocRefIcon:
      settings.getBySpace("link-icon", "showMissingDocRefIcon") ??
      defaultLinkIconConfig.showMissingDocRefIcon,
    showExternalIcon:
      settings.getBySpace("link-icon", "showExternalIcon") ?? defaultLinkIconConfig.showExternalIcon,
    autoFetchIcon:
      settings.getBySpace("link-icon", "autoFetchIcon") ?? defaultLinkIconConfig.autoFetchIcon,
    faviconServiceTemplates:
      settings.getBySpace("link-icon", "faviconServiceTemplates") ??
      defaultLinkIconConfig.faviconServiceTemplates,
  };
}

export function createDynamicStyleManager(styleId = LINK_ICON_CUSTOM_STYLE_ID): DynamicStyleManager {
  let customStyles: Record<string, string> = {};
  const fileKindAttribute = "data-file-link-kind";
  const linkSelectors = [
    '.protyle-wysiwyg [data-node-id] span[data-type~="a"]',
    '.protyle-wysiwyg [data-node-id] span[data-type~="url"]',
    '.protyle-wysiwyg [data-node-id] a',
    '.b3-typography a',
  ];

  const isIPAddress = (hostname: string): boolean => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(hostname) || ipv6Regex.test(hostname);
  };

  const hasFileExtension = (segment: string): boolean => {
    const lastDotIndex = segment.lastIndexOf(".");
    return lastDotIndex > 0 && lastDotIndex < segment.length - 1;
  };

  const getLocalFileLinkKind = (href: string): "file" | "folder" | null => {
    if (!href.startsWith("file://")) {
      return null;
    }

    const rawPath = stripHashAndQuery(decodeUriComponentSafely(href.slice("file://".length)));
    if (!rawPath || /[\\/]$/.test(rawPath)) {
      return "folder";
    }

    const normalizedPath = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const lastSegment = normalizedPath.split("/").pop() ?? "";
    if (!lastSegment || lastSegment === "." || lastSegment === "..") {
      return "folder";
    }

    return hasFileExtension(lastSegment) ? "file" : "folder";
  };

  const forEachLinkElement = (searchRoot: ParentNode, callback: (element: HTMLElement, href: string) => void) => {
    linkSelectors.forEach((selector) => {
      searchRoot.querySelectorAll(selector).forEach((link) => {
        const element = link as HTMLElement;
        const href = element.getAttribute("data-href") || element.getAttribute("href");
        if (!href) {
          return;
        }
        callback(element, href);
      });
    });
  };

  const buildSelectors = (href: string) => {
    if (href.includes("*")) {
      if (href === "*.*.*.*" || href === "*.*.*") {
        return [
          ".protyle-wysiwyg [data-node-id] span[data-type~='a'][data-ip-address]:not(:empty)::before",
          ".protyle-wysiwyg [data-node-id] span[data-type~='url'][data-ip-address]:not(:empty)::before",
          ".protyle-wysiwyg [data-node-id] a[data-ip-address]::before",
          ".b3-typography a[data-ip-address]::before",
        ];
      }

      const rawDomainPattern = href.replace(/^\*\./, ".");
      const domainPattern = escapeCssString(rawDomainPattern);
      const mainDomain = escapeCssString(rawDomainPattern.slice(1));
      return [
        `.protyle-wysiwyg [data-node-id] span[data-type~='a'][data-href*='${domainPattern}']:not(:empty)::before`,
        `.protyle-wysiwyg [data-node-id] span[data-type~='url'][data-href*='${domainPattern}']:not(:empty)::before`,
        `.protyle-wysiwyg [data-node-id] a[href*='${domainPattern}']::before`,
        `.b3-typography a[href*='${domainPattern}']::before`,
        `.protyle-wysiwyg [data-node-id] span[data-type~='a'][data-href*='//${mainDomain}/']:not(:empty)::before`,
        `.protyle-wysiwyg [data-node-id] span[data-type~='url'][data-href*='//${mainDomain}/']:not(:empty)::before`,
        `.protyle-wysiwyg [data-node-id] a[href*='//${mainDomain}/']::before`,
        `.b3-typography a[href*='//${mainDomain}/']::before`,
        `.protyle-wysiwyg [data-node-id] span[data-type~='a'][data-href$='//${mainDomain}']:not(:empty)::before`,
        `.protyle-wysiwyg [data-node-id] span[data-type~='url'][data-href$='//${mainDomain}']:not(:empty)::before`,
        `.protyle-wysiwyg [data-node-id] a[href$='//${mainDomain}']::before`,
        `.b3-typography a[href$='//${mainDomain}']::before`,
      ];
    }

    const encodedHref = escapeCssString(href);
    return [
      `.protyle-wysiwyg [data-node-id] span[data-type~='a'][data-href*='${encodedHref}']:not(:empty)::before`,
      `.protyle-wysiwyg [data-node-id] span[data-type~='url'][data-href*='${encodedHref}']:not(:empty)::before`,
      `.protyle-wysiwyg [data-node-id] a[href*='${encodedHref}']::before`,
      `.b3-typography a[href*='${encodedHref}']::before`,
    ];
  };

  const updateStyle = () => {
    const styleElement = getStyleElement(styleId);
    styleElement.textContent = Object.values(customStyles).join("\n");
  };

  return {
    addIcon(href: string, iconUrl: string, flushStyle = true) {
      customStyles[href] = `${buildSelectors(href).join(",\n")} { content: ""; background-image: ${cssUrl(iconUrl)}; }`;
      if (flushStyle) {
        updateStyle();
      }
    },
    removeIcon(href: string) {
      delete customStyles[href];
      updateStyle();
    },
    removeAllIcons() {
      customStyles = {};
      updateStyle();
    },
    clearStyle() {
      customStyles = {};
      document.getElementById(styleId)?.remove();
    },
    flushStyle() {
      updateStyle();
    },
    markIPLinks(root?: ParentNode) {
      const searchRoot = root ?? document;
      forEachLinkElement(searchRoot, (element, href) => {
        try {
          const url = new URL(href);
          if (isIPAddress(url.hostname)) {
            element.setAttribute("data-ip-address", "true");
          } else {
            element.removeAttribute("data-ip-address");
          }
        } catch {
          element.removeAttribute("data-ip-address");
        }
      });
    },
    markLocalFileLinks(root?: ParentNode) {
      const searchRoot = root ?? document;
      forEachLinkElement(searchRoot, (element, href) => {
        const linkKind = getLocalFileLinkKind(href);
        if (linkKind) {
          element.setAttribute(fileKindAttribute, linkKind);
        } else {
          element.removeAttribute(fileKindAttribute);
        }
      });
    },
    isIPAddress,
  };
}

export async function queryDocIcon(blockId: string): Promise<DocIconInfo | null> {
  return resolveDocIconInfo(blockId, {
    queryBlock: async (id) => {
      const response = await fetchSyncPost("/api/query/sql", {
        stmt: `select type, root_id from blocks where id = ${sqlString(id)} limit 1`,
      });
      if (response.code !== 0) {
        throw new Error(response.msg || `query blocks failed: code=${response.code ?? "unknown"}`);
      }

      const blocks = response.data as { type: string; root_id: string }[];
      return blocks[0] ?? null;
    },
    queryDocInfo: async (docId) => fetchSyncPost("/api/block/getDocInfo", { id: docId }),
  });
}

function cleanupDocIcons(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>(".protyle-wysiwyg [data-node-id] span[data-type='block-ref']")
    .forEach((element) => {
      element.removeAttribute("data-icon-id");
      element.removeAttribute("data-icon-name");
      element.removeAttribute("data-icon-emoji");
      element.removeAttribute(LINK_ICON_DOC_REF_STATUS_ATTRIBUTE);
    });
}

export function hasAppliedDocIcon(element: HTMLElement): boolean {
  return element.hasAttribute("data-icon-name");
}

export function clearDocIconStyle(): void {
  cleanupDocIcons(document);
  document.getElementById(LINK_ICON_DOC_STYLE_ID)?.remove();
}

export function applyDocIcon(element: HTMLElement, icon: DocIconInfo): boolean {
  if (hasAppliedDocIcon(element)) {
    return false;
  }

  if (DOC_ICON_FILTERED_CODES.has(icon.code)) {
    const config = getLinkIconConfig();
    if (!config.showMissingDocRefIcon) {
      return false;
    }
  }

  const isMissingDocIcon =
    icon.refStatus === LINK_ICON_DOC_REF_STATUS_MISSING ||
    icon.code === LINK_ICON_MISSING_DOC_ICON_CODE;
  if (isMissingDocIcon) {
    element.setAttribute(LINK_ICON_DOC_REF_STATUS_ATTRIBUTE, LINK_ICON_DOC_REF_STATUS_MISSING);
  } else {
    element.removeAttribute(LINK_ICON_DOC_REF_STATUS_ATTRIBUTE);
  }

  if (icon.type === "svg" && BUILTIN_DOC_ICON_CODES.has(icon.code)) {
    element.setAttribute("data-icon-name", icon.code);
    return true;
  }

  if (icon.type === "unicode") {
    element.setAttribute("data-icon-name", "emoji");
    element.setAttribute("data-icon-emoji", icon.code);
    return true;
  }

  const styleElement = getStyleElement(LINK_ICON_DOC_STYLE_ID);
  const iconId = `dodo-link-icon-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  element.setAttribute("data-icon-id", iconId);
  element.setAttribute("data-icon-name", "custom");
  const assetUrl = icon.code.startsWith("/") ? icon.code : `/emojis/${icon.code}`;
  styleElement.textContent = `${styleElement.textContent || ""}\n.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-id='${iconId}']::before { background-image: ${cssUrl(assetUrl)}; vertical-align: text-bottom; }`;
  return true;
}

/* data URI 内联 SVG 图标（文件 / 文件夹） */
const DOC_ICON_DEFAULT_VIEW_BOX = "0 0 32 32";
const DOC_ICON_MISSING_DOC_VIEW_BOX = "0 0 20 20";
const DOC_ICON_MASK_FILL = "#000";

const DOC_ICON_FILE_SVG_CONTENT = `
<g transform="matrix(2.0984 0 0 2.0984 -4.9731 -4.9731)">
  <path d="M13.3 14.25a.55.55 0 0 1-.55.55h-5.5a.55.55 0 1 1 0-1.1h5.5a.55.55 0 0 1 .55.55m-.55-1.95a.55.55 0 1 0 0-1.1h-5.5a.55.55 0 0 0 0 1.1z"></path>
  <path d="M6.25 2.375A2.125 2.125 0 0 0 4.125 4.5v11c0 1.174.951 2.125 2.125 2.125h7.5a2.125 2.125 0 0 0 2.125-2.125V8.121c0-.563-.224-1.104-.622-1.502L11.63 2.997a2.13 2.13 0 0 0-1.502-.622zM5.375 4.5c0-.483.392-.875.875-.875h3.7V6.25A2.05 2.05 0 0 0 12 8.3h2.625v7.2a.875.875 0 0 1-.875.875h-7.5a.875.875 0 0 1-.875-.875zm8.691 2.7H12a.95.95 0 0 1-.95-.95V4.184z"></path>
</g>`;

const DOC_ICON_FOLDER_SVG_CONTENT = `
<path d="M30.72 7.456h-14.36l-4.692-4.488c-0.057-0.054-0.135-0.087-0.22-0.088h-10.168c-0.708 0-1.28 0.572-1.28 1.28v23.68c0 0.708 0.572 1.28 1.28 1.28h29.44c0.708 0 1.28-0.572 1.28-1.28v-19.104c0-0.708-0.572-1.28-1.28-1.28zM29.12 26.24h-26.24v-20.48h7.54l4.784 4.576h13.916v15.904z"></path>`;

const DOC_ICON_MISSING_DOC_SVG_CONTENT = `
<path fill-rule="evenodd" clip-rule="evenodd" d="M17 7C17 3.13401 13.866 0 10 0C6.13401 0 3 3.13401 3 7V20L5 18L7.5 20L10 18L12.5 20L15 18L17 20V7ZM9 6.5C9 7.32843 8.32843 8 7.5 8C6.67157 8 6 7.32843 6 6.5C6 5.67157 6.67157 5 7.5 5C8.32843 5 9 5.67157 9 6.5ZM12.5 8C13.3284 8 14 7.32843 14 6.5C14 5.67157 13.3284 5 12.5 5C11.6716 5 11 5.67157 11 6.5C11 7.32843 11.6716 8 12.5 8Z"></path>`;

function createDocIconDataUri(svgContent: string, viewBox = DOC_ICON_DEFAULT_VIEW_BOX): string {
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${DOC_ICON_MASK_FILL}">${svgContent}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svgMarkup)}")`;
}

const DOC_ICON_FILE_DATA_URI = createDocIconDataUri(DOC_ICON_FILE_SVG_CONTENT);
const DOC_ICON_FOLDER_DATA_URI = createDocIconDataUri(DOC_ICON_FOLDER_SVG_CONTENT);
const DOC_ICON_MISSING_DOC_DATA_URI = createDocIconDataUri(
  DOC_ICON_MISSING_DOC_SVG_CONTENT,
  DOC_ICON_MISSING_DOC_VIEW_BOX,
);

export function getDefaultDocIconCss(): string {
  return `
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name]::before {
  content: "";
  display: inline-block;
  width: 1em;
  height: 1em;
  margin-right: 0.2em;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  vertical-align: -0.15em;
}
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name='#iconFile']::before,
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name='#iconFolder']::before {
  background-image: none;
  vertical-align: text-top;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name='#iconFile']::before {
  background-color: var(--b3-theme-on-background);
  -webkit-mask-image: ${DOC_ICON_FILE_DATA_URI};
  mask-image: ${DOC_ICON_FILE_DATA_URI};
  opacity: 0.7;
}
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name='#iconFolder']::before {
  background-color: var(--b3-theme-on-background);
  -webkit-mask-image: ${DOC_ICON_FOLDER_DATA_URI};
  mask-image: ${DOC_ICON_FOLDER_DATA_URI};
  opacity: 0.7;
}
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name='#iconDodoDeletedDoc']::before,
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-dodo-doc-ref-status='missing']::before {
  width: 1.08em;
  height: 1.08em;
  background-image: none;
  vertical-align: -0.18em;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  background-color: var(--b3-theme-on-background);
  -webkit-mask-image: ${DOC_ICON_MISSING_DOC_DATA_URI};
  mask-image: ${DOC_ICON_MISSING_DOC_DATA_URI};
  opacity: 0.68;
}
.protyle-wysiwyg [data-node-id] span[data-type='block-ref'][data-icon-name='emoji']::before {
  content: attr(data-icon-emoji);
  background-image: none;
}
`;
}
