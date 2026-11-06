/** Presentation and native search-type configuration shared by Excalidraw block pickers. */

export interface SiyuanSearchBlock {
  id?: string;
  type?: string;
  subType?: string;
  subtype?: string;
  content?: string;
  name?: string;
  hPath?: string;
  hpath?: string;
  path?: string;
  refText?: string;
  refCount?: number;
  ial?: { icon?: string; [key: string]: string | undefined };
}

export const NATIVE_BLOCK_TYPE_KEYS = [
  "mindmap", "mindmapItem", "customBlock", "document", "heading", "list",
  "listItem", "codeBlock", "mathBlock", "table", "blockquote", "superBlock",
  "paragraph", "htmlBlock", "embedBlock", "databaseBlock", "audioBlock",
  "videoBlock", "iframeBlock", "widgetBlock", "callout", "tabs", "tabItem",
] as const;

const DEFAULT_SEARCH_TYPES = {
  document: true, heading: true, paragraph: true, list: true,
  listItem: true, codeBlock: true, mathBlock: true, table: true,
  blockquote: true, superBlock: true, htmlBlock: true, embedBlock: true,
  databaseBlock: true, iframeBlock: true,
} as const;

/** Search settings in the SiYuan host are already kept in sync with native preferences. */
export function nativeBlockSearchTypes(): Record<string, boolean> {
  try {
    const host = window.parent as typeof window & {
      siyuan?: { config?: { search?: Record<string, unknown> } };
    };
    const search = host.siyuan?.config?.search;
    if (search && typeof search === "object") {
      const entries = NATIVE_BLOCK_TYPE_KEYS
        .filter(name => typeof search[name] === "boolean")
        .map(name => [name, search[name]] as const);
      if (entries.length) return Object.fromEntries(entries);
    }
  } catch { /* Isolated/standalone iframe: use compatibility defaults. */ }
  return { ...DEFAULT_SEARCH_TYPES };
}

/**
 * Use the same reference-search endpoint as SiYuan's native [[ / 【【 menu.
 * Ranking, block type filtering, path formatting and reference counts belong
 * to the SiYuan kernel, not a separately maintained Excalidraw heuristic.
 */
export async function searchNativeBlockReferences(keyword: string, signal: AbortSignal): Promise<SiyuanSearchBlock[]> {
  const response = await fetch("/api/search/searchRefBlock", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      k: keyword,
      id: "",
      rootID: "",
      beforeLen: 64,
      isDatabase: false,
      isSquareBrackets: true,
    }),
    signal,
  });
  if (!response.ok) throw new Error("SiYuan ref search HTTP " + response.status);
  const result = await response.json();
  if (result.code !== 0) throw new Error(result.msg || "思源引用搜索失败");
  if (!Array.isArray(result.data?.blocks)) throw new Error("思源引用搜索结果格式不正确");
  return result.data.blocks as SiyuanSearchBlock[];
}

const svgNS = "http://www.w3.org/2000/svg";

/** SiYuan's native icon IDs for search-result block types. */
export const blockTypeIconName = (type = "", subType = ""): string => {
  switch (type) {
    case "d": case "NodeDocument": return "iconFile";
    case "h": case "NodeHeading": return "iconHeadings";
    case "p": case "NodeParagraph": return "iconParagraph";
    case "l": case "NodeList": return "iconList";
    case "i": case "NodeListItem": return "iconListItem";
    case "c": case "NodeCodeBlock": return "iconCode";
    case "m": case "NodeMathBlock": return "iconMath";
    case "t": case "NodeTable": return "iconTable";
    case "b": case "NodeBlockquote": return "iconQuote";
    case "s": case "NodeSuperBlock": return "iconSuper";
    case "html": case "NodeHTMLBlock": return "iconHTML5";
    case "iframe": case "NodeIFrame": return "iconGlobe";
    case "widget": case "NodeWidget": return "iconBoth";
    case "av": case "NodeAttributeView": return "iconDatabase";
    case "query_embed": case "NodeBlockQueryEmbed": return "iconSQL";
    case "video": case "NodeVideo": return "iconVideo";
    case "audio": case "NodeAudio": return "iconRecord";
    case "mindmap": case "NodeMindmap": return "iconMindmap";
    case "callout": case "NodeCallout": return "iconCallout";
    case "tabs": case "NodeTab": return "iconTabs";
    case "tabItem": case "NodeTabItem": return "iconTabItem";
    default: return subType === "NodeDocument" ? "iconFile" : "iconParagraph";
  }
};

