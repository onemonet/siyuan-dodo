<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Dialog, showMessage } from "siyuan";
  import Columns3 from "lucide-svelte/icons/columns-3";
  import Copy from "lucide-svelte/icons/copy";
  import Download from "lucide-svelte/icons/download";
  import GalleryHorizontal from "lucide-svelte/icons/gallery-horizontal";
  import GripVertical from "lucide-svelte/icons/grip-vertical";
  import Grid3X3 from "lucide-svelte/icons/grid-3x3";
  import ImagePlus from "lucide-svelte/icons/image-plus";
  import Info from "lucide-svelte/icons/info";
  import Link2 from "lucide-svelte/icons/link-2";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import Upload from "lucide-svelte/icons/upload";
  import JSZip from "jszip";

  import { getBlockAttrs, upload } from "../../api";
  import {
    GALLERY_CONFIG_ATTR,
    GalleryBlockService,
  } from "./services/gallery-block-service";
  import { DEFAULT_GALLERY_CONFIG } from "./types";
  import type {
    GalleryConfig,
    GalleryDisplayMode,
  } from "./types";

  export let galleryBlockId: string;

  const MODES: Array<{
    value: GalleryDisplayMode;
    label: string;
    icon: any;
  }> = [
    { value: "masonry", label: "瀑布流", icon: Columns3 },
    { value: "grid", label: "网格", icon: Grid3X3 },
    { value: "carousel", label: "轮播", icon: GalleryHorizontal },
  ];
  type NumberKey = "itemWidth" | "itemHeight" | "gap" | "borderRadius";

  let loading = true;
  let errorMsg = "";
  let assets: string[] = [];
  let config: GalleryConfig = { ...DEFAULT_GALLERY_CONFIG };
  let linkInput = "";
  let dragOver = false;
  let dragIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let saving = false;
  let downloading = false;
  let imageInfoDialog: Dialog | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInput: HTMLInputElement;
  let numberDrafts: Record<NumberKey, string> = {
    itemWidth: String(DEFAULT_GALLERY_CONFIG.itemWidth),
    itemHeight: String(DEFAULT_GALLERY_CONFIG.itemHeight),
    gap: String(DEFAULT_GALLERY_CONFIG.gap),
    borderRadius: String(DEFAULT_GALLERY_CONFIG.borderRadius),
  };

  onMount(() => {
    void loadContext();
  });

  onDestroy(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    imageInfoDialog?.destroy();
  });

  async function loadContext() {
    try {
      const attrs = await getBlockAttrs(galleryBlockId);
      assets = GalleryBlockService.readIndexedAssets(attrs);
      config = GalleryBlockService.parseConfig(attrs[GALLERY_CONFIG_ATTR]);
      syncNumberDrafts(config);
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  function imageSrc(asset: string): string {
    return encodeURI(/^https?:\/\//i.test(asset) ? asset : `/${asset}`);
  }

  function scheduleSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveGallery();
    }, 300);
  }

  async function saveGallery(nextAssets = assets) {
    saving = true;
    try {
      const result = await GalleryBlockService.updateGallery(
        galleryBlockId,
        nextAssets,
        config,
      );
      if (!result.success) {
        showMessage(result.message || "保存相册设置失败");
        return false;
      }
      assets = nextAssets;
      config = GalleryBlockService.parseConfig(JSON.stringify(config));
      return true;
    } finally {
      saving = false;
    }
  }

  function setMode(mode: GalleryDisplayMode) {
    if (config.mode === mode) {
      return;
    }
    const nextConfig = { ...config, mode };
    if (mode === "carousel") {
      nextConfig.objectFit = "contain";
    } else if (mode === "grid") {
      nextConfig.objectFit = "cover";
      nextConfig.itemHeight = nextConfig.itemWidth;
    }
    config = nextConfig;
    if (mode === "grid") {
      numberDrafts = { ...numberDrafts, itemHeight: String(nextConfig.itemHeight) };
    }
    scheduleSave();
  }

  function setNumber(
    key: NumberKey,
    raw: string,
  ) {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return;
    }
    const ranges = {
      itemWidth: [96, 800],
      itemHeight: [96, 800],
      gap: [0, 64],
      borderRadius: [0, 32],
    } as const;
    const [min, max] = ranges[key];
    const nextConfig = {
      ...config,
      [key]: Math.min(max, Math.max(min, Math.round(value))),
    };
    if (
      key === "itemWidth" &&
      config.mode === "grid" &&
      config.itemHeight === config.itemWidth
    ) {
      nextConfig.itemHeight = nextConfig.itemWidth;
    }
    config = nextConfig;
    scheduleSave();
  }

  function syncNumberDrafts(nextConfig: GalleryConfig) {
    numberDrafts = {
      itemWidth: String(nextConfig.itemWidth),
      itemHeight: String(nextConfig.itemHeight),
      gap: String(nextConfig.gap),
      borderRadius: String(nextConfig.borderRadius),
    };
  }

  function updateNumberDraft(key: NumberKey, raw: string) {
    numberDrafts = { ...numberDrafts, [key]: raw };
  }

  function commitNumber(key: NumberKey) {
    const raw = numberDrafts[key].trim();
    if (raw) {
      setNumber(key, raw);
    }
    numberDrafts = { ...numberDrafts, [key]: String(config[key]) };
  }

  function handleNumberKeydown(key: NumberKey, event: KeyboardEvent) {
    if (event.key === "Enter") {
      commitNumber(key);
    }
  }

  function setObjectFit(value: string) {
    config = { ...config, objectFit: value === "cover" ? "cover" : "contain" };
    scheduleSave();
  }

  function setBackground(value: string) {
    config = { ...config, background: value };
    scheduleSave();
  }

  function validImageFile(file: File): boolean {
    return file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
  }

  function fieldValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
  }

  function selectedFiles(event: Event): File[] {
    return Array.from((event.currentTarget as HTMLInputElement).files || []);
  }

  async function uploadFiles(files: File[]) {
    const imageFiles = files.filter(validImageFile);
    if (!imageFiles.length || saving) {
      return;
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    saving = true;
    try {
      const result = await upload("/assets/", imageFiles);
      const uploaded = imageFiles
        .map((file) => result?.succMap?.[file.name])
        .filter((asset): asset is string => typeof asset === "string")
        .map((asset) => GalleryBlockService.normalizeImagePath(asset))
        .filter((asset): asset is string => !!asset);
      const nextAssets = [...assets];
      uploaded.forEach((asset) => {
        if (!nextAssets.includes(asset)) {
          nextAssets.push(asset);
        }
      });
      if (!uploaded.length) {
        throw new Error("没有上传成功的图片");
      }
      const updateResult = await GalleryBlockService.updateGallery(
        galleryBlockId,
        nextAssets,
        config,
      );
      if (!updateResult.success) {
        throw new Error(updateResult.message || "保存图片失败");
      }
      assets = nextAssets;
      showMessage(`已添加 ${uploaded.length} 张图片`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      saving = false;
      if (fileInput) {
        fileInput.value = "";
      }
    }
  }

  async function addLink() {
    const extracted = extractImagePaths(linkInput);
    if (!extracted.length) {
      const asset = GalleryBlockService.normalizeImagePath(linkInput);
      if (asset) {
        extracted.push(asset);
      }
    }
    if (!extracted.length) {
      showMessage("请输入有效的图片路径或图片链接");
      return;
    }

    const nextAssets = [...assets];
    const added = extracted.filter((asset) => {
      if (nextAssets.includes(asset)) {
        return false;
      }
      nextAssets.push(asset);
      return true;
    });
    if (!added.length) {
      linkInput = "";
      showMessage("提取到的图片都已在相册中");
      return;
    }

    if (await saveGallery(nextAssets)) {
      linkInput = "";
      showMessage(added.length === 1 ? "已添加图片" : `已提取并添加 ${added.length} 张图片`);
    }
  }

  function handleLinkPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || !/[\r\n]/.test(text)) {
      return;
    }
    event.preventDefault();
    linkInput = text.replace(/\s*\r?\n\s*/g, " ").trim();
  }

  function extractImagePaths(raw: string): string[] {
    const extracted = new Set<string>();
    const addCandidate = (value: string) => {
      const candidate = value
        .trim()
        .replace(/^<|>$/g, "")
        .replace(/\s+(?:"[^"]*"|'[^']*')\s*$/, "");
      const asset = GalleryBlockService.normalizeImagePath(candidate);
      if (asset) {
        extracted.add(asset);
      }
    };

    const markdownImagePattern = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)]+?))\s*\)/g;
    for (const match of raw.matchAll(markdownImagePattern)) {
      addCandidate(match[1] || match[2] || "");
    }

    const htmlImagePattern = /\bsrc\s*=\s*["']([^"']+)["']/gi;
    for (const match of raw.matchAll(htmlImagePattern)) {
      addCandidate(match[1] || "");
    }

    const assetPathPattern = /(?:^|[\s"'(<])((?:\/?assets\/)[^)\]"'<>]*?\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:\?[^)\]"'<>]*)?)(?=\s*(?:\/?assets\/|[)\]"'<>]|$))/gi;
    for (const match of raw.matchAll(assetPathPattern)) {
      addCandidate(match[1] || "");
    }

    return Array.from(extracted);
  }

  async function removeAsset(index: number) {
    if (saving || !assets[index]) {
      return;
    }
    if (!window.confirm("确定从相册中删除这张图片吗？")) {
      return;
    }
    await saveGallery(assets.filter((_asset, assetIndex) => assetIndex !== index));
  }

  function showAssetInfo(index: number) {
    const asset = assets[index];
    if (!asset) {
      return;
    }

    imageInfoDialog?.destroy();
    const dialog = new Dialog({
      title: "图片信息",
      content: `<div class="dodo-gallery-image-info">
        <div class="dodo-gallery-image-info__preview"><img data-info-preview /></div>
        <dl class="dodo-gallery-image-info__details">
          <div><dt>名称</dt><dd data-info="name"></dd></div>
          <div><dt>文件大小</dt><dd data-info="size">读取中…</dd></div>
          <div><dt>像素尺寸</dt><dd data-info="dimensions">读取中…</dd></div>
          <div><dt>格式</dt><dd data-info="format"></dd></div>
          <div><dt>相册位置</dt><dd data-info="position"></dd></div>
          <div><dt>来源</dt><dd data-info="source"></dd></div>
        </dl>
        <div class="dodo-gallery-image-info__path">
          <span>路径</span>
          <code data-info="path"></code>
        </div>
      </div>`,
      width: "min(620px, 92vw)",
      destroyCallback: () => {
        if (imageInfoDialog === dialog) {
          imageInfoDialog = null;
        }
      },
    });
    imageInfoDialog = dialog;
    dialog.element.querySelector(".b3-dialog__close")?.classList.remove("fn__none");

    const name = assetFileName(asset, index);
    const setInfo = (key: string, value: string) => {
      const element = dialog.element.querySelector<HTMLElement>(`[data-info="${key}"]`);
      if (element) {
        element.textContent = value;
      }
    };
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toUpperCase() : "未知";
    const image = dialog.element.querySelector<HTMLImageElement>("[data-info-preview]");

    setInfo("name", name);
    setInfo("format", extension);
    setInfo("position", `${index + 1} / ${assets.length}`);
    setInfo("source", /^https?:\/\//i.test(asset) ? "网络图片" : "本地图片");
    setInfo("path", asset);

    if (image) {
      const updateDimensions = () => {
        setInfo(
          "dimensions",
          image.naturalWidth && image.naturalHeight
            ? `${image.naturalWidth} × ${image.naturalHeight} px`
            : "无法读取",
        );
      };
      image.alt = name;
      image.addEventListener("load", updateDimensions, { once: true });
      image.addEventListener("error", () => setInfo("dimensions", "无法读取"), { once: true });
      image.src = imageSrc(asset);
      if (image.complete) {
        updateDimensions();
      }
    }

    void fetch(imageSrc(asset), { method: "HEAD" })
      .then((response) => {
        const contentLength = response.headers.get("content-length");
        const bytes = contentLength === null ? NaN : Number(contentLength);
        setInfo(
          "size",
          response.ok && Number.isFinite(bytes) && bytes >= 0
            ? formatFileSize(bytes)
            : "无法获取",
        );
      })
      .catch(() => setInfo("size", "无法获取"));
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function markdownDestination(asset: string): string {
    return /[\s()<>]/.test(asset) ? `<${asset}>` : asset;
  }

  function buildMarkdown(): string {
    return assets
      .map((asset, index) => `![图片 ${index + 1}](${markdownDestination(asset)})`)
      .join("\n\n");
  }

  async function copyMarkdown() {
    if (!assets.length) {
      return;
    }

    try {
      const markdown = buildMarkdown();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = markdown;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        if (!document.execCommand("copy")) {
          throw new Error("剪贴板不可用");
        }
        textarea.remove();
      }
      showMessage(`已复制 ${assets.length} 张图片的 Markdown`);
    } catch (error) {
      showMessage(error instanceof Error ? `复制失败：${error.message}` : "复制 Markdown 失败");
    }
  }

  function assetFileName(asset: string, index: number): string {
    try {
      const url = /^https?:\/\//i.test(asset)
        ? new URL(asset)
        : new URL(`/${asset}`, window.location.origin);
      const path = decodeURIComponent(url.pathname);
      const name = path.slice(path.lastIndexOf("/") + 1).trim();
      return name || `image-${index + 1}`;
    } catch (_error) {
      return `image-${index + 1}`;
    }
  }

  function uniqueFileName(name: string, usedNames: Set<string>): string {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    const extensionIndex = name.lastIndexOf(".");
    const base = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
    const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
    let suffix = 2;
    let candidate = `${base} (${suffix})${extension}`;
    while (usedNames.has(candidate)) {
      suffix += 1;
      candidate = `${base} (${suffix})${extension}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  async function downloadImages() {
    if (!assets.length || downloading) {
      return;
    }

    downloading = true;
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (const [index, asset] of assets.entries()) {
        const response = await fetch(imageSrc(asset));
        if (!response.ok) {
          throw new Error(`第 ${index + 1} 张图片下载失败`);
        }
        zip.file(uniqueFileName(assetFileName(asset, index), usedNames), await response.blob());
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gallery-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showMessage(`已打包 ${assets.length} 张图片`);
    } catch (error) {
      showMessage(error instanceof Error ? `下载失败：${error.message}` : "下载图片包失败");
    } finally {
      downloading = false;
    }
  }

  function startAssetDrag(index: number, event: DragEvent) {
    if (saving) {
      return;
    }
    dragIndex = index;
    dragOverIndex = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleAssetDragOver(index: number, event: DragEvent) {
    if (dragIndex === null || dragIndex === index || saving) {
      return;
    }
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleAssetDragLeave(index: number) {
    if (dragOverIndex === index) {
      dragOverIndex = null;
    }
  }

  async function dropAsset(index: number, event: DragEvent) {
    event.preventDefault();
    const fromIndex = dragIndex;
    dragIndex = null;
    dragOverIndex = null;
    if (saving || fromIndex === null || fromIndex === index) {
      return;
    }

    const nextAssets = [...assets];
    const [moved] = nextAssets.splice(fromIndex, 1);
    if (moved) {
      nextAssets.splice(index, 0, moved);
      await saveGallery(nextAssets);
    }
  }

  function finishAssetDrag() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    void uploadFiles(Array.from(event.dataTransfer?.files || []));
  }
</script>

<div class="gallery-settings">
  {#if loading}
    <div class="gallery-settings__state">加载中…</div>
  {:else if errorMsg}
    <div class="gallery-settings__state gallery-settings__state--error">{errorMsg}</div>
  {:else}
    <div class="section-title"><SlidersHorizontal size={14} strokeWidth={2} /> 展示版式</div>
    <div class="mode-row">
      {#each MODES as mode (mode.value)}
        <button
          class="mode-button"
          class:is-active={config.mode === mode.value}
          disabled={saving}
          title={mode.label}
          on:click={() => setMode(mode.value)}
        >
          <svelte:component this={mode.icon} size={18} strokeWidth={1.8} />
          <span>{mode.label}</span>
        </button>
      {/each}
    </div>

    <div class="section-title"><ImagePlus size={14} strokeWidth={2} /> 图片管理 <span class="count">{assets.length}</span></div>
    <div
      class="dropzone"
      class:is-dragover={dragOver}
      role="region"
      aria-label="拖入图片上传区域"
      on:dragover|preventDefault={() => (dragOver = true)}
      on:dragleave={() => (dragOver = false)}
      on:drop={handleDrop}
    >
      <Upload size={20} strokeWidth={1.8} />
      <span>拖入图片，或</span>
      <button class="b3-button b3-button--outline text-button" disabled={saving} on:click={() => fileInput?.click()}>
        选择图片
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*,.avif,.bmp,.gif,.jpeg,.jpg,.png,.svg,.webp"
        multiple
        hidden
        on:change={(event) => uploadFiles(selectedFiles(event))}
      />
    </div>
    <form class="link-form" on:submit|preventDefault={addLink}>
      <Link2 size={16} strokeWidth={1.8} />
      <input
        class="b3-text-field"
        disabled={saving}
        placeholder="粘贴图片链接或思源块内容"
        on:paste={handleLinkPaste}
      />
      <button class="b3-button b3-button--outline text-button" type="submit" disabled={saving || !linkInput.trim()}>添加</button>
    </form>

    {#if assets.length}
      <div class="asset-list" role="list">
        {#each assets as asset, index (asset)}
          <div
            class="asset-row"
            role="listitem"
            class:is-dragging={dragIndex === index}
            class:is-drag-over={dragOverIndex === index}
            draggable={!saving}
            on:dragstart={(event) => startAssetDrag(index, event)}
            on:dragover={(event) => handleAssetDragOver(index, event)}
            on:dragleave={() => handleAssetDragLeave(index)}
            on:drop={(event) => dropAsset(index, event)}
            on:dragend={finishAssetDrag}
          >
            <span class="drag-handle" title="拖动排序" aria-hidden="true">
              <GripVertical size={17} strokeWidth={1.8} />
            </span>
            <img src={imageSrc(asset)} alt={`图片 ${index + 1}`} draggable="false" loading="lazy" />
            <span class="asset-label">图片 {index + 1}</span>
            <button
              class="icon-button"
              title="查看图片信息"
              aria-label={`查看图片 ${index + 1} 信息`}
              disabled={saving}
              on:click={() => showAssetInfo(index)}
            >
              <Info size={16} strokeWidth={2} />
            </button>
            <button
              class="icon-button"
              title="删除图片"
              aria-label={`删除图片 ${index + 1}`}
              disabled={saving}
              on:click={() => removeAsset(index)}
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">当前块没有可用图片，可以上传或添加图片链接。</div>
    {/if}

    <div class="section-title"><Download size={14} strokeWidth={2} /> 相册操作</div>
    <div class="action-row">
      <button class="b3-button b3-button--outline action-button" disabled={!assets.length || saving || downloading} on:click={copyMarkdown}>
        <Copy size={15} strokeWidth={1.8} />
        <span>复制 Markdown</span>
      </button>
      <button class="b3-button b3-button--outline action-button" disabled={!assets.length || saving || downloading} on:click={downloadImages}>
        <Download size={15} strokeWidth={1.8} />
        <span>下载图片包</span>
      </button>
    </div>

    <div class="section-title">相册样式</div>
    {#if config.mode !== "carousel"}
      <div class="row">
        <label for="gallery-item-width">{config.mode === "masonry" ? "列宽基准" : "图片宽度"}</label>
        <input
          id="gallery-item-width" class="b3-text-field"
          type="number"
          min="96"
          max="800"
          value={numberDrafts.itemWidth}
          on:input={(event) => updateNumberDraft("itemWidth", fieldValue(event))}
          on:change={() => commitNumber("itemWidth")}
          on:blur={() => commitNumber("itemWidth")}
          on:keydown={(event) => handleNumberKeydown("itemWidth", event)}
        />
      </div>
    {/if}
    {#if config.mode === "grid"}
      <div class="row">
        <label for="gallery-item-height">图片高度</label>
        <input
          id="gallery-item-height" class="b3-text-field"
          type="number"
          min="96"
          max="800"
          value={numberDrafts.itemHeight}
          on:input={(event) => updateNumberDraft("itemHeight", fieldValue(event))}
          on:change={() => commitNumber("itemHeight")}
          on:blur={() => commitNumber("itemHeight")}
          on:keydown={(event) => handleNumberKeydown("itemHeight", event)}
        />
      </div>
    {/if}
    {#if config.mode !== "carousel"}
      <div class="row">
        <label for="gallery-gap">图片间距</label>
        <input
          id="gallery-gap" class="b3-text-field"
          type="number"
          min="0"
          max="64"
          value={numberDrafts.gap}
          on:input={(event) => updateNumberDraft("gap", fieldValue(event))}
          on:change={() => commitNumber("gap")}
          on:blur={() => commitNumber("gap")}
          on:keydown={(event) => handleNumberKeydown("gap", event)}
        />
      </div>
    {/if}
    {#if config.mode !== "masonry"}
      <div class="row">
        <label for="gallery-fit">图片填充</label>
        <select id="gallery-fit" class="b3-select" value={config.objectFit} on:change={(event) => setObjectFit(fieldValue(event))}>
          <option value="contain">完整显示</option>
          <option value="cover">填满裁切</option>
        </select>
      </div>
    {/if}
    {#if config.mode !== "carousel"}
      <div class="row">
        <label for="gallery-background">背景颜色</label>
        <input id="gallery-background" class="b3-text-field color-text" type="text" value={config.background} on:input={(event) => setBackground(fieldValue(event))} />
      </div>
    {/if}
    <div class="row">
      <label for="gallery-radius">圆角</label>
      <input
        id="gallery-radius" class="b3-text-field"
        type="number"
        min="0"
        max="32"
        value={numberDrafts.borderRadius}
        on:input={(event) => updateNumberDraft("borderRadius", fieldValue(event))}
        on:change={() => commitNumber("borderRadius")}
        on:blur={() => commitNumber("borderRadius")}
        on:keydown={(event) => handleNumberKeydown("borderRadius", event)}
      />
    </div>

    <div class="footer">{saving ? "保存中…" : "修改会自动写回相册块"}</div>
  {/if}
</div>

<style>
  .gallery-settings {
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: 4px 8px 14px;
    color: var(--b3-theme-on-surface);
    font-size: 14px;
  }

  .gallery-settings :global(svg) {
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  .gallery-settings :global(svg *) {
    fill: none !important;
    stroke: inherit !important;
  }

  .gallery-settings__state {
    padding: 28px 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .gallery-settings__state--error {
    color: var(--b3-theme-error, #d23f31);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 14px 0 7px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    font-weight: 600;
  }

  .count {
    color: var(--b3-theme-primary);
    font-weight: 400;
  }

  .mode-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }

  .mode-button {
    display: flex;
    min-height: 64px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .mode-button.is-active {
    border-color: var(--b3-theme-primary);
    background: var(--b3-theme-primary-lightest, rgba(53, 117, 240, 0.1));
    color: var(--b3-theme-primary);
  }

  .mode-button:disabled,
  .text-button:disabled,
  .icon-button:disabled,
  .action-button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .action-button {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 12px;
  }

  .dropzone {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 52px;
    padding: 8px;
    border: 1px dashed var(--b3-border-color);
    border-radius: 7px;
    color: var(--b3-theme-on-surface-light);
    transition: border-color 120ms ease, background 120ms ease;
  }

  .dropzone.is-dragover {
    border-color: var(--b3-theme-primary);
    background: var(--b3-theme-primary-lightest, rgba(53, 117, 240, 0.1));
  }

  .text-button {
    flex: 0 0 auto;
    color: var(--b3-theme-primary);
  }

  .link-form {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
  }

  .link-form input,
  .row input,
  .row select {
    min-width: 0;
    box-sizing: border-box;
    font-size: 13px;
  }

  .link-form input {
    flex: 1;
    height: 28px;
    padding: 0 7px;
    font-size: 12px;
  }

  .asset-list {
    display: grid;
    gap: 4px;
    margin-top: 8px;
  }

  .asset-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    min-height: 58px;
    padding: 3px 4px;
    border-radius: 6px;
    transition: background 120ms ease, outline-color 120ms ease;
  }

  .asset-row.is-dragging {
    opacity: 0.45;
  }

  .asset-row.is-drag-over {
    outline: 1px solid var(--b3-theme-primary);
    background: var(--b3-theme-primary-lightest, rgba(53, 117, 240, 0.1));
  }

  .drag-handle {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    color: var(--b3-theme-on-surface-light);
    cursor: grab;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .asset-row img {
    width: 64px;
    height: 52px;
    flex: 0 0 auto;
    border-radius: 4px;
    background: var(--b3-theme-background-light);
    object-fit: cover;
  }

  .asset-label {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .icon-button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: 0;
    background: transparent;
    color: var(--b3-theme-on-surface-light);
    cursor: pointer;
  }

  .icon-button:hover {
    color: var(--b3-theme-error, #d23f31);
  }

  .empty-state {
    padding: 12px 8px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
  }

  .row label {
    white-space: nowrap;
  }

  .row input,
  .row select {
    width: 132px;
    height: 28px;
    padding: 0 6px;
    flex: 0 0 auto;
  }

  .row input[type="number"] {
    text-align: right;
  }

  .row .color-text {
    text-align: left;
  }

  .footer {
    margin-top: 14px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    text-align: center;
  }

  :global(.dodo-gallery-image-info) {
    display: grid;
    grid-template-columns: minmax(160px, 0.8fr) minmax(0, 1.2fr);
    gap: 12px;
    padding: 8px 16px 16px;
    color: var(--b3-theme-on-surface);
  }

  :global(.dodo-gallery-image-info__preview) {
    display: flex;
    min-height: 190px;
    max-height: 320px;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 6px;
    background: var(--b3-theme-background-light);
  }

  :global(.dodo-gallery-image-info__preview img) {
    display: block;
    width: 100%;
    max-height: 320px;
    object-fit: contain;
  }

  :global(.dodo-gallery-image-info__details) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 7px;
    margin: 0;
  }

  :global(.dodo-gallery-image-info__details > div) {
    min-width: 0;
    padding: 8px 9px;
    border-radius: 5px;
    background: var(--b3-theme-background-light);
  }

  :global(.dodo-gallery-image-info__details dt),
  :global(.dodo-gallery-image-info__path span) {
    color: var(--b3-theme-on-surface-light);
    font-size: 11px;
  }

  :global(.dodo-gallery-image-info__details dd) {
    overflow-wrap: anywhere;
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 500;
  }

  :global(.dodo-gallery-image-info__path) {
    display: grid;
    grid-column: 1 / -1;
    gap: 5px;
    min-width: 0;
    padding: 8px 9px;
    border-radius: 5px;
    background: var(--b3-theme-background-light);
  }

  :global(.dodo-gallery-image-info__path code) {
    overflow-wrap: anywhere;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    line-height: 1.5;
  }

  @media (max-width: 560px) {
    :global(.dodo-gallery-image-info) {
      grid-template-columns: minmax(0, 1fr);
    }

    :global(.dodo-gallery-image-info__preview) {
      max-height: 220px;
    }

    :global(.dodo-gallery-image-info__preview img) {
      max-height: 220px;
    }
  }
</style>
