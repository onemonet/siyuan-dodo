import { TimelineBlockConfigService } from "../services/block-config-service";
import { getAppearanceConf, getBlockAttrs } from "../../../shared/av/kernel-api";

import { TimelineRendererService } from "../services/timeline-renderer";
import { isLightTimelineColor } from "../services/slide-color-contrast";
import { TimelineTableProvider } from "../services/table-provider";
import { TimelineTransformerService } from "../services/timeline-transformer";
import { materializeTimelineFieldMapping } from "../services/field-mapping";
import { TimelineBlockConfig, TimelineRenderableData, type TimelineRecordTarget } from "../types";
const VIEWS_ATTR = "custom-dodo-views";
let sourceQuery = new URLSearchParams(location.search).get("query") || "";

const loadingEl = document.getElementById("loading") as HTMLElement | null;
const errorEl = document.getElementById("error") as HTMLElement | null;
const timelineEl = document.getElementById("timeline") as HTMLElement | null;

const renderer = new TimelineRendererService();
/** Scoped to the database block and its native view; never share events across views. */
function currentTimelineStateKey(): string {
  const params = getSearchParams();
  const blockId = getBlockId(), viewId = params.get("viewId") || "";
  const valid = (id: string) => /^\d{14}-[a-z0-9]{7}$/.test(id);
  return valid(blockId) && valid(viewId) ? `dodo-timeline-active:${blockId}:${viewId}` : "";
}
function getSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function getBlockId(): string {
  const searchParams = getSearchParams();
  const fromQuery = searchParams.get("blockId") || searchParams.get("blockid");
  if (fromQuery) {
    return fromQuery;
  }

  const frameElement = window.frameElement as HTMLIFrameElement | null;
  return frameElement?.parentElement?.parentElement?.getAttribute("data-node-id") || "";
}

function detectDarkMode(): boolean {
  try {
    return Boolean((window.top as any)?.siyuan?.config?.appearance?.mode === 1);
  } catch (error) {
    return false;
  }
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

// ---- 主题适配（亮/暗） ----
let currentIsDark = detectDarkMode();
let renderedData: TimelineRenderableData | null = null;
let renderedConfig: TimelineBlockConfig | null = null;
const recordTargets = new Map<string, TimelineRecordTarget>();

/** TimelineJS assigns each slide's id from event.unique_id; do not use slide
 * position or headline text because dates may be filtered/reordered. */
function getRecordForSlide(target: EventTarget | null): TimelineRecordTarget | null {
  if (!(target instanceof Element) || !timelineEl?.contains(target)) return null;
  const slide = target.closest<HTMLElement>(".tl-slide:not(.tl-slide-titleslide)");
  if (!slide || !target.closest(".tl-headline")) return null;
  return recordTargets.get(slide.id) || null;
}

function decorateRecordTitles(): void {
  if (!timelineEl) return;

  // TimelineJS creates navigation groups asynchronously. Its vendor stylesheet
  // paints group labels #e0e0e0; use an inline important override so later
  // injected font styles and theme switches cannot restore white-on-gray text.
  const groupTextColor = currentIsDark ? "#dee2e6" : "#495057";
  // 每个可见分类独立编号，防止 TimelineJS 的 alternate/隐藏行影响配色。
  const groups = Array.from(timelineEl.querySelectorAll<HTMLElement>(".tl-timegroup:not(.tl-timegroup-hidden)"));
  groups.forEach((group, index) => {
    const colorIndex = String(index % 8);
    if (group.dataset.dodoGroupColor !== colorIndex) group.dataset.dodoGroupColor = colorIndex;
  });
  for (const label of timelineEl.querySelectorAll<HTMLElement>(".tl-timegroup-message")) {
    for (const textElement of [label, ...label.querySelectorAll<HTMLElement>("*")]) {
      textElement.style.setProperty("color", groupTextColor, "important");
      textElement.style.setProperty("text-shadow", "none", "important");
      textElement.style.setProperty("opacity", "1", "important");
    }
  }

  const canvasColor = getComputedStyle(document.documentElement).getPropertyValue("--tl-canvas").trim();
  const eventsById = new Map((renderedData?.events || []).map(event => [event.unique_id, event]));
  for (const slide of timelineEl.querySelectorAll<HTMLElement>(".tl-slide")) {
    // TimelineJS forces white text on all full-color slides, even white ones.
    // Only override light solid backgrounds; preserve white text on dark colors or images.
    if (slide.classList.contains("tl-full-color-background") && !slide.classList.contains("tl-full-image-background")) {
      const color = eventsById.get(slide.id)?.background?.color || getComputedStyle(slide).backgroundColor;
      slide.classList.toggle("dodo-timeline-light-bg", isLightTimelineColor(color, canvasColor));
    }
    const headline = slide.querySelector<HTMLElement>(".tl-headline");
    if (!headline || !recordTargets.has(slide.id) || headline.classList.contains("dodo-timeline-record-link")) continue;
    headline.classList.add("dodo-timeline-record-link");
    headline.tabIndex = 0;
    headline.setAttribute("role", "link");
    headline.title = "打开数据库条目";
  }
}

function openRecord(target: EventTarget | null): void {
  const record = getRecordForSlide(target);
  if (!record || window.parent === window) return;
  // Opening a native SiYuan tab can cause the parent AV block to re-render.
  // Persist the active slide before navigation even if TimelineJS has not yet
  // fired its debounced change event.
  renderer.rememberCurrentEvent();
  window.parent.postMessage({ type: "dodoTimelineOpenItem", ...record }, location.origin);
}

timelineEl?.addEventListener("click", event => openRecord(event.target));
timelineEl?.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    if (getRecordForSlide(event.target)) {
      event.preventDefault();
      openRecord(event.target);
    }
  }
});
if (timelineEl) new MutationObserver(() => decorateRecordTitles()).observe(timelineEl, { childList: true, subtree: true });

