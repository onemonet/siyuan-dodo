interface GalleryConfig {
  mode: "masonry" | "grid" | "carousel";
  itemWidth: number;
  itemHeight: number;
  gap: number;
  objectFit: "contain" | "cover";
  background: string;
  borderRadius: number;
}

interface MuuriGrid {
  refreshItems(): MuuriGrid;
  layout(instant?: boolean): MuuriGrid;
  destroy(removeElements?: boolean): MuuriGrid;
}

interface MuuriItem {
  getHeight(): number;
  getMargin(): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

interface MuuriLayoutData {
  id: number;
  items: MuuriItem[];
  slots: number[];
  styles: Record<string, string>;
}

type MuuriLayoutFunction = (
  grid: MuuriGrid,
  layoutId: number,
  items: MuuriItem[],
  width: number,
  height: number,
  callback: (layout: MuuriLayoutData) => void,
) => void;

type MuuriConstructor = new (
  element: HTMLElement,
  options?: Record<string, unknown>,
) => MuuriGrid;

const DEFAULT_CONFIG: GalleryConfig = {
  mode: "masonry",
  itemWidth: 220,
  itemHeight: 160,
  gap: 8,
  objectFit: "contain",
  background: "#00000000",
  borderRadius: 4,
};
const ASSET_ATTR_PREFIX = "custom-data-assets-backup-";
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

const params = new URLSearchParams(window.location.search);
const blockId = params.get("blockId") || getFrameBlockId();
const statusElement = document.getElementById("status") as HTMLElement;
const galleryElement = document.getElementById("gallery") as HTMLElement;
const galleryPage = document.querySelector(".gallery-page") as HTMLElement;
const emptyDropzone = document.getElementById("emptyDropzone") as HTMLElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const emptyUploadButton = document.getElementById("emptyUploadButton") as HTMLButtonElement;
const MuuriCtor = (window as Window & { Muuri?: MuuriConstructor }).Muuri;

let grid: MuuriGrid | null = null;
let masonryResizeObserver: ResizeObserver | null = null;
let currentAssets: string[] = [];
let busy = false;

function getFrameBlockId(): string {
  const frame = window.frameElement as HTMLIFrameElement | null;
  return frame?.parentElement?.parentElement?.getAttribute("data-node-id") || "";
}

async function getBlockAttrs(id: string): Promise<Record<string, string>> {
  const response = await fetch("/api/attr/getBlockAttrs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    throw new Error(`读取相册属性失败: ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.msg || "读取相册属性失败");
  }
  return result.data || {};
}

async function waitForBlockAttrs(id: string): Promise<Record<string, string>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const attrs = await getBlockAttrs(id);
    if (attrs["custom-dodo-block"] === "gallery") {
      return attrs;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  return getBlockAttrs(id);
}

function parseConfig(raw: string | undefined): GalleryConfig {
  let parsed: Partial<GalleryConfig> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object") {
        parsed = value as Partial<GalleryConfig>;
      }
    } catch (_error) {
      parsed = {};
    }
  }

  const mode =
    parsed.mode === "grid" || parsed.mode === "carousel"
      ? parsed.mode
      : "masonry";
  const itemWidth = toInt(parsed.itemWidth, DEFAULT_CONFIG.itemWidth, 96, 800);
  return {
    mode,
    itemWidth,
    itemHeight: toInt(
      parsed.itemHeight,
      mode === "grid" ? itemWidth : DEFAULT_CONFIG.itemHeight,
      96,
      800,
    ),
    gap: toInt(parsed.gap, DEFAULT_CONFIG.gap, 0, 64),
    objectFit:
      parsed.objectFit === "cover" || parsed.objectFit === "contain"
        ? parsed.objectFit
        : mode === "grid"
          ? "cover"
          : "contain",
    background:
      typeof parsed.background === "string" && parsed.background.trim()
        ? parsed.background.trim()
        : DEFAULT_CONFIG.background,
    borderRadius: toInt(
      parsed.borderRadius,
      DEFAULT_CONFIG.borderRadius,
      0,
      32,
    ),
  };
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

