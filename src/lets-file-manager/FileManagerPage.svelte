<script lang="ts">
  import { onMount } from "svelte";
  import { Dialog, DropdownMenu, Popover } from "bits-ui";
  import { showMessage, openTab } from "siyuan";
  import { plugin } from "../utils";
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import Check from "lucide-svelte/icons/check";
  import Minus from "lucide-svelte/icons/minus";
  import Plus from "lucide-svelte/icons/plus";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Copy from "lucide-svelte/icons/copy";
  import Download from "lucide-svelte/icons/download";
  import File from "lucide-svelte/icons/file";
  import FileText from "lucide-svelte/icons/file-text";
  import FileCode from "lucide-svelte/icons/file-code";
  import PanelLeftOpen from "lucide-svelte/icons/panel-left-open";
  import PanelLeftClose from "lucide-svelte/icons/panel-left-close";
  import PanelRightOpen from "lucide-svelte/icons/panel-right-open";
  import PanelRightClose from "lucide-svelte/icons/panel-right-close";
  import Film from "lucide-svelte/icons/film";
  import Folder from "lucide-svelte/icons/folder";
  import FolderOpen from "lucide-svelte/icons/folder-open";
  import FolderPlus from "lucide-svelte/icons/folder-plus";
  import Grid2X2 from "lucide-svelte/icons/grid-2x2";
  import Image from "lucide-svelte/icons/image";
  import ImageDown from "lucide-svelte/icons/image-down";
  import Info from "lucide-svelte/icons/info";
  import LayoutList from "lucide-svelte/icons/layout-list";
  import Link2 from "lucide-svelte/icons/link-2";
  import Pencil from "lucide-svelte/icons/pencil";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Search from "lucide-svelte/icons/search";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import FilterIcon from "lucide-svelte/icons/filter";
  import ArrowDownWideNarrow from "lucide-svelte/icons/arrow-down-wide-narrow";
  import Upload from "lucide-svelte/icons/upload";
  import X from "lucide-svelte/icons/x";
  import {
    assetKind,
    assetRelativePath,
    assetUrl,
    createAssetFolder,
    deepScanAssetDirectory,
    findAssetReferences,
    getCachedAssetDirectory,
    getReadableReferencePaths,
    getReferenceDocumentId,
    invalidateAssetDirectory,
    formatDate,
    formatSize,
    getAssetSize,
    readAssetDirectory,
    renameAsset,
    saveAssetFile,
    type AssetEntry,
    type AssetKind,
    type AssetReference,
  } from "./file-service";
  import {
    filterAndSortFiles,
    collectFileExtensions,
    fileSizeOptions,
    type FileSizeFilter,
    type FileSortMode,
  } from "./filter-utils";
  import {
    createCompressionPreview,
    commitCompression,
    replaceImageAsset,
    compressionFormatOptions,
    supportsImageCompression,
    type CompressionFormat,
  } from "./image-compression";
  import {
    prepareCompressionBatch,
    selectedBatchRecords,
    batchCompressionSummary,
    MAX_COMPRESSION_BATCH,
    type BatchCompressionRecord,
    type BatchCompressionSource,
  } from "./batch-compression";
  import {
    applyMarqueeChoice,
    marqueeBounds,
    intersectsMarquee,
    type MarqueePoint,
    type MarqueeRect,
  } from "./selection-marquee";
  import "./file-manager.css";

  type FolderRow = { path: string; name: string; depth: number; hasChildren: boolean };
  const kindNames: Record<AssetKind, string> = {
    image: "图片", video: "视频", audio: "音频",
    document: "文档", archive: "压缩包", other: "其他",
  };
  const sortOptions: { value: FileSortMode; label: string }[] = [
    { value: "updated", label: "修改时间" },
    { value: "name", label: "文件名" },
    { value: "type", label: "文件类型" },
    { value: "size", label: "文件大小" },
  ];
  const INITIAL_PAGE_SIZE = 48;

  let currentFolder = "";
  let entries: AssetEntry[] = [];
  let folderChildren: Record<string, string[]> = {};
  let expanded: Record<string, boolean> = { "": true };
  let searchText = "";
  let selectedExtensions: string[] = [];
  let formatSearch = "";
  let sizeFilter: FileSizeFilter = "all";
  let sortMode: FileSortMode = "updated";
  let sizeByPath: Record<string, number> = {};
  // Lazy, viewport-scoped size loading for the list view. The file-service
  // statAsset cache deduplicates these requests with inspector/sort/filter reads.
  let listSizeUnavailable: Record<string, boolean> = {};
  const listSizeQueued = new Set<string>();
  const listSizeQueue: Array<{ folder: string; path: string; updated: number }> = [];
  let listSizeActive = 0;
  let sizeLoading = false;
  let sizeProgress = 0;
  let sizeTotal = 0;
  let sizeLoadSerial = 0;
  let historyPaths = [""];
  let historyIndex = 0;
  let keywordOpen = false;
  let typeOpen = false;
  let sizeOpen = false;
  let sortOpen = false;
  let viewMode: "grid" | "list" = "grid";
  let zoom = 174;
  let limit = INITIAL_PAGE_SIZE;
  let selected: AssetEntry | null = null;
  let selectedFileNames: string[] = [];
  let selectionAnchor: string | null = null;
  type MarqueeCandidate = {
    pointerId: number;
    startClient: MarqueePoint;
    origin: MarqueePoint;
    base: string[];
    mode: "replace" | "add" | "toggle";
    active: boolean;
  };
  let marqueeCandidate: MarqueeCandidate | null = null;
  let marqueeOverlay: MarqueeRect | null = null;
  let marqueeClientPoint: MarqueePoint = { x: 0, y: 0 };
  let marqueeScrollFrame = 0;
  let suppressMarqueeClickUntil = 0;
  let refs: AssetReference[] | null = null;
  let ocrReferenceCount = 0;
  let referenceDocPaths: Record<string, string | null> = {};
  let referencePathsLoading = false;
  let referencePathsResolved = 0;
  let referencePathsTotal = 0;
  let referenceRequestSerial = 0;
  let refsLoading = false;
  let detailsSize: number | null = null;
  let dimensions = "";
  let loading = true;
  let refreshing = false;
  let busy = false;
  let error = "";
  // Reuse image URLs between visits. Only replaced files need an explicit revision.
  let mediaRevisions: Record<string, string> = {};
  let scrollContainer: HTMLDivElement;
  let layoutElement: HTMLDivElement;
  let leftOpen = true;
  let leftWidth = 210;
  let rightWidth = 290;
  let resizeSide: "left" | "right" | null = null;
  let resizePointer = -1;
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  let inspectOpen = true;
  let previewOpen = false;
  let compressionOpen = false;
  let compressionBusy = false;
  let compressionSources: BatchCompressionSource[] = [];
  let compressionRecords: BatchCompressionRecord[] = [];
  let compressionStage: "settings" | "compressing" | "review" | "applying" | "completed" = "settings";
  let compressionFormat: CompressionFormat = "webp";
  let compressionQuality = 82;
  let compressionMaxEdge = 0;
  let compressionProcessed = 0;
  let compressionApplyProgress = 0;
  let compressionApplyTotal = 0;
  let compressionError = "";
  let compressionStep = "";
  let compressionSerial = 0;
  $: compressionSummary = batchCompressionSummary(compressionRecords);
  let uploadInput: HTMLInputElement;
  let replaceInput: HTMLInputElement;
  let requestSerial = 0;

  function flattenFolders(parent = "", depth = 0, rows: FolderRow[] = []): FolderRow[] {
    for (const name of folderChildren[parent] ?? []) {
      const path = parent ? parent + "/" + name : name;
      rows.push({ path, name, depth, hasChildren: (folderChildren[path]?.length ?? 0) > 0 });
      if (expanded[path]) flattenFolders(path, depth + 1, rows);
    }
    return rows;
  }
  $: folderRows = flattenFolders();
  $: filtered = filterAndSortFiles(entries, {
    folder: currentFolder,
    keyword: searchText,
    extensions: selectedExtensions,
    size: sizeFilter,
    sort: sortMode,
    sizes: sizeByPath,
  });
  $: visible = filtered.slice(0, limit);
  $: fileCount = entries.filter((item) => !item.isDir).length;
  $: extensionOptions = collectFileExtensions(entries, selectedExtensions);
  $: searchedExtensions = extensionOptions.filter((option) =>
    option.label.toLocaleLowerCase().includes(formatSearch.trim().toLocaleLowerCase()));
  $: canGoBack = historyIndex > 0;
  $: canGoForward = historyIndex < historyPaths.length - 1;
  $: activeFilterCount = Number(Boolean(searchText.trim())) + Number(selectedExtensions.length > 0) + Number(sizeFilter !== "all");
  $: selectedPath = selected ? assetRelativePath(currentFolder, selected.name) : "";
  $: supportedSelectedImages = selectedFileNames
    .map((name) => entries.find((item) => !item.isDir && item.name === name))
    .filter((item): item is AssetEntry => !!item && supportsImageCompression(item.name));
  $: compressionFinished = compressionRecords.filter((item) =>
    item.status === "replaced" || item.status === "warning" || item.status === "failed").length;
  $: crumbs = currentFolder ? currentFolder.split("/") : [];

  function iconFor(name: string) {
    const kind = assetKind(name);
    if (kind === "image") return Image;
    if (kind === "video") return Film;
    if (kind === "audio") return AudioLines;
    if (kind === "document") return FileText;
    if (kind === "archive") return Archive;
    return File;
  }

  function reportError(action: string, reason: unknown) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    error = action + "：" + detail;
    showMessage(error, 5000, "error");
  }

  function mediaUrl(path: string, item?: AssetEntry | null): string {
    const revision = mediaRevisions[path] || (item?.updated ? String(item.updated) : "");
    return assetUrl(path, revision);
  }

  function pumpListSizes() {
    while (listSizeActive < 4 && listSizeQueue.length) {
      const job = listSizeQueue.shift()!;
      if (job.folder !== currentFolder || viewMode !== "list") {
        listSizeQueued.delete(job.path);
        continue;
      }
      listSizeActive++;
      void getAssetSize(job.path, job.updated).then((size) => {
        if (currentFolder === job.folder && viewMode === "list") {
          sizeByPath = { ...sizeByPath, [job.path]: size };
        }
      }).catch(() => {
        if (currentFolder === job.folder && viewMode === "list") {
          listSizeUnavailable = { ...listSizeUnavailable, [job.path]: true };
        }
      }).finally(() => {
        listSizeQueued.delete(job.path);
        listSizeActive--;
        pumpListSizes();
      });
    }
  }

  function queueListSize(item: AssetEntry, folder: string) {
    if (item.isDir || item.size !== undefined) return;
    const path = assetRelativePath(folder, item.name);
    if (sizeByPath[path] !== undefined || listSizeUnavailable[path] || listSizeQueued.has(path)) return;
    listSizeQueued.add(path);
    listSizeQueue.push({ folder, path, updated: item.updated ?? 0 });
    pumpListSizes();
  }

  function observeListRowSize(node: HTMLElement, initial: AssetEntry) {
    let observer: IntersectionObserver | null = null;
    let item = initial;
    let folder = currentFolder;
    function track() {
      observer?.disconnect();
      observer = null;
      if (item.isDir || item.size !== undefined ||
          sizeByPath[assetRelativePath(folder, item.name)] !== undefined) return;
      if (typeof IntersectionObserver === "undefined") {
        queueListSize(item, folder);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        observer = null;
        queueListSize(item, folder);
      }, { root: scrollContainer, rootMargin: "220px 0px" });
      observer.observe(node);
    }
    track();
    return {
      update(next: AssetEntry) {
        if (next !== item || folder !== currentFolder) {
          item = next;
          folder = currentFolder;
          track();
        }
      },
      destroy() { observer?.disconnect(); },
    };
  }

  // Native loading=lazy limits image fetches; this also limits created DOM nodes.
  function observeMore(node: HTMLElement) {
    if (typeof IntersectionObserver === "undefined") return {};
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting) && !loading && limit < filtered.length) {
        limit = Math.min(filtered.length, limit + INITIAL_PAGE_SIZE);
      }
    }, { root: scrollContainer, rootMargin: "320px 0px" });
    observer.observe(node);
    return { destroy() { observer.disconnect(); } };
  }

  function setDirectoryChildren(folder: string, items: AssetEntry[]) {
    const names = items.filter((item) => item.isDir)
      .map((item) => item.name).sort((a, b) => a.localeCompare(b, "zh-CN"));
    folderChildren = { ...folderChildren, [folder]: names };
  }

  async function listFolder(folder: string, forceRefresh = false): Promise<AssetEntry[]> {
    const data = await readAssetDirectory(folder, { forceRefresh });
    setDirectoryChildren(folder, data);
    return data;
  }

  function updateHistory(folder: string, mode: "push" | "back" | "forward") {
    if (mode === "back") {
      if (historyIndex > 0 && historyPaths[historyIndex - 1] === folder) historyIndex--;
      return;
    }
    if (mode === "forward") {
      if (historyIndex + 1 < historyPaths.length && historyPaths[historyIndex + 1] === folder) historyIndex++;
      return;
    }
    if (historyPaths[historyIndex] === folder) return;
    historyPaths = [...historyPaths.slice(0, historyIndex + 1), folder];
    historyIndex = historyPaths.length - 1;
  }

  function goBack() {
    if (canGoBack) void navigate(historyPaths[historyIndex - 1], "back");
  }

  function goForward() {
    if (canGoForward) void navigate(historyPaths[historyIndex + 1], "forward");
  }

  const PANEL_LAYOUT_KEY = "siyuan-dodo:file-manager:panel-layout";
  const LEFT_MIN = 156;
  const LEFT_MAX = 360;
  const RIGHT_MIN = 220;
  const RIGHT_MAX = 460;
  const MIN_CENTER = 320;

  function clampPanelWidth(side: "left" | "right", proposed: number): number {
    const min = side === "left" ? LEFT_MIN : RIGHT_MIN;
    const max = side === "left" ? LEFT_MAX : RIGHT_MAX;
    // Reserve workspace for the file grid while respecting the panel minimum.
    const other = side === "left"
      ? (inspectOpen ? rightWidth : 0)
      : (leftOpen ? leftWidth : 0);
    const separators = (leftOpen ? 6 : 0) + (inspectOpen ? 6 : 0);
    const maxAvailable = (layoutElement?.clientWidth ?? 1280) - other - separators - MIN_CENTER;
    return Math.min(Math.max(min, maxAvailable), Math.max(min, Math.min(max, proposed)));
  }

  function fitPanelWidths() {
    if (!layoutElement) return;
    // Size from the right before the left, so the navigator remains usable.
    if (inspectOpen) rightWidth = clampPanelWidth("right", rightWidth);
    if (leftOpen) leftWidth = clampPanelWidth("left", leftWidth);
  }

  function savePanelLayout() {
    try {
      localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({
        leftOpen, inspectOpen, leftWidth, rightWidth,
      }));
    } catch { /* Storage can be unavailable in restricted webviews. */ }
  }

  function restorePanelLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.leftOpen === "boolean") leftOpen = saved.leftOpen;
        if (typeof saved.inspectOpen === "boolean") inspectOpen = saved.inspectOpen;
        if (Number.isFinite(saved.leftWidth)) leftWidth = Math.max(LEFT_MIN, Math.min(LEFT_MAX, saved.leftWidth));
        if (Number.isFinite(saved.rightWidth)) rightWidth = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, saved.rightWidth));
      }
    } catch { /* Ignore invalid previous layout preferences. */ }
    fitPanelWidths();
  }

  function toggleLeftPanel() {
    leftOpen = !leftOpen;
    fitPanelWidths();
    savePanelLayout();
  }

  function toggleRightPanel() {
    inspectOpen = !inspectOpen;
    fitPanelWidths();
    savePanelLayout();
  }

  function startPanelResize(side: "left" | "right", event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeSide = side;
    resizePointer = event.pointerId;
    resizeStartX = event.clientX;
    resizeStartWidth = side === "left" ? leftWidth : rightWidth;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePanelResize(side: "left" | "right", event: PointerEvent) {
    if (resizeSide !== side || resizePointer !== event.pointerId) return;
    const delta = event.clientX - resizeStartX;
    if (side === "left") leftWidth = clampPanelWidth("left", resizeStartWidth + delta);
    else rightWidth = clampPanelWidth("right", resizeStartWidth - delta);
  }

  function finishPanelResize(event: PointerEvent) {
    if (resizeSide === null || resizePointer !== event.pointerId) return;
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    resizeSide = null;
    resizePointer = -1;
    savePanelLayout();
  }

  function resizePanelWithKeys(side: "left" | "right", event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = (event.shiftKey ? 24 : 12) * (event.key === "ArrowRight" ? 1 : -1);
    if (side === "left") leftWidth = clampPanelWidth("left", leftWidth + amount);
    else rightWidth = clampPanelWidth("right", rightWidth - amount);
    savePanelLayout();
  }

  function focusKeywordInput(node: HTMLInputElement) {
    node.focus();
  }

  function resetPage() {
    limit = INITIAL_PAGE_SIZE;
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }

  function toggleExtension(extension: string) {
    selectedExtensions = selectedExtensions.includes(extension)
      ? selectedExtensions.filter((value) => value !== extension)
      : [...selectedExtensions, extension];
    resetPage();
  }

  function clearExtensions() {
    selectedExtensions = [];
    resetPage();
  }

  function chooseSize(size: FileSizeFilter) {
    sizeFilter = size;
    sizeOpen = false;
    resetPage();
    if (size !== "all" || sortMode === "size") void resolveSizesForFolder(currentFolder, entries);
    else { sizeLoadSerial++; sizeLoading = false; }
  }

  function chooseSort(next: FileSortMode) {
    sortMode = next;
    sortOpen = false;
    resetPage();
    if (next === "size") void resolveSizesForFolder(currentFolder, entries);
    else if (sizeFilter === "all") {
      sizeLoadSerial++;
      sizeLoading = false;
    }
  }

  function clearFilters() {
    searchText = "";
    selectedExtensions = [];
    sizeFilter = "all";
    if (sortMode !== "size") {
      sizeLoadSerial++;
      sizeLoading = false;
    }
    resetPage();
  }

  async function resolveSizesForFolder(folder: string, items: AssetEntry[]) {
    const serial = ++sizeLoadSerial;
    const list = items.filter((item) => !item.isDir);
    const known = list.filter((item) => sizeByPath[assetRelativePath(folder, item.name)] !== undefined);
    const todo = list.filter((item) => sizeByPath[assetRelativePath(folder, item.name)] === undefined);
    sizeTotal = list.length;
    sizeProgress = known.length;
    sizeLoading = todo.length > 0;
    // Batch metadata reads to avoid flooding SiYuan's kernel and repeatedly
    // re-rendering hundreds of cards. This never touches OS filesystem APIs.
    for (let i = 0; i < todo.length; i += 12) {
      const batch = todo.slice(i, i + 12);
      const results = await Promise.all(batch.map(async (item) => {
        const path = assetRelativePath(folder, item.name);
        try { return { path, size: await getAssetSize(path, item.updated) }; }
        catch { return { path, size: undefined }; }
      }));
      if (serial !== sizeLoadSerial || currentFolder !== folder ||
          (sizeFilter === "all" && sortMode !== "size")) return;
      const patch: Record<string, number> = {};
      for (const result of results) {
        if (result.size !== undefined) patch[result.path] = result.size;
      }
      sizeByPath = { ...sizeByPath, ...patch };
      sizeProgress = Math.min(sizeTotal, sizeProgress + batch.length);
    }
    if (serial === sizeLoadSerial) sizeLoading = false;
  }

  function showFolder(folder: string, data: AssetEntry[], resetNavigation = true) {
    cancelMarquee(false);
    currentFolder = folder;
    listSizeUnavailable = {};
    entries = data;
    setDirectoryChildren(folder, data);
    if (sizeFilter !== "all" || sortMode === "size") {
      void resolveSizesForFolder(folder, data);
    } else {
      sizeLoadSerial++;
      sizeLoading = false;
    }
    if (!resetNavigation) {
      selected = data.find((item) => !item.isDir && item.name === selected?.name) ?? null;
      selectedFileNames = selectedFileNames.filter((name) =>
        data.some((item) => !item.isDir && item.name === name));
      return;
    }
    selected = null;
    selectedFileNames = [];
    selectionAnchor = null;
    refs = null;
    ocrReferenceCount = 0;
    referenceDocPaths = {};
    referencePathsLoading = false;
    referencePathsResolved = 0;
    referencePathsTotal = 0;
    referenceRequestSerial++;
    resetPage();
    let ancestor = "";
    expanded = { ...expanded, "": true };
    for (const segment of folder.split("/").filter(Boolean)) {
      ancestor = ancestor ? ancestor + "/" + segment : segment;
      expanded = { ...expanded, [ancestor]: true };
    }
  }

  async function navigate(folder: string, historyMode: "push" | "back" | "forward" = "push") {
    const serial = ++requestSerial;
    error = "";
    refreshing = false;
    const cached = getCachedAssetDirectory(folder);
    if (cached) {
      // Show immediately from in-memory metadata, then refresh stale data in the background.
      showFolder(folder, cached.entries);
      updateHistory(folder, historyMode);
      loading = false;
      if (cached.isFresh) return;
      refreshing = true;
      try {
        const fresh = await listFolder(folder, true);
        if (serial === requestSerial) showFolder(folder, fresh, false);
      } catch (reason) {
        if (serial === requestSerial) reportError("更新附件目录失败（已保留缓存）", reason);
      } finally {
        if (serial === requestSerial) refreshing = false;
      }
      return;
    }

    loading = true;
    try {
      const list = await listFolder(folder);
      if (serial === requestSerial) {
        showFolder(folder, list);
        updateHistory(folder, historyMode);
      }
    } catch (reason) {
      if (serial === requestSerial) reportError("读取附件失败", reason);
    } finally {
      if (serial === requestSerial) loading = false;
    }
  }

  async function toggleFolder(path: string) {
    if (expanded[path]) {
      expanded = { ...expanded, [path]: false };
      return;
    }
    try {
      if (!folderChildren[path]) await listFolder(path);
      expanded = { ...expanded, [path]: true };
    } catch (reason) {
      reportError("读取子文件夹失败", reason);
    }
  }

  async function refresh() {
    const serial = ++requestSerial;
    const folder = currentFolder;
    const isEmpty = loading && entries.length === 0;
    error = "";
    refreshing = !isEmpty;
    if (isEmpty) loading = true;
    invalidateAssetDirectory(folder);
    try {
      const list = await listFolder(folder, true);
      if (serial === requestSerial) showFolder(folder, list, false);
    } catch (reason) {
      if (serial === requestSerial) reportError("刷新失败", reason);
    } finally {
      if (serial === requestSerial) {
        refreshing = false;
        loading = false;
      }
    }
  }

  // The full kernel readDir pass is intentionally separate from the fast index refresh.
  async function deepScan() {
    if (busy || loading || refreshing) return;
    if (!confirm("完整扫描会逐个检查文件，当前工作空间可能需要约 20–30 秒。\\n一般不需要执行，只有发现资源或空文件夹未显示时使用。确定开始吗？")) return;
    const folder = currentFolder;
    const serial = ++requestSerial;
    refreshing = true;
    try {
      const data = await deepScanAssetDirectory(folder);
      if (serial === requestSerial) {
        showFolder(folder, data, false);
        showMessage("完整扫描完成，共找到 " + data.length + " 项。");
      }
    } catch (reason) {
      if (serial === requestSerial) reportError("完整扫描失败", reason);
    } finally {
      if (serial === requestSerial) refreshing = false;
    }
  }

  function openPreview(item: AssetEntry) {
    if (item.isDir) return;
    selected = item;
    previewOpen = true;
  }

  function previewAdjacent(step: number) {
    if (!selected) return;
    const files = filtered.filter((item) => !item.isDir);
    if (!files.length) return;
    const index = files.findIndex((item) => item.name === selected?.name);
    const next = files[(index + step + files.length) % files.length];
    if (next) void selectItem(next);
  }

  function clearMarqueeLoop() {
    if (marqueeScrollFrame) cancelAnimationFrame(marqueeScrollFrame);
    marqueeScrollFrame = 0;
  }

  function stopMarqueePointer() {
    clearMarqueeLoop();
    const pointerId = marqueeCandidate?.pointerId;
    if (pointerId !== undefined && scrollContainer?.hasPointerCapture(pointerId)) {
      scrollContainer.releasePointerCapture(pointerId);
    }
    marqueeCandidate = null;
    marqueeOverlay = null;
  }

  function cancelMarquee(restore: boolean) {
    if (restore && marqueeCandidate?.active) {
      selectedFileNames = [...marqueeCandidate.base];
    }
    stopMarqueePointer();
  }

  function computeMarqueeSelection() {
    const session = marqueeCandidate;
    if (!session?.active || !scrollContainer) return;
    const box = scrollContainer.getBoundingClientRect();
    const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
    const clientX = clamp(marqueeClientPoint.x, box.left, box.right);
    const clientY = clamp(marqueeClientPoint.y, box.top, box.bottom);
    const point = {
      x: clientX - box.left + scrollContainer.scrollLeft,
      y: clientY - box.top + scrollContainer.scrollTop,
    };
    const rect = marqueeBounds(session.origin, point);
    const hitNames: string[] = [];
    for (const element of scrollContainer.querySelectorAll<HTMLElement>(
      ".fm-tile[data-fm-file-name], .fm-list-row[data-fm-file-name]",
    )) {
      const name = element.dataset.fmFileName;
      if (!name) continue;
      const bounds = element.getBoundingClientRect();
      const cellRect = {
        x: bounds.left - box.left + scrollContainer.scrollLeft,
        y: bounds.top - box.top + scrollContainer.scrollTop,
        width: bounds.width,
        height: bounds.height,
      };
      if (intersectsMarquee(rect, cellRect)) hitNames.push(name);
    }
    const next = applyMarqueeChoice(session.base, hitNames, session.mode);
    if (next.join("\u0000") !== selectedFileNames.join("\u0000")) selectedFileNames = next;
    // Overlay uses fixed viewport coordinates and is clipped to this scroll pane.
    const left = clamp(box.left + rect.x - scrollContainer.scrollLeft, box.left, box.right);
    const top = clamp(box.top + rect.y - scrollContainer.scrollTop, box.top, box.bottom);
    const right = clamp(box.left + rect.x + rect.width - scrollContainer.scrollLeft, box.left, box.right);
    const bottom = clamp(box.top + rect.y + rect.height - scrollContainer.scrollTop, box.top, box.bottom);
    marqueeOverlay = {
      x: left, y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  function marqueeAutoScroll() {
    marqueeScrollFrame = 0;
    if (!marqueeCandidate?.active || !scrollContainer) return;
    const box = scrollContainer.getBoundingClientRect();
    const gap = 36;
    const y = marqueeClientPoint.y;
    const amount = y < box.top + gap ? -Math.min(20, Math.ceil((box.top + gap - y) / 2))
      : y > box.bottom - gap ? Math.min(20, Math.ceil((y - (box.bottom - gap)) / 2))
      : 0;
    if (amount) {
      const before = scrollContainer.scrollTop;
      scrollContainer.scrollTop += amount;
      if (scrollContainer.scrollTop !== before) {
        computeMarqueeSelection();
        // Keep auto-scrolling while the viewport can still move. When the
        // pointer is away from the edges, stop running animation frames.
        marqueeScrollFrame = requestAnimationFrame(marqueeAutoScroll);
      }
    }
  }

  function beginMarqueeCandidate(event: PointerEvent) {
    if (busy || loading || compressionOpen || previewOpen ||
        event.button !== 0 || event.pointerType === "touch" ||
        !event.isPrimary || marqueeCandidate) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Keep toolbar buttons, load-more and other interactive elements functional.
    if (target.closest("input,textarea,a,select,[contenteditable],.fm-load-more")) return;
    if (target.closest("button") &&
        !target.closest(".fm-tile, .fm-list-row")) return;
    const box = scrollContainer.getBoundingClientRect();
    marqueeCandidate = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      origin: {
        x: event.clientX - box.left + scrollContainer.scrollLeft,
        y: event.clientY - box.top + scrollContainer.scrollTop,
      },
      base: [...selectedFileNames],
      mode: event.ctrlKey || event.metaKey ? "toggle"
        : event.shiftKey ? "add" : "replace",
      active: false,
    };
  }

  function moveMarqueePointer(event: PointerEvent) {
    const session = marqueeCandidate;
    if (!session || event.pointerId !== session.pointerId) return;
    const dx = event.clientX - session.startClient.x;
    const dy = event.clientY - session.startClient.y;
    if (!session.active && dx * dx + dy * dy < 36) return;
    if (!session.active) {
      session.active = true;
      scrollContainer.setPointerCapture(event.pointerId);
      suppressMarqueeClickUntil = performance.now() + 250;
    }
    event.preventDefault();
    if (!marqueeScrollFrame) marqueeScrollFrame = requestAnimationFrame(marqueeAutoScroll);
    marqueeClientPoint = { x: event.clientX, y: event.clientY };
    computeMarqueeSelection();
  }

  function endMarqueePointer(event: PointerEvent) {
    const session = marqueeCandidate;
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.active) {
      computeMarqueeSelection();
      const last = selectedFileNames[selectedFileNames.length - 1];
      if (last && selected?.name !== last) {
        const entry = entries.find((item) => !item.isDir && item.name === last);
        if (entry) void selectItem(entry);
      } else if (!last) {
        selected = null;
        refs = null;
      }
      selectionAnchor = last ?? null;
    } else {
      // Clicking an empty part of the gallery clears the selection.
      const target = event.target;
      if (!(target instanceof Element) ||
          !target.closest(".fm-tile, .fm-list-row")) {
        if (session.mode === "replace") clearFileSelection();
      }
    }
    stopMarqueePointer();
  }

  function suppressMarqueeClick(event: MouseEvent) {
    if (performance.now() < suppressMarqueeClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      suppressMarqueeClickUntil = 0;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && marqueeCandidate) {
      event.preventDefault();
      cancelMarquee(true);
      return;
    }
    if (!previewOpen && !compressionOpen && (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a" &&
        event.target instanceof HTMLElement && event.target.closest(".fm-content") &&
        !(event.target.closest("input, textarea, [contenteditable=true]"))) {
      event.preventDefault();
      selectedFileNames = filtered.filter((item) => !item.isDir).map((item) => item.name);
      selectionAnchor = selectedFileNames[selectedFileNames.length - 1] ?? null;
      return;
    }
    if (!previewOpen) return;
    if (event.key === "Escape") {
      previewOpen = false;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previewAdjacent(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      previewAdjacent(1);
    }
  }

  function handleFileClick(item: AssetEntry, event: MouseEvent) {
    const ordered = filtered.filter((file) => !file.isDir).map((file) => file.name);
    const modifier = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      const start = ordered.indexOf(selectionAnchor ?? selected?.name ?? item.name);
      const end = ordered.indexOf(item.name);
      const slice = ordered.slice(Math.min(start < 0 ? end : start, end),
        Math.max(start < 0 ? end : start, end) + 1);
      selectedFileNames = modifier
        ? [...new Set([...selectedFileNames, ...slice])]
        : slice;
    } else if (modifier) {
      selectedFileNames = selectedFileNames.includes(item.name)
        ? selectedFileNames.filter((name) => name !== item.name)
        : [...selectedFileNames, item.name];
      selectionAnchor = item.name;
    } else {
      selectedFileNames = [item.name];
      selectionAnchor = item.name;
    }
    if (selectedFileNames.length) {
      const inspectorItem = selectedFileNames.includes(item.name) ? item
        : entries.find((file) => file.name === selectedFileNames[selectedFileNames.length - 1]);
      if (inspectorItem) void selectItem(inspectorItem);
    } else {
      selected = null;
      refs = null;
    }
  }

  function selectAllImages() {
    selectedFileNames = filtered.filter((item) =>
      !item.isDir && supportsImageCompression(item.name)).map((item) => item.name);
    selectionAnchor = selectedFileNames[selectedFileNames.length - 1] ?? null;
    if (selectedFileNames.length) {
      const item = entries.find((entry) => entry.name === selectedFileNames[0]);
      if (item) void selectItem(item);
    }
  }

  function clearFileSelection() {
    selectedFileNames = [];
    selectionAnchor = null;
    selected = null;
    refs = null;
  }

  async function selectItem(item: AssetEntry) {
    if (item.isDir) {
      await navigate(assetRelativePath(currentFolder, item.name));
      return;
    }
    selected = item;
    refs = null;
    ocrReferenceCount = 0;
    referenceDocPaths = {};
    referencePathsLoading = false;
    referencePathsResolved = 0;
    referencePathsTotal = 0;
    referenceRequestSerial++;
    dimensions = "";
    const path = assetRelativePath(currentFolder, item.name);
    detailsSize = sizeByPath[path] ?? item.size ?? null;
    if (detailsSize === null) {
      try {
        const size = await getAssetSize(path, item.updated);
        if (selected === item) {
          detailsSize = size;
          sizeByPath = { ...sizeByPath, [path]: size };
        }
      } catch { /* The inspector gracefully shows "unknown" for missing metadata. */ }
    }
  }

  async function loadReferences() {
    if (!selected) return;
    const sourcePath = selectedPath;
    const serial = ++referenceRequestSerial;
    refsLoading = true;
    referencePathsLoading = false;
    referencePathsResolved = 0;
    referencePathsTotal = 0;
    referenceDocPaths = {};
    refs = null;
    ocrReferenceCount = 0;
    try {
      const result = await findAssetReferences(sourcePath);
      if (serial !== referenceRequestSerial || selectedPath !== sourcePath) return;
      // OCR records point to assets/ocr-texts.json; they are not links from
      // documents, so present them independently from human-readable paths.
      const matches = result.references ?? [];
      ocrReferenceCount = matches.filter((ref) => ref.type?.toLowerCase() === "ocr").length;
      refs = matches.filter((ref) => ref.type?.toLowerCase() !== "ocr");
      if ((result.skippedNotebooks?.length ?? 0) > 0) {
        showMessage("部分笔记本未参与引用扫描，结果可能不完整。", 5500);
      }
      const currentRefs = refs.slice(0, 30);
      const uniqueDocumentIds = new Set(currentRefs.map(getReferenceDocumentId).filter(Boolean));
      referencePathsTotal = uniqueDocumentIds.size;
      if (referencePathsTotal) {
        referencePathsLoading = true;
        // Incremental path updates: never wait for other documents to finish.
        void getReadableReferencePaths(currentRefs, ({ id, path }) => {
          if (serial !== referenceRequestSerial || selectedPath !== sourcePath) return;
          referenceDocPaths = { ...referenceDocPaths, [id]: path };
          referencePathsResolved++;
        }).catch((reason) => {
          if (serial === referenceRequestSerial && selectedPath === sourcePath) {
            console.warn("[Dodo 文件管理] 查询可读引用路径失败", reason);
          }
        }).finally(() => {
          if (serial === referenceRequestSerial && selectedPath === sourcePath) {
            referencePathsLoading = false;
          }
        });
      }
    } catch (reason) {
      if (serial === referenceRequestSerial && selectedPath === sourcePath) {
        reportError("查询引用失败（请确认思源内核支持此 API）", reason);
      }
    } finally {
      if (serial === referenceRequestSerial && selectedPath === sourcePath) {
        refsLoading = false;
      }
    }
  }

  function openReference(ref: AssetReference) {
    const id = getReferenceDocumentId(ref);
    if (!id) return;
    openTab({ app: plugin.app, doc: { id } });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showMessage("已复制到剪贴板");
    } catch (reason) { reportError("复制失败", reason); }
  }

  function downloadSelected() {
    if (!selected) return;
    const anchor = document.createElement("a");
    anchor.href = mediaUrl(selectedPath, selected);
    anchor.download = selected.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function clearCompressionResults() {
    ++compressionSerial;
    for (const record of compressionRecords) {
      if (record.previewUrl) URL.revokeObjectURL(record.previewUrl);
    }
    compressionRecords = [];
    compressionProcessed = 0;
    compressionApplyProgress = 0;
    compressionApplyTotal = 0;
  }

  function openCompression() {
    if (busy || compressionBusy) return;
    const selectedNames = selectedFileNames.length
      ? selectedFileNames : selected ? [selected.name] : [];
    const chosen = selectedNames.filter((name) =>
      entries.some((item) => !item.isDir && item.name === name)
      && supportsImageCompression(name));
    if (!chosen.length) {
      showMessage("请先选择 JPG、PNG、WebP 或静态 AVIF 图片。", 4500, "error");
      return;
    }
    if (chosen.length > MAX_COMPRESSION_BATCH) {
      showMessage("每批最多 " + MAX_COMPRESSION_BATCH + " 张，当前选择 " + chosen.length
        + " 张，请缩小选择范围。", 6000, "error");
      return;
    }
    clearCompressionResults();
    compressionSources = chosen.map((name) => ({
      name, path: assetRelativePath(currentFolder, name),
    }));
    compressionFormat = "webp";
    compressionQuality = 82;
    compressionMaxEdge = 0;
    compressionStage = "settings";
    compressionError = "";
    compressionStep = "";
    compressionOpen = true;
  }

  function closeCompression() {
    if (compressionBusy) return;
    compressionOpen = false;
    clearCompressionResults();
    compressionSources = [];
  }

  function markCompressionDirty() {
    if (compressionBusy) return;
    clearCompressionResults();
    compressionStage = "settings";
    compressionError = "";
    compressionStep = "";
  }

  function updateCompressionRecord(path: string, patch: Partial<BatchCompressionRecord>) {
    const old = compressionRecords.find((record) => record.path === path);
    if (!old) return;
    const next = { ...old, ...patch };
    if (patch.status === "ready" && next.preview) {
      next.previewUrl = URL.createObjectURL(next.preview.blob);
    }
    compressionRecords = compressionRecords.map((record) => record.path === path ? next : record);
    if (patch.status === "ready" || patch.status === "larger" || patch.status === "error") {
      compressionProcessed++;
    }
  }

  async function startBatchCompression() {
    if (!compressionOpen || compressionBusy || compressionStage !== "settings") return;
    clearCompressionResults();
    const serial = compressionSerial;
    compressionRecords = compressionSources.map(({ path, name }) => ({
      path, name, status: "pending", checked: false,
    }));
    compressionStage = "compressing";
    compressionBusy = true;
    compressionError = "";
    compressionStep = "正在本机内存中压缩图片，不修改思源附件…";
    try {
      await prepareCompressionBatch(compressionSources, {
        format: compressionFormat,
        quality: compressionQuality / 100,
        maxEdge: Number(compressionMaxEdge),
      }, (path, patch) => {
        if (serial === compressionSerial) updateCompressionRecord(path, patch);
      });
      if (serial !== compressionSerial) return;
      compressionStage = "review";
      compressionStep = "已完成压缩；默认勾选所有变小的图片。取消勾选即放弃，未勾选图片不会写入附件库。";
    } catch (reason) {
      compressionError = reason instanceof Error ? reason.message : String(reason);
      compressionStage = "settings";
    } finally {
      compressionBusy = false;
    }
  }

  function toggleCompressionChoice(path: string) {
    if (compressionBusy || compressionStage !== "review") return;
    compressionRecords = compressionRecords.map((item) =>
      item.path === path && item.status === "ready"
        ? { ...item, checked: !item.checked }
        : item);
  }

  function selectCompressionChoices(checked: boolean) {
    if (compressionBusy || compressionStage !== "review") return;
    compressionRecords = compressionRecords.map((item) =>
      item.status === "ready" ? { ...item, checked } : item);
  }

  async function applyBatchCompression() {
    if (compressionBusy || compressionStage !== "review") return;
    const picked = selectedBatchRecords(compressionRecords);
    if (!picked.length) return;
    const total = picked.reduce((sum, item) =>
      sum + item.preview!.originalSize - item.preview!.blob.size, 0);
    if (!confirm("确认替换 " + picked.length + " 张图片？\n"
      + "预计节省 " + formatSize(total) + "。\n\n"
      + "对勾选的图片：新图写入 → 迁移文档/数据库及 OCR 关联 → 思源历史备份后安全清理原图。\n"
      + "未勾选的结果将丢弃，不上传。失败项目保留原图，请勿直接重复执行。")) return;
    compressionStage = "applying";
    compressionBusy = true;
    busy = true;
    compressionApplyProgress = 0;
    compressionApplyTotal = picked.length;
    compressionError = "";
    const chosen = new Set(picked.map((item) => item.path));
    compressionRecords = compressionRecords.map((item) =>
      item.status === "ready" && !chosen.has(item.path)
        ? { ...item, status: "discarded", checked: false }
        : item);
    try {
      // Serial commits avoid collisions in the kernel asset relinker and
      // ensure every file has a separately verifiable outcome.
      for (const item of picked) {
        updateCompressionRecord(item.path, { status: "replacing" });
        try {
          const result = await commitCompression(item.path, item.preview!,
            compressionFormat, "relink-delete",
            (step) => { compressionStep = item.name + " · " + step; });
          updateCompressionRecord(item.path, {
            status: result.oldRemoved ? "replaced" : "warning",
            checked: false,
            resultPath: result.savedPath,
            error: result.oldRemoved ? undefined
              : result.verificationWarning || "迁移已执行，但未能确认清理原图。",
          });
        } catch (reason) {
          updateCompressionRecord(item.path, {
            status: "failed", checked: false,
            error: reason instanceof Error ? reason.message : String(reason),
          });
        }
        compressionApplyProgress++;
      }
      compressionStage = "completed";
      const count = compressionRecords.filter((item) => item.status === "replaced").length;
      const warnings = compressionRecords.filter((item) =>
        item.status === "warning" || item.status === "failed").length;
      compressionStep = "处理完成：成功替换 " + count + " 张，需核对 " + warnings
        + " 张，其余已放弃或无需压缩。";
      showMessage(compressionStep, warnings ? 9000 : 6000,
        warnings ? "error" : undefined);
      await refresh();
    } finally {
      compressionBusy = false;
      busy = false;
      // The review results are retained until the user closes the dialog,
      // so individual failures remain visible and no retry is auto-offered.
    }
  }

  async function uploadFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    if (!files.length || busy) return;
    busy = true;
    const known = new Set(entries.map((item) => item.name));
    let completed = 0;
    try {
      for (const file of files) {
        if (known.has(file.name)) {
          if (!confirm("“" + file.name + "”已存在，覆盖后会影响所有引用。确定覆盖吗？")) continue;
        }
        await saveAssetFile(currentFolder, file);
        known.add(file.name);
        mediaRevisions = { ...mediaRevisions, [assetRelativePath(currentFolder, file.name)]: String(Date.now()) };
        completed++;
      }
      if (completed) {
        showMessage("已上传 " + completed + " 个文件");
        await refresh();
      }
    } catch (reason) { reportError("上传失败（已上传 " + completed + " 个文件）", reason); }
    finally { busy = false; }
  }

  async function replaceFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !selected || busy) return;
    const source = selectedPath;
    const sourceName = selected.name;
    if (assetKind(sourceName) === "image") {
      if (assetKind(file.name) !== "image") {
        showMessage("请选择图片文件进行替换。", 5000, "error");
        return;
      }
      if (!confirm("确认替换图片“" + sourceName + "”为“" + file.name + "”？\n\n"
        + "思源将先保存新图，再迁移全部文档、数据库引用及 OCR 关联，最后确认未引用并备份、清理旧图。\n"
        + "若迁移或删除未完成，将保留原图并显示具体原因。")) return;
      busy = true;
      try {
        const result = await replaceImageAsset(source, file);
        await refresh();
        const targetName = result.savedPath.split("/").pop() ?? "";
        const newEntry = entries.find((item) => !item.isDir && item.name === targetName);
        selectedFileNames = newEntry ? [targetName] : [];
        if (newEntry) void selectItem(newEntry);
        const summary = "新图已保存并执行引用/OCR 迁移。"
          + (result.oldRemoved ? "旧图已备份并安全清理。" : "旧图已保留。");
        showMessage(summary + (result.verificationWarning ? " " + result.verificationWarning : ""),
          result.verificationWarning ? 11000 : 6500,
          result.verificationWarning ? "error" : undefined);
      } catch (reason) {
        reportError("图片替换未完成；原图未自动删除", reason);
        await refresh();
      } finally { busy = false; }
      return;
    }

    // Keep the legacy same-extension replacement for non-image assets.
    const oldExt = sourceName.split(".").pop()?.toLowerCase();
    const newExt = file.name.split(".").pop()?.toLowerCase();
    if (oldExt !== newExt) { showMessage("非图片附件仅允许相同扩展名覆盖。", 5000, "error"); return; }
    if (!confirm("将“" + sourceName + "”的内容替换为“" + file.name + "”？\n原附件不会自动备份，所有引用会显示新内容。")) return;
    busy = true;
    try {
      await saveAssetFile(currentFolder, file, sourceName);
      mediaRevisions = { ...mediaRevisions, [source]: String(Date.now()) };
      showMessage("文件已替换");
      await refresh();
    } catch (reason) { reportError("替换失败", reason); }
    finally { busy = false; }
  }

  async function renameSelected() {
    if (!selected || busy) return;
    const newName = prompt("输入新的文件名（含扩展名）。引用将由思源原生接口更新。", selected.name)?.trim();
    if (!newName || newName === selected.name) return;
    if (entries.some((item) => item.name === newName)) {
      showMessage("目标文件名已存在，已取消重命名。", 5000, "error");
      return;
    }
    if (!confirm("确认重命名“" + selected.name + "”为“" + newName + "”？")) return;
    busy = true;
    try {
      await renameAsset(selectedPath, newName);
      selected = null;
      showMessage("重命名完成，引用已由思源处理");
      await refresh();
    } catch (reason) { reportError("重命名失败（需支持 /api/asset/renameAsset）", reason); }
    finally { busy = false; }
  }

  async function newFolder() {
    const name = prompt("新建文件夹名称")?.trim();
    if (!name || busy) return;
    if (entries.some((item) => item.name === name)) {
      showMessage("已有同名文件或文件夹。", 4000, "error");
      return;
    }
    busy = true;
    try {
      await createAssetFolder(currentFolder, name);
      await refresh();
      showMessage("文件夹已创建");
    } catch (reason) { reportError("创建文件夹失败", reason); }
    finally { busy = false; }
  }

  function closeError() { error = ""; }
  onMount(() => {
    restorePanelLayout();
    void navigate("");
    return () => {
      requestSerial++;
      sizeLoadSerial++;
      referenceRequestSerial++;
      cancelMarquee(false);
      clearCompressionResults();
    };
  });