/**
 * 以内核 /api/system/getConf 的 appearance.mode 为权威来源；
 * 内核不可达时回退宿主 window.siyuan 同步值（独立打开时即亮色探测值）。
 * modeOS（跟随系统）时 mode 已是思源解析后的有效值，无需自行判断系统主题。
 */
async function resolveIsDark(): Promise<boolean> {
  try {
    return (await getAppearanceConf()).mode === 1;
  } catch (error) {
    console.warn("[timeline-preview] Failed to resolve appearance mode.", error);
    return detectDarkMode();
  }
}

function setTheme(isDark: boolean): void {
  currentIsDark = isDark;
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  if (renderedData && renderedConfig && timelineEl && !timelineEl.hidden) {
    // 已渲染过：销毁旧实例并用当前数据按新主题重绘，无需重载 iframe
    renderer.render(timelineEl, renderedData, renderedConfig, {
      isDarkMode: isDark, storageKey: currentTimelineStateKey(),
    });
  }
}

/**
 * 跟随宿主主题切换：思源切换外观必然伴随宿主根属性或样式表变化，
 * 观察到变化后经内核确认 mode，主题真的变了才重渲染。
 */
function watchHostTheme(): void {
  try {
    const top = window.top as (Window & { document?: Document }) | null;
    if (!top?.document) {
      return; // 独立打开的 iframe：无宿主主题可跟随
    }
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (timer !== null) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        void resolveIsDark().then((isDark) => {
          if (isDark !== currentIsDark) {
            setTheme(isDark);
          }
        });
      }, 300);
    });
    observer.observe(top.document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme-mode", "data-theme"],
    });
    if (top.document.body) {
      observer.observe(top.document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
    if (top.document.head) {
      observer.observe(top.document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "media"],
      });
    }
  } catch (error) {
    // 同源校验受限等场景：仅保留启动时的一次性适配
    console.warn("[timeline-preview] Host theme watching unavailable.", error);
  }
}

// ---- 错误 / 未配置说明卡片 ----