const ASSET_ATTR_PATTERN = new RegExp(`^${ASSET_ATTR_PREFIX}(\\d+)$`);

function readStoredAssets(attrs: Record<string, string>): string[] {
  return Object.entries(attrs)
    .map(([key, value]) => {
      const match = key.match(ASSET_ATTR_PATTERN);
      return match ? { index: Number(match[1]), value } : null;
    })
    .filter((item): item is { index: number; value: string } => !!item)
    .sort((left, right) => left.index - right.index)
    .map((item) => normalizeStoragePath(item.value))
    .filter((value): value is string => !!value);
}

function normalizeStoragePath(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (!IMAGE_EXTENSIONS.has(getExtension(url.pathname))) {
        return null;
      }
      return `${url.origin}${decodeURIComponent(url.pathname)}${url.search}${url.hash}`;
    }

    const url = new URL(
      value.startsWith("/") ? value : `/${value}`,
      window.location.origin,
    );
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      !decodedPath.startsWith("/assets/") ||
      decodedPath.split("/").includes("..") ||
      !IMAGE_EXTENSIONS.has(getExtension(decodedPath))
    ) {
      return null;
    }
    return `assets${decodedPath.slice("/assets".length)}${url.search}`;
  } catch (_error) {
    return null;
  }

  return null;
}

function normalizeImageUrl(raw: string): string | null {
  const storagePath = normalizeStoragePath(raw);
  if (!storagePath) {
    return null;
  }

  try {
    const url = /^https?:\/\//i.test(storagePath)
      ? new URL(storagePath)
      : new URL(
          storagePath.startsWith("/") ? storagePath : `/${storagePath}`,
          window.location.origin,
        );
    return url.href;
  } catch (_error) {
    return null;
  }
}

function readImageUrls(attrs: Record<string, string>): string[] {
  return readStoredAssets(attrs)
    .map((asset) => normalizeImageUrl(asset))
    .filter((value): value is string => !!value);
}

function getExtension(path: string): string {
  const dotIndex = path.lastIndexOf(".");
  return dotIndex >= 0 ? path.slice(dotIndex).toLowerCase() : "";
}

function setStatus(message: string, isError = false): void {
  statusElement.hidden = false;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
  galleryElement.hidden = true;
  emptyDropzone.hidden = true;
}

function setBusy(value: boolean): void {
  busy = value;
  fileInput.disabled = value;
  emptyUploadButton.disabled = value;
}

function requestImagePreview(
  url: string,
  alt: string,
  urls: string[] = [url],
  index = 0,
): void {
  window.parent.postMessage(
    {
      type: "dodoGalleryPreviewImage",
      blockId,
      url,
      alt,
      urls,
      index,
    },
    window.location.origin,
  );
}