</script>

<svelte:window on:keydown={handleKeydown} on:resize={fitPanelWidths} />
<div class="fm-root">
  <input class="fm-hidden-input" type="file" multiple bind:this={uploadInput} on:change={uploadFiles} aria-label="导入附件" />
  <input class="fm-hidden-input" type="file" bind:this={replaceInput} on:change={replaceFile} aria-label="替换附件" />

  <div class="fm-layout" bind:this={layoutElement} class:resizing={resizeSide !== null}>
    {#if leftOpen}
    <aside class="fm-sidebar" aria-label="附件文件夹树" style:width="{leftWidth}px" style:flex-basis="{leftWidth}px">
      <div class="fm-side-head fm-side-head-first">
        <span>文件夹</span>
        <div class="fm-side-actions">
          <button class="fm-side-add" title="新建文件夹" aria-label="新建文件夹" disabled={busy} on:click={newFolder}><FolderPlus size={16} strokeWidth={1.75}/></button>
          <button class="fm-side-add" title="折叠左侧文件夹树" aria-label="折叠左侧文件夹树" on:click={toggleLeftPanel}><PanelLeftClose size={16} strokeWidth={1.75}/></button>
        </div>
      </div>
      <button class:active={currentFolder === ""} class="fm-folder-row fm-folder-root" on:click={() => navigate("")}>
        <Folder size={16} strokeWidth={1.75}/><span>assets</span>
      </button>
      {#each folderRows as folder (folder.path)}
        <div class:active={currentFolder === folder.path} class="fm-folder-row" style:padding-left="{15 + folder.depth * 14}px">
          <button class="fm-fold" aria-label="展开或收起 {folder.name}" on:click={() => toggleFolder(folder.path)}>
            {#if expanded[folder.path]}<ChevronDown size={14}/>{:else}<ChevronRight size={14}/>{/if}
          </button>
          <button class="fm-folder-label" on:click={() => navigate(folder.path)} title={folder.path}>
            {#if currentFolder === folder.path}<FolderOpen size={16} strokeWidth={1.75}/>{:else}<Folder size={16} strokeWidth={1.75}/>{/if}
            <span>{folder.name}</span>
          </button>
        </div>
      {/each}
    </aside>
    <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
    <div class="fm-panel-divider" role="separator" aria-label="调整左侧文件夹树宽度"
      aria-orientation="vertical" aria-valuemin={LEFT_MIN} aria-valuemax={LEFT_MAX} aria-valuenow={Math.round(leftWidth)}
      tabindex="0"
      on:pointerdown={(event) => startPanelResize("left", event)}
      on:pointermove={(event) => movePanelResize("left", event)}
      on:pointerup={finishPanelResize} on:pointercancel={finishPanelResize}
      on:keydown={(event) => resizePanelWithKeys("left", event)}></div>
    {/if}

    <main class="fm-main">
      <div class="fm-viewbar" aria-label="文件浏览工具栏">
        <div class="fm-history-controls">
          {#if !leftOpen}
            <button class="fm-icon-btn fm-panel-toggle" title="展开左侧文件夹树" aria-label="展开左侧文件夹树" on:click={toggleLeftPanel}>
              <PanelLeftOpen size={17} strokeWidth={1.75}/>
            </button>
          {/if}
          <button class="fm-icon-btn" title="后退" aria-label="后退" disabled={!canGoBack} on:click={goBack}><ArrowLeft size={18} strokeWidth={1.75}/></button>
          <button class="fm-icon-btn" title="前进" aria-label="前进" disabled={!canGoForward} on:click={goForward}><ArrowRight size={18} strokeWidth={1.75}/></button>
        </div>
        <div class="fm-breadcrumb" aria-label="当前位置">
          <button on:click={() => navigate("")}>assets</button>
          {#each crumbs as crumb, index}
            <ChevronRight size={13}/>
            <button title={crumb} on:click={() => navigate(crumbs.slice(0, index + 1).join("/"))}>{crumb}</button>
          {/each}
        </div>
        <div class="fm-viewbar-tools">
          {#if viewMode === "grid"}
            <div class="fm-zoom-control" title="缩略图大小">
              <Minus size={14} strokeWidth={1.75}/>
              <input type="range" min="120" max="280" step="10" bind:value={zoom} aria-label="缩略图大小"/>
              <Plus size={14} strokeWidth={1.75}/>
            </div>
          {/if}
          <div class="fm-view-switch" aria-label="视图模式">
            <button class:active={viewMode === "grid"} title="网格视图" aria-label="网格视图" on:click={() => viewMode = "grid"}><Grid2X2 size={16} strokeWidth={1.75}/></button>
            <button class:active={viewMode === "list"} title="列表视图" aria-label="列表视图" on:click={() => viewMode = "list"}><LayoutList size={16} strokeWidth={1.75}/></button>
          </div>
          <DropdownMenu.Root bind:open={sortOpen} portal closeOnEscape closeOnOutsideClick>
            <DropdownMenu.Trigger class="fm-icon-btn fm-menu-trigger" title="排序方式" aria-label="排序方式"><ArrowDownWideNarrow size={17} strokeWidth={1.75}/></DropdownMenu.Trigger>
            <DropdownMenu.Content class="fm-ui-menu" sideOffset={6} align="end" collisionPadding={10}>
              <div class="fm-ui-menu-title">排序方式</div>
              {#each sortOptions as option (option.value)}
                <DropdownMenu.Item class="fm-ui-menu-item" on:click={() => chooseSort(option.value)}>
                  <span>{option.label}</span>
                  {#if sortMode === option.value}<Check size={15} strokeWidth={1.8}/>{/if}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          <button class="fm-icon-btn" title="刷新文件列表" aria-label="刷新文件列表" on:click={refresh} disabled={loading || refreshing}><RefreshCw size={17} strokeWidth={1.75}/></button>
          <button class="fm-icon-btn" title="导入附件" aria-label="导入附件" disabled={busy} on:click={() => uploadInput.click()}><Upload size={17} strokeWidth={1.75}/></button>
          <div class="fm-search"><Search size={16} strokeWidth={1.75}/><input type="search" placeholder="搜索当前文件夹" bind:value={searchText} on:input={resetPage} aria-label="搜索当前文件夹"/>{#if searchText}<button title="清除搜索" aria-label="清除搜索" on:click={() => {searchText = ""; resetPage();}}><X size={13}/></button>{/if}</div>
          {#if !inspectOpen}
            <button class="fm-icon-btn fm-panel-toggle fm-rightmost-toggle"
              title="展开右侧检查器" aria-label="展开右侧检查器" on:click={toggleRightPanel}>
              <PanelRightOpen size={17} strokeWidth={1.75}/>
            </button>
          {/if}
        </div>
      </div>

      <div class="fm-filterbar" aria-label="附件筛选条件">
        <div class="fm-filter-pills">
          <div class="fm-keyword-inline" class:expanded={keywordOpen} class:has-value={Boolean(searchText.trim())}>
            <button class="fm-filter-pill fm-keyword-trigger" aria-expanded={keywordOpen}
              aria-label={keywordOpen ? "收起关键词搜索" : "展开关键词搜索"}
              title={keywordOpen ? "收起关键词搜索" : "展开关键词搜索"}
              on:click={() => keywordOpen = !keywordOpen}>
              <Search size={15} strokeWidth={1.75}/>关键词<ChevronDown size={13}/>
            </button>
            {#if keywordOpen}
              <div class="fm-keyword-inline-input">
                <input type="search" placeholder="搜索文件名…" aria-label="按文件名筛选"
                  bind:value={searchText} on:input={resetPage} use:focusKeywordInput
                  on:keydown={(event) => { if (event.key === "Escape") { event.stopPropagation(); keywordOpen = false; } }}/>
                {#if searchText}<button title="清除关键词" aria-label="清除关键词" on:click={() => { searchText = ""; resetPage(); }}><X size={14}/></button>{/if}
              </div>
            {/if}
          </div>

          <Popover.Root bind:open={typeOpen} portal closeOnEscape closeOnOutsideClick>
            <Popover.Trigger class={"fm-filter-pill " + (selectedExtensions.length ? "active" : "")}>
              <FileCode size={15} strokeWidth={1.75}/>
              {#if selectedExtensions.length === 1}格式 · {selectedExtensions[0] === "__no_extension__" ? "无后缀" : selectedExtensions[0]}
              {:else if selectedExtensions.length > 1}格式 · {selectedExtensions.length} 项
              {:else}格式{/if}
              <ChevronDown size={13}/>
            </Popover.Trigger>
            <Popover.Content class="fm-ui-popover fm-format-popover" sideOffset={7} align="start" collisionPadding={12}>
              <div class="fm-format-header">
                <strong>文件格式</strong>
                {#if selectedExtensions.length}<button on:click={clearExtensions}>清除选择</button>{/if}
              </div>
              <div class="fm-ui-search fm-format-search">
                <Search size={15} strokeWidth={1.75}/>
                <input type="search" placeholder="搜索扩展名…" aria-label="搜索文件扩展名" bind:value={formatSearch}/>
                {#if formatSearch}<button class="fm-format-search-clear" aria-label="清空扩展名搜索" on:click={() => formatSearch = ""}><X size={13}/></button>{/if}
              </div>
              <div class="fm-format-list">
                {#each searchedExtensions as option (option.extension)}
                  <button class="fm-format-option"
                    role="checkbox" aria-checked={selectedExtensions.includes(option.extension)}
                    on:click={() => toggleExtension(option.extension)}>
                    <span class:checked={selectedExtensions.includes(option.extension)} class="fm-format-checkbox">
                      {#if selectedExtensions.includes(option.extension)}<Check size={12} strokeWidth={2.25}/>{/if}
                    </span>
                    <span class="fm-format-name">{option.label}</span>
                    <span class="fm-format-count">{option.count}</span>
                  </button>
                {:else}
                  <div class="fm-format-empty">{extensionOptions.length ? "没有匹配的格式" : "当前文件夹没有附件"}</div>
                {/each}
              </div>
              <div class="fm-format-footer">
                <span>可多选 · {selectedExtensions.length ? "已选 " + selectedExtensions.length + " 项" : "显示全部格式"}</span>
              </div>
            </Popover.Content>
          </Popover.Root>

          <Popover.Root bind:open={sizeOpen} portal closeOnEscape closeOnOutsideClick>
            <Popover.Trigger class={"fm-filter-pill " + (sizeFilter !== "all" ? "active" : "")}>
              <SlidersHorizontal size={15} strokeWidth={1.75}/>{sizeFilter === "all" ? "文件大小" : fileSizeOptions.find(option => option.key === sizeFilter)?.label}<ChevronDown size={13}/>
            </Popover.Trigger>
            <Popover.Content class="fm-ui-popover fm-size-popover" sideOffset={7} align="start" collisionPadding={12}>
              <div class="fm-ui-title">文件大小</div>
              {#each fileSizeOptions as option (option.key)}
                <button class="fm-ui-option" class:active={sizeFilter === option.key} on:click={() => chooseSize(option.key)}>
                  <span class="fm-ui-radio" class:checked={sizeFilter === option.key}></span>
                  <span class="fm-ui-option-label">{option.label}{#if option.description}<small>{option.description}</small>{/if}</span>
                  {#if sizeFilter === option.key}<Check size={14}/>{/if}
                </button>
              {/each}
              <div class="fm-ui-note">大小信息使用思源 API 按需读取，不影响首次打开速度。</div>
            </Popover.Content>
          </Popover.Root>
          {#if activeFilterCount > 0}
            <button class="fm-filter-clear" on:click={clearFilters}><X size={13}/>清除筛选 <span>({activeFilterCount})</span></button>
          {/if}
        </div>
        {#if sizeLoading}
          <div class="fm-filter-status"><RefreshCw size={12} class="fm-spinning"/>读取大小 {sizeProgress}/{sizeTotal}</div>
        {:else}
          <div class="fm-filter-status">{filtered.length} 项</div>
        {/if}
      </div>

      <div class="fm-collection-heading">
        <h2>{crumbs.length ? crumbs[crumbs.length - 1] : "全部附件"}</h2>
        <div class="fm-selection-toolbar">
          {#if selectedFileNames.length}
            <span>已选 {selectedFileNames.length} 项</span>
            <button on:click={clearFileSelection} disabled={busy}>清除选择</button>
          {:else}
            <button on:click={selectAllImages} disabled={busy || !filtered.some((item) => supportsImageCompression(item.name))}>选择图片</button>
            <span class="fm-select-tip">拖动鼠标框选 · Ctrl 追加 / 调整</span>
          {/if}
          <button class="fm-batch-compress-button"
            disabled={busy || supportedSelectedImages.length === 0}
            on:click={openCompression}><ImageDown size={15} strokeWidth={1.8}/>
            压缩图片{#if supportedSelectedImages.length > 1} ({supportedSelectedImages.length}){/if}
          </button>
        </div>
        <span>{#if refreshing}<span class="fm-syncing"><RefreshCw size={12} class="fm-spinning"/> 更新中</span>{/if}{filtered.length} 项 <span>·</span> {fileCount} 个文件</span>
      </div>

      {#if error}<div class="fm-error" role="alert"><span>{error}</span><button title="关闭提示" on:click={closeError}><X size={14} /></button></div>{/if}
      <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
      <div class="fm-content" bind:this={scrollContainer}
        class:fm-marquee-active={marqueeCandidate?.active}
        on:pointerdown={beginMarqueeCandidate}
        on:pointermove={moveMarqueePointer}
        on:pointerup={endMarqueePointer}
        on:pointercancel={(event) => { if (marqueeCandidate?.pointerId === event.pointerId) cancelMarquee(true); }}
        on:lostpointercapture={(event) => { if (marqueeCandidate?.pointerId === event.pointerId) cancelMarquee(false); }}
        on:scroll={computeMarqueeSelection}
        on:click|capture={suppressMarqueeClick}
        on:dragstart|preventDefault>
        {#if loading}
          <div class="fm-cold-loading" aria-label="正在加载文件列表">
            <div class="fm-loading-label"><RefreshCw class="fm-spinning" size={17} /><span>首次读取目录，完成后再次打开将优先显示缓存…</span></div>
            <div class="fm-loading-grid">{#each Array(12) as _}<div class="fm-loading-tile"><div></div><span></span></div>{/each}</div>
          </div>
        {:else if filtered.length === 0}
          <div class="fm-empty"><FolderOpen size={35} strokeWidth={1.3} /><strong>没有找到文件</strong><span>试试修改筛选条件，或导入新的附件。</span></div>
        {:else if viewMode === "grid"}
          <div class="fm-gallery" style:--fm-tile-width="{zoom}px">
            {#each visible as item (item.name)}
              {@const kind = assetKind(item.name)}
              {@const path = assetRelativePath(currentFolder, item.name)}
              <button class:selected={selectedFileNames.includes(item.name)} class="fm-tile"
                data-fm-file-name={item.name}
                aria-pressed={selectedFileNames.includes(item.name)}
                title={item.name + "（Ctrl 多选，Shift 连选）"}
                on:click={(event) => handleFileClick(item, event)}
                on:dblclick={() => openPreview(item)}>
                {#if selectedFileNames.includes(item.name)}<span class="fm-tile-check"><Check size={12} strokeWidth={2.5}/></span>{/if}
                <div class:fm-folder-preview={item.isDir} class="fm-tile-preview">
                  {#if item.isDir}
                    <Folder size={46} strokeWidth={1.25} />
                  {:else if kind === "image"}
                    <img src={mediaUrl(path, item)} alt={item.name} loading="lazy" decoding="async" draggable="false" />
                  {:else}
                    <svelte:component this={iconFor(item.name)} size={39} strokeWidth={1.2} />
                    <span class="fm-file-extension">{item.name.split(".").pop()?.toUpperCase()}</span>
                  {/if}
                </div>
                <div class="fm-tile-title">{item.name}</div>
                <div class="fm-tile-sub">{item.isDir ? "文件夹" : kindNames[kind]}{#if item.size !== undefined && !item.isDir} · {formatSize(item.size)}{/if}</div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="fm-list">
            <div class="fm-list-header"><span>名称</span><span>类型</span><span>修改时间</span><span class="fm-list-size">文件大小</span></div>
            {#each visible as item (item.name)}
              <button class:selected={selectedFileNames.includes(item.name)} class="fm-list-row"
                data-fm-file-name={item.name}
                aria-pressed={selectedFileNames.includes(item.name)}
                on:click={(event) => handleFileClick(item, event)}
                use:observeListRowSize={item}>
                <span class="fm-list-name">{#if item.isDir}<Folder size={20} />{:else}<svelte:component this={iconFor(item.name)} size={20} />{/if}<span>{item.name}</span></span>
                <span>{item.isDir ? "文件夹" : kindNames[assetKind(item.name)]}</span>
                <span>{formatDate(item.updated)}</span>
                <span class="fm-list-size" title={sizeByPath[assetRelativePath(currentFolder, item.name)] !== undefined
                  ? sizeByPath[assetRelativePath(currentFolder, item.name)] + " B" : undefined}>
                  {#if item.isDir}—
                  {:else if sizeByPath[assetRelativePath(currentFolder, item.name)] !== undefined}
                    {formatSize(sizeByPath[assetRelativePath(currentFolder, item.name)])}
                  {:else if item.size !== undefined}{formatSize(item.size)}
                  {:else if listSizeUnavailable[assetRelativePath(currentFolder, item.name)]}—
                  {:else}<span class="fm-list-size-pending">读取中…</span>{/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
        {#if !loading && filtered.length > limit}
          <div class="fm-load-more" use:observeMore><button on:click={() => limit += INITIAL_PAGE_SIZE}>加载更多（剩余 {filtered.length - limit} 项）</button></div>
        {/if}
      </div>
      {#if marqueeOverlay}
        <div class="fm-marquee-selection"
          style:left="{marqueeOverlay.x}px" style:top="{marqueeOverlay.y}px"
          style:width="{marqueeOverlay.width}px" style:height="{marqueeOverlay.height}px"
          aria-hidden="true"></div>
      {/if}
      <footer class="fm-footer"><span>路径 · /data/assets{currentFolder ? "/" + currentFolder : ""}</span><button class="fm-full-scan-btn" title="资源索引遗漏内容时才需要完整磁盘扫描" on:click={deepScan} disabled={loading || refreshing || busy}>完整扫描</button></footer>
    </main>

    {#if inspectOpen}
      <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
      <div class="fm-panel-divider" role="separator" aria-label="调整右侧检查器宽度"
        aria-orientation="vertical" aria-valuemin={RIGHT_MIN} aria-valuemax={RIGHT_MAX} aria-valuenow={Math.round(rightWidth)}
        tabindex="0"
        on:pointerdown={(event) => startPanelResize("right", event)}
        on:pointermove={(event) => movePanelResize("right", event)}
        on:pointerup={finishPanelResize} on:pointercancel={finishPanelResize}
        on:keydown={(event) => resizePanelWithKeys("right", event)}></div>
      <aside class="fm-inspector" aria-label="文件属性检查器" style:width="{rightWidth}px" style:flex-basis="{rightWidth}px">
        <div class="fm-inspector-heading">
          <button aria-label="折叠检查器" title="折叠检查器" on:click={toggleRightPanel}><PanelRightClose size={17} strokeWidth={1.75}/></button>
          <strong>检查器</strong>
        </div>
        {#if selected}
          {@const kind = assetKind(selected.name)}
          <div class="fm-inspector-scroll">
            <div class="fm-inspector-preview">
              {#if kind === "image"}
                <img src={mediaUrl(selectedPath, selected)} alt={selected.name} on:load={(event) => { const image = event.currentTarget; dimensions = image.naturalWidth + " × " + image.naturalHeight; }} />
              {:else if kind === "video"}
                <!-- svelte-ignore a11y-media-has-caption -->
                <video src={mediaUrl(selectedPath, selected)} controls preload="metadata"></video>
              {:else if kind === "audio"}
                <AudioLines size={45} strokeWidth={1.2} /><audio src={mediaUrl(selectedPath, selected)} controls preload="none"></audio>
              {:else if kind === "document" && selected.name.toLowerCase().endsWith(".pdf")}
                <iframe src={mediaUrl(selectedPath, selected)} title={selected.name}></iframe>
              {:else}
                <svelte:component this={iconFor(selected.name)} size={46} strokeWidth={1.2} />
              {/if}
            </div>
            <strong class="fm-inspector-name" title={selected.name}>{selected.name}</strong>
            <div class="fm-inspector-kind">{kindNames[kind]}</div>
            <div class="fm-inspector-actions">
              <button on:click={() => copyText(assetUrl(selectedPath))}><Link2 size={14} />复制链接</button>
              <button on:click={downloadSelected}><Download size={14} />下载</button>
              <button disabled={busy} on:click={renameSelected}><Pencil size={14} />重命名</button>
              <button disabled={busy} on:click={() => replaceInput.click()}><RefreshCw size={14} />替换</button>
              {#if kind === "image"}
                <button disabled={busy || !supportsImageCompression(selected.name)}
                  title={supportsImageCompression(selected.name) ? "压缩图片并可迁移替换引用" : "暂不支持动图或 SVG 压缩"}
                  on:click={openCompression}><ImageDown size={14} />压缩图片</button>
              {/if}
            </div>
            <section class="fm-properties">
              <h3>文件信息</h3>
              <div><span>文件大小</span><strong>{formatSize(detailsSize)}</strong></div>
              {#if dimensions}<div><span>图片尺寸</span><strong>{dimensions}</strong></div>{/if}
              <div><span>文件格式</span><strong>{selected.name.split(".").pop()?.toUpperCase()}</strong></div>
              <div><span>修改时间</span><strong>{formatDate(selected.updated)}</strong></div>
              <div class="fm-path-prop"><span>附件路径</span><button title="点击复制完整附件路径" on:click={() => copyText("assets/" + selectedPath)}>assets/{selectedPath}<Copy size={13} /></button></div>
            </section>
            <section class="fm-properties fm-references">
              <div class="fm-ref-heading"><h3>引用位置</h3><button disabled={refsLoading} on:click={loadReferences}>{refsLoading ? "正在查询" : "查找引用"}</button></div>
              {#if refs !== null}
                <p>{refs.length === 0 ? "没有找到文档引用。" : "已找到 " + refs.length + " 处文档引用。"}{#if referencePathsLoading} <span class="fm-ref-progress">名称解析 {referencePathsResolved}/{referencePathsTotal}</span>{/if}</p>
                {#if ocrReferenceCount > 0}
                  <p class="fm-ref-ocr-note">另有 {ocrReferenceCount} 条图片 OCR 识别索引记录，不属于文档引用。</p>
                {/if}
                {#each refs.slice(0, 30) as ref, index (index)}
                  {@const documentId = getReferenceDocumentId(ref)}
                  {@const resolved = documentId && Object.prototype.hasOwnProperty.call(referenceDocPaths, documentId)}
                  {@const displayPath = !documentId
                    ? "暂时无法定位引用文档"
                    : resolved
                      ? (referenceDocPaths[documentId] || "无法读取文档名称")
                      : (referencePathsLoading ? "正在获取文档名称…" : "文档名称尚未加载")}
                  {@const parts = displayPath.split("/").filter(Boolean)}
                  <button class="fm-ref-row" title={displayPath} on:click={() => openReference(ref)} disabled={!documentId}>
                    <FileText size={15} />
                    <span class="fm-ref-location">
                      <strong>{parts[parts.length - 1] || "未知文档"}</strong>
                      {#if parts.length > 1}<small>{parts.slice(0, -1).join(" › ")}</small>{/if}
                    </span>
                    <ChevronRight size={13} />
                  </button>
                {/each}
                {#if refs.length > 30}<p>仅显示前 30 项。</p>{/if}
              {:else}
                <p>查看此附件被哪些思源文档引用。</p>
              {/if}
            </section>
          </div>
        {:else}
          <div class="fm-inspector-placeholder"><Info size={28} strokeWidth={1.3} /><strong>选择一个文件</strong><span>预览图片或媒体，查看大小、路径、引用和文件操作。</span></div>
        {/if}
      </aside>
    {/if}
  </div>
  <Dialog.Root bind:open={compressionOpen} portal closeOnOutsideClick={false}
    closeOnEscape={!compressionBusy}
    onOpenChange={(next) => { if (!next && !compressionBusy) clearCompressionResults(); }}>
    <Dialog.Overlay class="fm-compression-backdrop"/>
    <Dialog.Content class="fm-compression-dialog fm-batch-dialog">
      <div class="fm-compression-header">
        <div>
          <Dialog.Title>图片压缩与批量替换</Dialog.Title>
          <Dialog.Description>
            {#if compressionStage === "settings"}
              已选择 {compressionSources.length} 张图片，设置参数后直接开始压缩。
            {:else if compressionStage === "compressing"}
              在内存中生成压缩结果，不会上传或修改附件。
            {:else if compressionStage === "review"}
              默认勾选全部有效压缩结果；取消勾选即放弃，不上传新图片。
            {:else if compressionStage === "applying"}
              正在由思源逐张迁移文档和 OCR，并验证后安全清理旧图。
            {:else}
              已完成处理，请查看每张图片的最终状态。
            {/if}
          </Dialog.Description>
        </div>
        <button class="fm-compression-close" aria-label="关闭图片压缩"
          disabled={compressionBusy} on:click={closeCompression}><X size={19}/></button>
      </div>
      <div class="fm-compression-body">
        {#if compressionStage === "settings"}
          <div class="fm-compression-source">
            <Image size={16}/><span>{compressionSources.length === 1
              ? compressionSources[0].name : compressionSources.length + " 张待压缩图片"}</span>
          </div>
          <div class="fm-compression-options">
            <label>输出格式
              <select bind:value={compressionFormat} on:change={markCompressionDirty} disabled={compressionBusy}>
                {#each compressionFormatOptions as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label>最长边
              <select bind:value={compressionMaxEdge} on:change={markCompressionDirty} disabled={compressionBusy}>
                <option value={0}>保持原尺寸</option>
                <option value={1280}>1280 px</option>
                <option value={1920}>1920 px</option>
                <option value={2560}>2560 px</option>
                <option value={3840}>3840 px</option>
              </select>
            </label>
            <label>质量 {compressionFormat === "png" ? "（无损）" : compressionQuality + "%"}
              <input type="range" min="40" max="100" step="2" bind:value={compressionQuality}
                on:input={markCompressionDirty} disabled={compressionBusy || compressionFormat === "png"}
                aria-label="压缩质量"/>
            </label>
          </div>
          <p class="fm-compression-warning">
            支持静态 JPG、PNG、WebP、AVIF；不处理 GIF、APNG、动态 WebP/AVIF 或 SVG。
            最多 {MAX_COMPRESSION_BATCH} 张，最多同时压缩 2 张。JPEG 会将透明背景改为白色，
            转换可能清除 EXIF 等元数据。
          </p>
          <p class="fm-batch-commit-note">
            压缩结果只保存在内存中。完成后统一查看结果、默认全部勾选；
            只有再次确认的图片才会上传、迁移文档和 OCR，最后通过思源原生接口安全清理原图。
          </p>
        {:else}
          <div class="fm-batch-stats">
            <span>处理进度：
              {#if compressionStage === "compressing"}
                {compressionProcessed}/{compressionSources.length}
              {:else if compressionStage === "applying"}
                {compressionApplyProgress}/{compressionApplyTotal}
              {:else}
                {compressionRecords.length} 张
              {/if}
            </span>
            {#if compressionStage === "review"}
              <span>可替换 {compressionSummary.eligible} · 已勾选 {compressionSummary.selected} · 放弃/失败 {compressionRecords.length - compressionSummary.selected}</span>
            {:else if compressionStage === "completed"}
              <span>已替换 {compressionRecords.filter((item) => item.status === "replaced").length}
                · 需检查 {compressionRecords.filter((item) => item.status === "warning" || item.status === "failed").length}</span>
            {/if}
          </div>
          {#if compressionStage === "compressing" || compressionStage === "applying"}
            <progress class="fm-batch-progress" max={compressionStage === "compressing"
              ? compressionSources.length : Math.max(1, compressionApplyTotal)}
              value={compressionStage === "compressing" ? compressionProcessed : compressionApplyProgress}/>
          {/if}
          {#if compressionStage === "review"}
            <div class="fm-batch-select-all">
              <label><input type="checkbox"
                checked={compressionSummary.eligible > 0 && compressionSummary.selected === compressionSummary.eligible}
                on:change={(event) => selectCompressionChoices(event.currentTarget.checked)}/>
                全选有效结果
              </label>
              <strong>预计节省 {formatSize(compressionSummary.savedBytes)}</strong>
            </div>
          {/if}
          <div class="fm-batch-results">
            {#each compressionRecords as record (record.path)}
              <div class:checked={record.status === "ready" && record.checked} class="fm-batch-result">
                <div class="fm-batch-result-head">
                  {#if compressionStage === "review"}
                    <input type="checkbox" aria-label={"替换 " + record.name}
                      checked={record.checked && record.status === "ready"}
                      disabled={record.status !== "ready"}
                      on:change={() => toggleCompressionChoice(record.path)}/>
                  {:else}
                    <span class="fm-batch-result-icon">
                      {#if record.status === "replaced"}<Check size={16} strokeWidth={2}/>
                      {:else}<Image size={16} strokeWidth={1.6}/>{/if}
                    </span>
                  {/if}
                  <strong title={record.name}>{record.name}</strong>
                  <span class="fm-batch-result-status"
                    class:success={record.status === "ready" || record.status === "replaced"}
                    class:warning={record.status === "warning" || record.status === "larger" || record.status === "failed" || record.status === "error"}>
                    {#if record.status === "pending"}等待中
                    {:else if record.status === "processing"}正在压缩
                    {:else if record.status === "ready"}{record.checked ? "将替换" : "已放弃"}
                    {:else if record.status === "larger"}未节省空间
                    {:else if record.status === "error"}压缩失败
                    {:else if record.status === "discarded"}已放弃
                    {:else if record.status === "replacing"}正在迁移
                    {:else if record.status === "replaced"}已替换并清理原图
                    {:else if record.status === "warning"}迁移后需检查
                    {:else}替换失败{/if}
                  </span>
                </div>
                <div class="fm-batch-result-compare">
                  <div><img src={assetUrl(record.path)} alt={record.name + " 原图"} loading="lazy"/><small>原图{#if record.preview} · {formatSize(record.preview.originalSize)}{/if}</small></div>
                  <div>
                    {#if record.previewUrl}
                      <img src={record.previewUrl} alt={record.name + " 压缩结果"} loading="lazy"/>
                    {:else}
                      <div class="fm-batch-no-preview"><ImageDown size={22} strokeWidth={1.4}/></div>
                    {/if}
                    <small>压缩后{#if record.preview} · {formatSize(record.preview.blob.size)}{/if}</small>
                  </div>
                  <div class="fm-batch-result-savings">
                    {#if record.preview}
                      <strong class:fm-batch-negative={record.preview.blob.size >= record.preview.originalSize}>
                        {record.preview.blob.size < record.preview.originalSize ? "节省 " : "增加 "}
                        {Math.abs(Math.round((record.preview.originalSize - record.preview.blob.size) / record.preview.originalSize * 100))}%
                      </strong>
                      <small>{record.preview.width} × {record.preview.height}</small>
                    {:else}<span>—</span>{/if}
                  </div>
                </div>
                {#if record.error}<p class="fm-batch-result-error">{record.error}</p>{/if}
                {#if record.resultPath}<p class="fm-batch-result-path" title={record.resultPath}>新图：{record.resultPath}</p>{/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if compressionStep}<p class="fm-compression-status"><RefreshCw size={13}
          class={compressionBusy ? "fm-spinning" : ""}/>{compressionStep}</p>{/if}
        {#if compressionError}<div class="fm-compression-error" role="alert">{compressionError}</div>{/if}
      </div>
      <div class="fm-compression-footer">
        {#if compressionStage === "settings"}
          <button disabled={compressionBusy} on:click={closeCompression}>取消</button>
          <button class="fm-compression-apply" on:click={startBatchCompression}
            disabled={compressionBusy || compressionSources.length === 0}>开始压缩 ({compressionSources.length})</button>
        {:else if compressionStage === "review"}
          <button on:click={markCompressionDirty} disabled={compressionBusy}>调整参数</button>
          <button class="fm-compression-apply" on:click={applyBatchCompression}
            disabled={compressionBusy || compressionSummary.selected === 0}>确认替换 {compressionSummary.selected} 张</button>
        {:else if compressionStage === "completed"}
          <button class="fm-compression-apply" on:click={closeCompression}>完成</button>
        {:else}
          <button disabled>处理中，请等待…</button>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>
  {#if previewOpen && selected}
    <div class="fm-lightbox" role="dialog" aria-label="文件预览" aria-modal="true">
      <div class="fm-lightbox-toolbar">
        <span title={selected.name}>{selected.name}</span>
        <div>
          <button aria-label="上一个文件" title="上一个文件（←）" on:click={() => previewAdjacent(-1)}><ChevronRight class="fm-chevron-prev" size={18} /></button>
          <button aria-label="下一个文件" title="下一个文件（→）" on:click={() => previewAdjacent(1)}><ChevronRight size={18} /></button>
          <button aria-label="关闭预览" title="关闭预览（Esc）" on:click={() => previewOpen = false}><X size={19} /></button>
        </div>
      </div>
      <div class="fm-lightbox-content">
        {#if assetKind(selected.name) === "image"}
          <img src={mediaUrl(selectedPath, selected)} alt={selected.name} />
        {:else if assetKind(selected.name) === "video"}
          <!-- svelte-ignore a11y-media-has-caption -->
          <video src={mediaUrl(selectedPath, selected)} controls autoplay></video>
        {:else if assetKind(selected.name) === "audio"}
          <audio src={mediaUrl(selectedPath, selected)} controls autoplay></audio>
        {:else if selected.name.toLowerCase().endsWith(".pdf")}
          <iframe src={mediaUrl(selectedPath, selected)} title={selected.name}></iframe>
        {:else}
          <div class="fm-preview-unsupported"><svelte:component this={iconFor(selected.name)} size={56} strokeWidth={1.1} /><p>暂不支持在窗口内预览此格式</p><button on:click={downloadSelected}>下载文件</button></div>
        {/if}
      </div>
    </div>
  {/if}
</div>