function showError(message: string): void {
  if (loadingEl) loadingEl.hidden = true;
  if (timelineEl) timelineEl.hidden = true;
  if (!errorEl) return;
  errorEl.textContent = "";
  const content = document.createElement("div");
  content.className = "status-card__content";
  content.appendChild(createTextElement("h3", "status-card__title", "时间线"));
  content.appendChild(createTextElement("p", "status-card__message", message));
  content.appendChild(createTextElement("p", "status-card__hint",
    "请检查数据库视图的日期字段映射，或通过视图右上角设置重新绑定。"));
  errorEl.appendChild(content);
  errorEl.hidden = false;
}
let renderRevision = 0;

async function renderTimeline(
  blockId: string,
  config: TimelineBlockConfig,
  revision: number
): Promise<void> {
  const tableData = await TimelineTableProvider.load(blockId, config);
  if (revision !== renderRevision) return;
  if (config.sourceType === "database" && tableData.columnIds?.some(Boolean)) {
    const initialized = materializeTimelineFieldMapping({
      headers: tableData.headers,
      columnIds: tableData.columnIds,
      columnNames: tableData.columnNames || tableData.headers,
      fieldTypes: tableData.fieldTypes || [],
    }, config.fieldMapping || {});
    if (initialized.changed) {
      // The host view config service serializes field bindings; the iframe
      // only updates its current render snapshot, never the stored JSON.
      config.fieldMapping = initialized.mapping;
    }
  }  const timelineData = TimelineTransformerService.transform(tableData, config);

  if (loadingEl) {
    loadingEl.hidden = true;
  }
  if (errorEl) {
    errorEl.hidden = true;
  }
  if (!timelineEl) {
    throw new Error("Missing timeline container.");
  }

  timelineEl.hidden = false;
  recordTargets.clear();
  if (config.sourceType === "database") {
    for (const item of timelineData.events) {
      if (item.unique_id && item.record) recordTargets.set(item.unique_id, item.record);
    }
  }
  renderer.render(timelineEl, timelineData, config, {
    isDarkMode: currentIsDark, storageKey: currentTimelineStateKey(),
  });
  renderedData = timelineData;
  renderedConfig = config;
  decorateRecordTitles();
}

async function boot(): Promise<void> {
  const revision = ++renderRevision;
  try {
    const dark = await resolveIsDark();
    if (revision !== renderRevision) return;
    setTheme(dark);

    const blockId = getBlockId();
    if (!blockId) {
      throw new Error("缺少时间线块 ID。");
    }

    const query = getSearchParams();
    const viewId = query.get("viewId") || "";
    let config: TimelineBlockConfig;
    if (viewId) {
      const attrs = await getBlockAttrs(blockId);
      if (revision !== renderRevision) return;
      const data = JSON.parse(attrs[VIEWS_ATTR] || '{"schemaVersion":1,"views":{}}');
      const entry = data.views?.[viewId];
      if (!entry || entry.mode !== "timeline" || !entry.configs?.timeline) {
        throw new Error("当前数据库视图未启用时间线。");
      }
      const avID = query.get("avID") || "";
      if (!/^\d{14}-[a-z0-9]{7}$/.test(avID)) throw new Error("数据库 ID 无效。");
      config = TimelineBlockConfigService.sanitizeConfig(blockId, {
        ...entry.configs.timeline,
        sourceType: "database", sourceBlockId: blockId, sourceAvID: avID, sourceViewID: viewId, sourceQuery,
      });
    } else {
      throw new Error("独立时间线块已移除，请使用数据库时间线视图。");
    }
    await renderTimeline(blockId, config, revision);
  } catch (error) {
    if (revision !== renderRevision) return;
    console.error("[timeline-preview] Failed to render timeline.", error);
    showError((error as Error).message || "时间线预览加载失败。");

  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "dodoVisualRefresh") return;
  if (!getSearchParams().get("viewId")) return;
  if (typeof event.data.query === "string") sourceQuery = event.data.query;
  void boot().catch(error => showError((error as Error).message || "时间线刷新失败。"));
});
watchHostTheme();
boot().catch((error) => {
  console.error("[timeline-preview] Failed to bootstrap iframe preview.", error);
  showError((error as Error).message || "时间线预览加载失败。");
});