async function setBlockAttrs(attrs: Record<string, string | null>): Promise<void> {
  const response = await fetch("/api/attr/setBlockAttrs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: blockId, attrs }),
  });
  if (!response.ok) {
    throw new Error(`保存相册属性失败: ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.msg || "保存相册属性失败");
  }
}

async function writeAssets(
  assets: string[],
  existingAttrs?: Record<string, string>,
): Promise<string[]> {
  const existing = existingAttrs || (await getBlockAttrs(blockId));
  const normalizedAssets = assets
    .map((asset) => normalizeStoragePath(asset))
    .filter((asset): asset is string => !!asset);
  const attrs: Record<string, string | null> = {};

  Object.keys(existing).forEach((key) => {
    if (ASSET_ATTR_PATTERN.test(key)) {
      attrs[key] = null;
    }
  });
  normalizedAssets.forEach((asset, index) => {
    attrs[`${ASSET_ATTR_PREFIX}${index}`] = asset;
  });

  await setBlockAttrs(attrs);
  currentAssets = normalizedAssets;
  return normalizedAssets;
}

async function normalizeStoredAttrs(
  attrs: Record<string, string>,
): Promise<Record<string, string>> {
  const indexed = Object.entries(attrs)
    .map(([key, value]) => {
      const match = key.match(ASSET_ATTR_PATTERN);
      return match ? { key, index: Number(match[1]), value } : null;
    })
    .filter(
      (item): item is { key: string; index: number; value: string } => !!item,
    )
    .sort((left, right) => left.index - right.index);
  const assets = readStoredAssets(attrs);
  const needsRewrite =
    indexed.length !== assets.length ||
    indexed.some(
      (item, index) => item.key !== `${ASSET_ATTR_PREFIX}${index}` || item.value !== assets[index],
    );

  if (!needsRewrite) {
    return attrs;
  }

  await writeAssets(assets, attrs);
  const nextAttrs = { ...attrs };
  indexed.forEach((item) => delete nextAttrs[item.key]);
  assets.forEach((asset, index) => {
    nextAttrs[`${ASSET_ATTR_PREFIX}${index}`] = asset;
  });
  return nextAttrs;
}

async function refreshGallery(): Promise<void> {
  const attrs = await normalizeStoredAttrs(await getBlockAttrs(blockId));
  render(attrs);
}

async function appendAssets(assets: string[]): Promise<void> {
  const normalized = assets
    .map((asset) => normalizeStoragePath(asset))
    .filter((asset): asset is string => !!asset);
  const nextAssets = [...currentAssets];
  normalized.forEach((asset) => {
    if (!nextAssets.includes(asset)) {
      nextAssets.push(asset);
    }
  });
  if (nextAssets.length === currentAssets.length) {
    throw new Error("没有新的图片");
  }
  await writeAssets(nextAssets);
  await refreshGallery();
}

async function uploadFiles(files: File[]): Promise<void> {
  if (!files.length || busy) {
    return;
  }

  setBusy(true);
  try {
    const form = new FormData();
    form.append("assetsDirPath", "/assets/");
    files.forEach((file) => form.append("file[]", file));
    const response = await fetch("/api/asset/upload", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(`上传图片失败: ${response.status}`);
    }
    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(result.msg || "上传图片失败");
    }

    const succMap = result.data?.succMap || {};
    const uploaded = files
      .map((file) => succMap[file.name])
      .filter((asset: unknown): asset is string => typeof asset === "string");
    await appendAssets(uploaded);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    fileInput.value = "";
    setBusy(false);
  }
}

function applyConfig(config: GalleryConfig): void {
  const style = galleryElement.style;
  style.setProperty("--gallery-gap", `${config.gap}px`);
  style.setProperty("--gallery-item-width", `${config.itemWidth}px`);
  style.setProperty("--gallery-item-height", `${config.itemHeight}px`);
  style.setProperty("--gallery-object-fit", config.objectFit);
  style.setProperty("--gallery-background", config.background);
  style.setProperty("--gallery-radius", `${config.borderRadius}px`);
}

function createGalleryItem(
  url: string,
  index: number,
  imageUrls: string[],
  config: GalleryConfig,
): HTMLElement {
  const item = document.createElement("div");
  item.className = "gallery-item";
  item.style.width = `${config.itemWidth}px`;
  item.style.height = `${config.itemHeight}px`;

  const content = document.createElement("button");
  content.type = "button";
  content.className = "gallery-item__content";
  content.setAttribute("aria-label", `查看图片 ${index + 1}`);

  const image = document.createElement("img");
  image.src = url;
  image.alt = `图片 ${index + 1}`;
  image.draggable = false;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("load", () => {
    if (config.mode === "masonry" && image.naturalWidth > 0) {
      const itemWidth = item.clientWidth || config.itemWidth;
      item.style.height = `${Math.max(
        96,
        Math.round(itemWidth * image.naturalHeight / image.naturalWidth),
      )}px`;
    }
    grid?.refreshItems().layout();
  });
  image.addEventListener("error", () => {
    item.classList.add("is-error");
    content.disabled = true;
  });
  content.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestImagePreview(url, image.alt, imageUrls, index);
  });

  content.appendChild(image);
  item.appendChild(content);
  return item;
}

function fitMuuriItems(items: HTMLElement[], config: GalleryConfig): void {
  const availableWidth = Math.max(
    1,
    galleryPage.clientWidth || galleryElement.clientWidth,
  );
  const gap = config.gap;
  const columns = getColumnCount(availableWidth, config.itemWidth, gap);
  const itemWidth = Math.max(
    1,
    Math.floor((availableWidth - columns * gap) / columns),
  );

  items.forEach((item) => {
    item.style.width = `${itemWidth}px`;
    if (config.mode === "masonry") {
      const image = item.querySelector<HTMLImageElement>("img");
      if (image?.naturalWidth) {
        item.style.height = `${Math.max(
          96,
          Math.round(itemWidth * image.naturalHeight / image.naturalWidth),
        )}px`;
      }
    }
  });
}

function getColumnCount(availableWidth: number, itemWidth: number, gap: number): number {
  return Math.max(1, Math.floor((availableWidth + gap) / (itemWidth + gap)));
}

function createMuuriLayout(config: GalleryConfig): MuuriLayoutFunction {
  return (_grid, layoutId, items, width, _height, callback) => {
    const availableWidth = Math.max(
      1,
      galleryPage.clientWidth || width,
    );
    const columns = getColumnCount(availableWidth, config.itemWidth, config.gap);
    const columnWidth = availableWidth / columns;
    const columnHeights = Array.from({ length: columns }, () => 0);
    const slots: number[] = [];

    items.forEach((item) => {
      const margin = item.getMargin();
      let column = 0;
      for (let index = 1; index < columnHeights.length; index += 1) {
        if (columnHeights[index] < columnHeights[column]) {
          column = index;
        }
      }

      slots.push(column * columnWidth, columnHeights[column]);
      columnHeights[column] += item.getHeight() + margin.top + margin.bottom;
    });

    callback({
      id: layoutId,
      items,
      slots,
      styles: {
        height: `${Math.max(0, ...columnHeights)}px`,
      },
    });
  };
}

function renderMuuri(imageUrls: string[], config: GalleryConfig): void {
  galleryElement.className = `gallery-grid gallery-mode-${config.mode}`;
  const items = imageUrls.map((url, index) =>
    createGalleryItem(url, index, imageUrls, config),
  );
  items.forEach((item) => galleryElement.appendChild(item));

  grid = new MuuriCtor(galleryElement, {
    items: ".gallery-item",
    dragEnabled: false,
    layout: createMuuriLayout(config),
    layoutOnResize: true,
  });
  const layout = () => {
    fitMuuriItems(items, config);
    grid?.refreshItems().layout(true);
  };
  masonryResizeObserver = new ResizeObserver(layout);
  masonryResizeObserver.observe(galleryElement);
  layout();
}

function renderCarousel(imageUrls: string[], config: GalleryConfig): void {
  galleryElement.className = "gallery-carousel";
  let activeIndex = 0;

  const viewport = document.createElement("div");
  viewport.className = `gallery-carousel__viewport${
    config.objectFit === "contain" ? " gallery-carousel__viewport--blurred" : ""
  }`;
  const background =
    config.objectFit === "contain"
      ? document.createElement("img")
      : null;
  if (background) {
    background.className = "gallery-carousel__background";
    background.alt = "";
    background.setAttribute("aria-hidden", "true");
    background.draggable = false;
    background.addEventListener("error", () => {
      background.classList.add("is-error");
    });
    viewport.appendChild(background);
  }
  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "gallery-carousel__nav gallery-carousel__nav--previous";
  previousButton.setAttribute("aria-label", "上一张图片");
  previousButton.textContent = "‹";
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "gallery-carousel__nav gallery-carousel__nav--next";
  nextButton.setAttribute("aria-label", "下一张图片");
  nextButton.textContent = "›";
  const image = document.createElement("img");
  image.className = `gallery-carousel__image gallery-carousel__image--${config.objectFit}`;
  image.alt = "";
  image.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (image.src) {
      requestImagePreview(image.src, image.alt, imageUrls, activeIndex);
    }
  });
  viewport.append(previousButton, image, nextButton);
  galleryElement.appendChild(viewport);

  const footer = document.createElement("div");
  footer.className = "gallery-carousel__footer";
  const thumbnails = document.createElement("div");
  thumbnails.className = "gallery-carousel__thumbnails";
  footer.appendChild(thumbnails);
  galleryElement.appendChild(footer);

  const show = (index: number) => {
    activeIndex = (index + imageUrls.length) % imageUrls.length;
    if (background) {
      background.classList.remove("is-error");
      background.src = imageUrls[activeIndex];
    }
    image.src = imageUrls[activeIndex];
    image.alt = `图片 ${activeIndex + 1}`;
    thumbnails.querySelectorAll("button").forEach((button, thumbIndex) => {
      button.classList.toggle("is-active", thumbIndex === activeIndex);
    });
  };

  previousButton.addEventListener("click", () => show(activeIndex - 1));
  nextButton.addEventListener("click", () => show(activeIndex + 1));

  imageUrls.forEach((url, index) => {
    const thumbnail = document.createElement("button");
    thumbnail.type = "button";
    thumbnail.className = "gallery-carousel__thumbnail";
    thumbnail.setAttribute("aria-label", `查看图片 ${index + 1}`);
    const thumbnailImage = document.createElement("img");
    thumbnailImage.src = url;
    thumbnailImage.alt = `图片 ${index + 1}`;
    thumbnailImage.draggable = false;
    thumbnail.appendChild(thumbnailImage);
    thumbnail.addEventListener("click", () => show(index));
    thumbnails.appendChild(thumbnail);
  });

  show(0);
}

function render(attrs: Record<string, string>): void {
  masonryResizeObserver?.disconnect();
  masonryResizeObserver = null;
  if (grid) {
    grid.destroy();
    grid = null;
  }
  galleryElement.replaceChildren();

  const config = parseConfig(attrs["custom-dodo-gallery-config"]);
  currentAssets = readStoredAssets(attrs);
  const imageUrls = readImageUrls(attrs);
  applyConfig(config);

  if (!currentAssets.length) {
    statusElement.hidden = true;
    galleryElement.hidden = true;
    emptyDropzone.hidden = false;
    return;
  }
  if (!imageUrls.length) {
    setStatus("相册中的图片无法加载", true);
    return;
  }
  if (config.mode !== "carousel" && !MuuriCtor) {
    setStatus("相册布局库加载失败", true);
    return;
  }

  statusElement.hidden = true;
  emptyDropzone.hidden = true;
  galleryElement.hidden = false;
  if (config.mode === "carousel") {
    renderCarousel(imageUrls, config);
  } else {
    renderMuuri(imageUrls, config);
  }
}

async function initialize(): Promise<void> {
  if (!blockId) {
    setStatus("缺少相册块 ID", true);
    return;
  }

  try {
    render(await normalizeStoredAttrs(await waitForBlockAttrs(blockId)));
  } catch (error) {
    setStatus(`加载相册失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

emptyUploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  void uploadFiles(Array.from(fileInput.files || []));
});
galleryPage.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!busy) {
    galleryPage.classList.add("is-dragover");
  }
});
galleryPage.addEventListener("dragleave", (event) => {
  if (event.relatedTarget instanceof Node && galleryPage.contains(event.relatedTarget)) {
    return;
  }
  galleryPage.classList.remove("is-dragover");
});
galleryPage.addEventListener("drop", (event) => {
  event.preventDefault();
  galleryPage.classList.remove("is-dragover");
  const files = Array.from(event.dataTransfer?.files || []);
  if (!busy && files.length) {
    void uploadFiles(files);
  }
});
window.addEventListener("message", (event) => {
  if (
    event.origin === window.location.origin &&
    event.data?.type === "dodoGalleryRefresh" &&
    event.data.blockId === blockId
  ) {
    void initialize();
  }
});

window.addEventListener("unload", () => {
  masonryResizeObserver?.disconnect();
  grid?.destroy();
});

void initialize();