/** Render the actual SiYuan icon symbol when available, avoiding missing SVG <use> in a child iframe. */
function blockIcon(type?: string, subType?: string): SVGSVGElement {
  const iconId = blockTypeIconName(type, subType);
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "dodo-search-type-icon");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  try {
    const source = window.parent.document.getElementById(iconId);
    if (source?.localName.toLowerCase() === "symbol") {
      // The active SiYuan icon theme (e.g. litheness) often defines paint
      // properties on <symbol>, not on its child <path> elements. Copy the
      // inherited SVG presentation attributes to this actual <svg> root,
      // otherwise outlined icons become solid black, cropped fragments.
      const attributes = [
        "viewBox", "preserveAspectRatio", "fill", "fill-opacity",
        "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
        "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
        "opacity", "color", "vector-effect",
      ];
      for (const name of attributes) {
        const value = source.getAttribute(name);
        if (value !== null) svg.setAttribute(name, value);
      }
      // SiYuan's default glyphs may omit viewBox, while their path data uses
      // 1024x1024 coordinates. Do not crop that to the old 32x32 fallback.
      if (!source.hasAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 1024 1024");
      for (const child of Array.from(source.childNodes)) svg.append(child.cloneNode(true));
      if (svg.childNodes.length) return svg;
    }
  } catch { /* Cross-origin or unavailable host symbol. */ }
  // Outline fallback for isolated editor tests, not a dependency on the host's symbol sprite.
  const body = document.createElementNS(svgNS, "path");
  body.setAttribute("d", iconId === "iconParagraph"
    ? "M11 6h15v3H23v17h-3V9h-4v17h-3V9h-2a6 6 0 0 1 0-12z"
    : iconId === "iconHeadings"
      ? "M6 7h3v7h11V7h3v18h-3v-8H9v8H6z"
      : iconId === "iconList" || iconId === "iconListItem"
        ? "M7 9h3v3H7zm6 0h14v2H13zM7 16h3v3H7zm6 0h14v2H13zM7 23h3v3H7zm6 0h14v2H13z"
        : "M8 3h11l7 7v18H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm10 2v7h7M11 17h12M11 21h12");
  body.setAttribute("fill", "none");
  body.setAttribute("stroke", "currentColor");
  body.setAttribute("stroke-width", "1.8");
  body.setAttribute("stroke-linecap", "round");
  body.setAttribute("stroke-linejoin", "round");
  svg.append(body);
  return svg;
}

const clean = (text: unknown) => String(text ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** Safe, case-insensitive highlight: text nodes, never unchecked result HTML. */
function highlight(target: HTMLElement, text: string, keyword: string) {
  if (!keyword.trim()) { target.textContent = text; return; }
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = keyword.toLocaleLowerCase();
  let offset = 0;
  while (offset < text.length) {
    const at = lowerText.indexOf(lowerQuery, offset);
    if (at < 0) { target.append(document.createTextNode(text.slice(offset))); break; }
    if (at > offset) target.append(document.createTextNode(text.slice(offset, at)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + keyword.length);
    target.append(mark);
    offset = at + keyword.length;
  }
}

/** Equivalent information hierarchy to native SiYuan and the quick-input module. */
export function createBlockSearchRow(block: SiyuanSearchBlock, keyword: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "dodo-search-block-row";
  const main = document.createElement("span");
  main.className = "dodo-search-block-main";
  // Document blocks may use a custom native emoji/icon code.
  const iconCode = block.type === "d" || block.type === "NodeDocument" ? block.ial?.icon : undefined;
  if (iconCode && /^(?:[0-9a-f]{4,6})(?:-[0-9a-f]{4,6})*$/i.test(iconCode)) {
    try {
      const emoji = document.createElement("span");
      emoji.className = "dodo-search-type-emoji";
      emoji.textContent = String.fromCodePoint(...iconCode.split("-").map(code => parseInt(code, 16)));
      emoji.setAttribute("aria-hidden", "true");
      main.append(emoji);
    } catch { main.append(blockIcon(block.type, block.subType || block.subtype)); }
  } else main.append(blockIcon(block.type, block.subType || block.subtype));

  const title = document.createElement("span");
  title.className = "dodo-search-block-title";
  const displayText = clean(block.content || block.refText || block.name || block.id);
  highlight(title, displayText, keyword);
  title.title = displayText;
  main.append(title);
  if (typeof block.refCount === "number" && block.refCount > 0) {
    const count = document.createElement("span");
    count.className = "dodo-search-block-count";
    count.textContent = String(block.refCount);
    count.title = "引用次数";
    main.append(count);
  }
  wrapper.append(main);

  const path = clean(block.hPath || block.hpath || block.path);
  if (path) {
    const detail = document.createElement("small");
    detail.className = "dodo-search-block-path";
    detail.textContent = path;
    detail.title = path;
    wrapper.append(detail);
  }
  return wrapper;
}
