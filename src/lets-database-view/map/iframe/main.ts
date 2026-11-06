import { postJson, renderAttributeView } from "../../../shared/av/kernel-api";
import { resolveFieldBinding } from "../../../shared/av/field-binding";
import {
  DEFAULT_MAP_GLOBAL_SETTINGS,
  buildMapPreviewData,
  chooseMapPointName,
  type PointNameFallback,
  normalizeMapGlobalSettings,
  nativeLocationHasValue,
  parseMapConfig,
  truncateMapDisplayText,
  truncateMapHoverTitle,
  type MapBlockConfig,
  type MapGlobalSettings,
  type MapPoint,
  type MapUnlocatedItem,
  type MapPreviewData,
  type MapTableData,
} from "../map-data";
import { adaptAttributeViewRender } from "../../../shared/av/av-data-adapter";
import { DATABASE_VIEWS_ATTR, readDatabaseViewDocument } from "../../view-config-schema";

declare global {
  interface Window {
    L: any;
    AMap?: any;
    [key: string]: any;
  }
}

interface PointCluster {
  latitude: number;
  longitude: number;
  points: MapPoint[];
  representative: MapPoint;
}

interface SearchPlace {
  id: string;
  name: string;
  district: string;
  address: string;
  longitude: number;
  latitude: number;
}

interface ScreenPoint {
  x: number;
  y: number;
  distanceTo(other: ScreenPoint): number;
}

const L = window.L;
const databaseViewId = new URLSearchParams(window.location.search).get("viewId") || "";
const isDatabaseMapView = /^\d{14}-[a-z0-9]{7}$/.test(databaseViewId);
const DEFAULT_CENTER_WGS84: [number, number] = [121.4737, 31.2304];
const DEFAULT_ZOOM = 4;
const POINT_ZOOM = 12;
const SEARCH_ZOOM = 15;
const MARKER_TIP_HEIGHT = 10;
const AMAP_API_URL = "https://webapi.amap.com/maps";
const AMAP_TIPS_URL = "https://restapi.amap.com/v3/assistant/inputtips";
const AMAP_REVERSE_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo";

const mapElement = document.getElementById("map") as HTMLElement;
const tileError = document.getElementById("tile-error") as HTMLElement;
const searchRoot = document.getElementById("map-search") as HTMLElement;
const searchInput = document.getElementById("map-search-input") as HTMLInputElement;
const searchButton = document.getElementById("map-search-button") as HTMLButtonElement;
const searchResultsElement = document.getElementById("map-search-results") as HTMLElement;
const searchHint = document.getElementById("map-search-hint") as HTMLElement;
const mapAddHint = document.getElementById("map-add-hint") as HTMLElement;
const unlocatedPanel = document.getElementById("map-unlocated-panel") as HTMLElement;
const unlocatedTitle = document.getElementById("map-unlocated-title") as HTMLElement;
const unlocatedSearch = document.getElementById("map-unlocated-search") as HTMLInputElement;
const unlocatedList = document.getElementById("map-unlocated-list") as HTMLElement;
const locateConfirm = document.getElementById("map-locate-confirm") as HTMLElement;
const locateTitle = document.getElementById("map-locate-title") as HTMLElement;
const locateCoords = document.getElementById("map-locate-coords") as HTMLElement;
const locateSave = document.getElementById("map-locate-save") as HTMLButtonElement;

let leafletMap: any = null;
let leafletMarkerLayer: any = null;
let leafletSearchMarker: any = null;
let amapMap: any = null;
let amapMarkers: any[] = [];
let amapSearchMarker: any = null;
let googleMap: any = null;
let googleMarkers: any[] = [];
let googleSearchMarker: any = null;
let googleLoadPromise: Promise<any> | null = null;
let googleAuthFailed = false;
let googlePlacePredictions: any[] = [];
let googleSearchSession: any = null;

let activeEngine: "leaflet" | "amap-api2" | "google" | null = null;
let engineSignature = "";
let engineNotice = "";
let activeConfig: MapGlobalSettings = { ...DEFAULT_MAP_GLOBAL_SETTINGS };
let latestData: MapPreviewData = { points: [], message: "正在加载地图…" };
let activeMapTable: MapTableData | null = null;
let activeMapMapping: MapBlockConfig | null = null;
let addMode = false;
let mapAddingPoint = false;
let addModeSequence = 0;
let pendingPointRequestId = "";
let correctionPoint: MapPoint | null = null;
let unlocatedPanelOpen = false;
let locateTarget: MapUnlocatedItem | null = null;
let locateCandidate: {longitude: number; latitude: number} | null = null;
let locatePreviewMarker: any = null;
let locateRequestId = "";
let pendingMutationId = "";
let pendingMutationAction: "correct" | "delete" | null = null;
/** Single-point marker handles; only update/recluster markers, never the tile map. */
const singlePointMarkers = new Map<string, { engine: string; marker: any }>();
let revision = 0;
let lastRenderSignature = "";
/** 首次显示且没有缓存视角时才自动适配；数据刷新不改变当前视角。 */
let initialViewportPending = true;
let engineMapSource: MapGlobalSettings["mapSource"] | null = null;
let tileFailed = false;
let amapLoadPromise: Promise<any> | null = null;
let searchTimer = 0;
let searchToken = 0;
let searchItems: SearchPlace[] = [];
let activeSearchIndex = -1;

function resolveBlockId(): string {
  const queryId = new URLSearchParams(window.location.search).get("blockId") || "";
  if (queryId) return queryId;
  try {
    return (window.frameElement as HTMLIFrameElement | null)
      ?.closest<HTMLElement>("[data-node-id]")
      ?.dataset.nodeId || "";
  } catch {
    return "";
  }
}

function requestGlobalMapSettings(): Promise<MapGlobalSettings> {
  return new Promise((resolve) => {
    const requestId = `map-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const finish = (value?: Partial<MapGlobalSettings> | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(normalizeMapGlobalSettings(value));
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === window.parent &&
        event.data?.type === "dodoMapGlobalSettings" &&
        event.data?.requestId === requestId
      ) {
        finish(event.data?.settings);
      }
    };
    const timer = window.setTimeout(() => finish(DEFAULT_MAP_GLOBAL_SETTINGS), 1200);
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "dodoMapRequestSettings", requestId }, window.location.origin);
  });
}

async function loadMapContext(blockId: string): Promise<{
  table: MapTableData | null;
  config: MapBlockConfig;
  message: string;
}> {
  const attrs = await postJson<Record<string, string>>("/api/attr/getBlockAttrs", { id: blockId });
  if (!isDatabaseMapView) {
    throw new Error("独立地图块已移除，请使用数据库地图视图。");
  }
  const doc = readDatabaseViewDocument(attrs[DATABASE_VIEWS_ATTR]);
  const view = doc.views[databaseViewId];
  if (view?.mode !== "map" || !view.configs.map) {
    return { table: null, config: parseMapConfig(), message: "当前视图未启用 Dodo 地图。" };
  }
  const sourceId = blockId;
  const config = view.configs.map;  const domData = await postJson<{ dom: string }>("/api/block/getBlockDOM", { id: sourceId });
  const avID = (domData.dom || "").match(/data-av-id="([^"]+)"/)?.[1];
  if (!avID) return { table: null, config, message: "来源块必须是数据库块。" };

  const rendered = await renderAttributeView({
    id: avID,
    blockID: sourceId,
    page: 1,
    pageSize: 100000,
    ...({
      viewID: databaseViewId,
      query: (() => {
        try {
          return (window.frameElement as HTMLElement | null)?.closest(".av")
            ?.querySelector<HTMLElement>('.av__header [data-type="av-search"]')?.textContent?.trim() || "";
        } catch { return ""; }
      })(),
    }),
  });
  const table = adaptAttributeViewRender(rendered);
  // The native adapter may flatten a nonempty, malformed location cell into "".
  // Preserve this occupied status so it cannot appear in the blank-location list.
  const mapped = resolveFieldBinding(table, config.fieldMapping.coordinate, ["location"]);
  if (mapped.status === "resolved") {
    const rows = rendered.view?.rows?.length ? rendered.view.rows :
      (rendered.view?.groups || []).flatMap(group => group.rows || []);
    rows.forEach((row, index) => {
      const rawLocation = row.cells?.find(cell => cell.value?.keyID === mapped.id)?.value?.location;
      if (table.rows[index] && !String(table.rows[index][mapped.index] || "").trim() &&
          nativeLocationHasValue(rawLocation)) {
        table.rows[index][mapped.index] = "位置列已有内容但没有有效坐标";
      }
    });
  }
  return { table: { ...table, avID, databaseBlockID: sourceId }, config, message: "" };
}

async function ensureMapEngine(config: MapGlobalSettings): Promise<void> {
  const wantsAmapApi2 = config.mapSource === "amap" && config.useAmapApi2 && Boolean(config.amapKey);
  const wantsGoogle = config.mapSource === "google" && Boolean(config.googleKey) && Boolean(config.googleMapId);
  const desired = wantsGoogle ? `google:${config.googleKey}:${config.googleMapId}`
    : wantsAmapApi2 ? `amap-api2:${config.amapKey}` : `leaflet:${config.mapSource === "google" ? "osm" : config.mapSource}`;
  if (engineSignature === desired && activeEngine) {
    engineNotice = config.mapSource === "google" && !wantsGoogle
      ? "Google 地图需要 Key 和 Map ID，当前使用 OpenStreetMap。"
      : config.mapSource === "amap" && config.useAmapApi2 && !config.amapKey
        ? "API 2.0 需要高德 Key，当前使用高德瓦片地图。" : "";
    return;
  }

  destroyMapEngine();
  engineNotice = "";
  if (wantsGoogle) {
    try {
      await loadGoogleApi(config.googleKey);
      await initGoogleMap(config.googleMapId);
      engineSignature = desired;
      return;
    } catch (error) {
      console.warn("[地图块] Google Maps 初始化失败，已切换 OSM。", error);
      engineNotice = "Google Maps 加载失败（检查 Key、Map ID、结算、网络和浏览器来源限制），已回退 OpenStreetMap。";
      destroyMapEngine();
      initLeaflet("osm");
      engineSignature = `leaflet:osm:google-fallback:${config.googleKey}:${config.googleMapId}`;
      return;
    }
  }
  if (wantsAmapApi2) {
    try {
      await loadAmapApi(config.amapKey);
      initAmapApi2();
      engineSignature = desired;
      return;
    } catch {
      engineNotice = "高德 API 2.0 加载失败，已回退到高德瓦片地图。";
      initLeaflet("amap");
      engineSignature = `leaflet:amap:fallback:${config.amapKey}`;
      return;
    }
  }

  if (config.mapSource === "google") {
    engineNotice = "Google 地图需要 Key 和 Map ID，当前使用 OpenStreetMap。";
    initLeaflet("osm");
    engineSignature = desired;
    return;
  }
  if (config.mapSource === "amap" && config.useAmapApi2 && !config.amapKey) {
    engineNotice = "API 2.0 需要高德 Key，当前使用高德瓦片地图。";
  }
  initLeaflet(config.mapSource);
  engineSignature = desired;
}

function initLeaflet(source: "osm" | "amap"): void {
  engineMapSource = source;
  if (!L) throw new Error("Leaflet 未加载。");
  const center = source === "amap" ? wgs84ToGcj02(...DEFAULT_CENTER_WGS84) : DEFAULT_CENTER_WGS84;
  leafletMap = L.map("map", { zoomControl: false }).setView([center[1], center[0]], DEFAULT_ZOOM);
  const tiles = source === "amap"
    ? L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}", {
        attribution: "&copy; 高德地图",
        subdomains: ["1", "2", "3", "4"],
        maxZoom: 18,
      })
    : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      });
  tiles.addTo(leafletMap);
  leafletMarkerLayer = L.layerGroup().addTo(leafletMap);
  L.control.zoom({ position: "bottomright" }).addTo(leafletMap);
  tiles.on("loading", () => {
    tileFailed = false;
    tileError.hidden = true;
  });
  tiles.on("tileerror", () => {
    tileFailed = true;
    tileError.textContent = "底图加载失败，请检查网络连接。";
    tileError.hidden = false;
  });
  tiles.on("load", () => { tileError.hidden = !tileFailed; });
  leafletMap.on("zoomend", () => drawMarkers(false));
  leafletMap.on("zoomend", saveMapViewport);
  leafletMap.on("moveend", saveMapViewport);
  leafletMap.on("movestart", hidePointPreview);
  leafletMap.on("movestart", hidePointContextMenu);
  leafletMap.on("click", (event: any) => { void onMapLocationClick(Number(event?.latlng?.lng), Number(event?.latlng?.lat)); });
  activeEngine = "leaflet";
}

function initAmapApi2(): void {
  engineMapSource = "amap";
  const AMap = window.AMap;
  if (!AMap?.Map) throw new Error("高德 API 2.0 未加载。");
  const center = wgs84ToGcj02(...DEFAULT_CENTER_WGS84);
  amapMap = new AMap.Map("map", {
    center,
    zoom: DEFAULT_ZOOM,
    viewMode: "2D",
    resizeEnable: true,
  });
  amapMap.on?.("zoomend", () => drawMarkers(false));
  amapMap.on?.("zoomend", saveMapViewport);
  amapMap.on?.("moveend", saveMapViewport);
  amapMap.on?.("mapmove", hidePointPreview);
  amapMap.on?.("mapmove", hidePointContextMenu);
  amapMap.on?.("click", (event: any) => {
    const pos = event?.lnglat;
    void onMapLocationClick(Number(pos?.lng ?? pos?.getLng?.()), Number(pos?.lat ?? pos?.getLat?.()));
  });
  tileError.hidden = true;
  activeEngine = "amap-api2";
}

async function loadGoogleApi(key: string): Promise<any> {
  if (window.google?.maps?.importLibrary) return window.google.maps;
  if (googleLoadPromise) return googleLoadPromise;
  googleAuthFailed = false;
  window.gm_authFailure = () => {
    googleAuthFailed = true;
    if (activeEngine === "google") {
      engineNotice = "Google API Key 认证失败，已切换到 OpenStreetMap。请检查结算、API 授权及 HTTP 来源限制。";
      destroyMapEngine();
      initLeaflet("osm");
      engineSignature = `leaflet:osm:google-auth-fallback`;
      updateSearchUi();
      render(latestData);
    }
  };
  googleLoadPromise = new Promise((resolve, reject) => {
    const callbackName = `__dodoGoogleMaps${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[callbackName];
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.google.maps);
    };
    const timer = window.setTimeout(() => finish(new Error("Google Maps JS API 加载超时")), 12000);
    window[callbackName] = () => finish();
    script.async = true;
    script.onerror = () => finish(new Error("Google Maps JS API 网络加载失败"));
    const params = new URLSearchParams({ key, v: "weekly", loading: "async", callback: callbackName, language: "zh-CN" });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    document.head.appendChild(script);
  }).catch(error => { googleLoadPromise = null; throw error; });
  return googleLoadPromise;
}

async function initGoogleMap(mapId: string): Promise<void> {
  const maps = window.google?.maps;
  if (!maps?.importLibrary) throw new Error("Google Maps API 未加载");
  await Promise.all([maps.importLibrary("maps"), maps.importLibrary("marker")]);
  if (googleAuthFailed) throw new Error("Google Maps API Key 认证失败");
  if (!maps.marker?.AdvancedMarkerElement) throw new Error("Google 高级标记库不可用");
  engineMapSource = "google";
  googleMap = new maps.Map(mapElement, {
    center: { lat: DEFAULT_CENTER_WGS84[1], lng: DEFAULT_CENTER_WGS84[0] },
    zoom: DEFAULT_ZOOM,
    mapId,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  googleMap.addListener("zoom_changed", () => drawMarkers(false));
  googleMap.addListener("projection_changed", () => drawMarkers(false));
  googleMap.addListener("zoom_changed", saveMapViewport);
  googleMap.addListener("idle", saveMapViewport);
  googleMap.addListener("dragstart", hidePointPreview);
  googleMap.addListener("dragstart", hidePointContextMenu);
  googleMap.addListener("click", (event: any) => {
    if (!event.latLng) return;
    void onMapLocationClick(Number(event.latLng.lng()), Number(event.latLng.lat()));
  });
  tileError.hidden = true;
  activeEngine = "google";
}

function destroyMapEngine(): void {
  saveMapViewport();
  initialViewportPending = true;
  clearSearchMarker();
  hidePointPreview();
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    leafletMarkerLayer = null;
  }
  if (googleMap) {
    for (const marker of googleMarkers) marker.map = null;
    googleMarkers = [];
    googleMap = null;
  }
  if (amapMap) {
    amapMap.destroy?.();
    amapMap = null;
    amapMarkers = [];
  }
  activeEngine = null;
  engineMapSource = null;
  lastRenderSignature = "";
  mapElement.innerHTML = "";
  try { delete (mapElement as any)._leaflet_id; } catch { /* noop */ }
}

function loadAmapApi(key: string): Promise<any> {
  if (window.AMap?.Map) return Promise.resolve(window.AMap);
  if (amapLoadPromise) return amapLoadPromise;
  amapLoadPromise = new Promise((resolve, reject) => {
    const callbackName = `__dodoAmapApi2${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    let settled = false;
    const timer = window.setTimeout(() => finish(reject, new Error("高德 API 2.0 加载超时。")), 8000);
    const finish = (done: (value?: any) => void, value?: any) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      delete window[callbackName];
      script.onerror = null;
      done(value);
    };
    window[callbackName] = () => finish(resolve, window.AMap);
    script.async = true;
    script.onerror = () => finish(reject, new Error("高德 API 2.0 加载失败。"));
    const params = new URLSearchParams({ v: "2.0", key: key.trim(), callback: callbackName });
    script.src = `${AMAP_API_URL}?${params.toString()}`;
    document.head.appendChild(script);
  }).catch((error) => {
    amapLoadPromise = null;
    throw error;
  });
  return amapLoadPromise;
}

function displayCoordinate(point: MapPoint): [number, number] {
  return activeConfig.mapSource === "amap"
    ? wgs84ToGcj02(point.longitude, point.latitude)
    : [point.longitude, point.latitude];
}

function screenPoint(point: MapPoint): ScreenPoint {
  const [longitude, latitude] = displayCoordinate(point);
  let raw: any;
  if (activeEngine === "amap-api2" && amapMap) {
    raw = amapMap.lngLatToContainer?.([longitude, latitude]);
  } else if (activeEngine === "google" && googleMap) {
    const maps = window.google.maps;
    const projection = googleMap.getProjection?.();
    const origin = googleMap.getCenter?.();
    const a = projection?.fromLatLngToPoint?.(new maps.LatLng(latitude, longitude));
    const b = origin && projection?.fromLatLngToPoint?.(origin);
    if (a && b) {
      let dx = a.x - b.x;
      if (dx > 128) dx -= 256;
      if (dx < -128) dx += 256;
      const scale = 2 ** getZoom();
      raw = { x: dx * scale, y: (a.y - b.y) * scale };
    }
  } else if (leafletMap) {
    raw = leafletMap.latLngToLayerPoint([latitude, longitude]);
  }
  const x = Number(raw?.x ?? longitude * 100);
  const y = Number(raw?.y ?? latitude * 100);
  return { x, y, distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y); } };
}

function clusterPoints(points: MapPoint[]): PointCluster[] {
  if (!activeEngine) return [];
  let radius = clusterRadius(getZoom());
  let result = clusterWithRadius(points, radius);
  while (result.length > 260 && radius < 128) {
    radius = Math.min(128, radius * 1.3);
    result = clusterWithRadius(points, radius);
  }
  return result;
}

function clusterWithRadius(points: MapPoint[], radius: number): PointCluster[] {
  const clusters: Array<{ points: MapPoint[]; screen: ScreenPoint; latSum: number; lngSum: number }> = [];
  for (const point of points) {
    const screen = screenPoint(point);
    let nearest: typeof clusters[number] | null = null;
    let nearestDistance = Infinity;
    for (const cluster of clusters) {
      const distance = screen.distanceTo(cluster.screen);
      if (distance <= radius && distance < nearestDistance) {
        nearest = cluster;
        nearestDistance = distance;
      }
    }
    if (!nearest) {
      clusters.push({ points: [point], screen, latSum: point.latitude, lngSum: point.longitude });
      continue;
    }
    const count = nearest.points.length + 1;
    nearest.points.push(point);
    nearest.latSum += point.latitude;
    nearest.lngSum += point.longitude;
    nearest.screen = {
      x: nearest.screen.x + ((screen.x - nearest.screen.x) / count),
      y: nearest.screen.y + ((screen.y - nearest.screen.y) / count),
      distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y); },
    };
  }
  return clusters.map((cluster) => {
    const latitude = cluster.latSum / cluster.points.length;
    const longitude = cluster.lngSum / cluster.points.length;
    const representative = cluster.points.reduce((best, point) => {
      const distance = ((point.latitude - latitude) ** 2) + ((point.longitude - longitude) ** 2);
      const bestDistance = ((best.latitude - latitude) ** 2) + ((best.longitude - longitude) ** 2);
      return distance < bestDistance ? point : best;
    });
    return { latitude, longitude, points: cluster.points, representative };
  });
}

function clusterRadius(zoom: number): number {
  return Math.min(112, Math.max(22, 96 - Math.max(0, zoom - DEFAULT_ZOOM) * 8));
}

function getZoom(): number {
  if (activeEngine === "google" && googleMap) return Number(googleMap.getZoom?.() ?? DEFAULT_ZOOM);
  if (activeEngine === "amap-api2" && amapMap) return Number(amapMap.getZoom?.() || DEFAULT_ZOOM);
  return Number(leafletMap?.getZoom?.() || DEFAULT_ZOOM);
}

/** 每张地图单独保存 WGS84 中心与缩放，iframe/页签重建后复原。 */
interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
}

function viewportStorageKey(): string {
  const blockId = resolveBlockId();
  return /^\d{14}-[a-z0-9]{7}$/.test(blockId) ? `dodo-map-viewport-v1:${blockId}${isDatabaseMapView ? `:${databaseViewId}` : ""}` : "";
}

function saveMapViewport(): void {
  // 初次地图初始化到默认中国全图时，不可覆盖之前的放大视角。
  if (initialViewportPending || !activeEngine) return;
  let longitude: number;
  let latitude: number;
  if (activeEngine === "google" && googleMap) {
    const center = googleMap.getCenter?.();
    longitude = Number(center?.lng?.());
    latitude = Number(center?.lat?.());
  } else if (activeEngine === "amap-api2" && amapMap) {
    const center = amapMap.getCenter?.();
    longitude = Number(center?.lng ?? center?.getLng?.());
    latitude = Number(center?.lat ?? center?.getLat?.());
  } else if (leafletMap) {
    const center = leafletMap.getCenter?.();
    longitude = Number(center?.lng);
    latitude = Number(center?.lat);
  } else return;
  const zoom = getZoom();
  if (![longitude, latitude, zoom].every(Number.isFinite) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || zoom < 0 || zoom > 25) return;
  const wgs = engineMapSource === "amap" ? gcj02ToWgs84(longitude, latitude) : [longitude, latitude];
  const key = viewportStorageKey();
  if (!key) return;
  try {
    const viewport: MapViewport = { longitude: wgs[0], latitude: wgs[1], zoom };
    sessionStorage.setItem(key, JSON.stringify(viewport));
  } catch { /* 隐私设置或容量限制时仍保留当前 iframe 的视角 */ }
}

function restoreMapViewport(): boolean {
  const key = viewportStorageKey();
  if (!key || !activeEngine) return false;
  let viewport: MapViewport;
  try {
    const saved = sessionStorage.getItem(key);
    if (!saved) return false;
    viewport = JSON.parse(saved) as MapViewport;
  } catch { return false; }
  const { longitude, latitude, zoom } = viewport;
  if (![longitude, latitude, zoom].every(Number.isFinite) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || zoom < 0 || zoom > 25) return false;
  const center = engineMapSource === "amap" ? wgs84ToGcj02(longitude, latitude) : [longitude, latitude];
  invalidateMapSize();
  if (activeEngine === "google" && googleMap) {
    googleMap.setCenter?.({ lng: center[0], lat: center[1] });
    googleMap.setZoom?.(zoom);
  } else if (activeEngine === "amap-api2" && amapMap) {
    amapMap.setZoomAndCenter?.(zoom, center);
  } else if (leafletMap) {
    leafletMap.setView([center[1], center[0]], zoom, { animate: false });
  } else return false;
  return true;
}
function drawMarkers(fit: boolean): void {
  singlePointMarkers.clear();
  hidePointPreview();
  hidePointContextMenu();
  if (activeEngine === "leaflet") drawLeafletMarkers();
  else if (activeEngine === "google") drawGoogleMarkers();
  else drawAmapMarkers();
  if (fit) fitAll();
}

function drawLeafletMarkers(): void {
  if (!leafletMap || !leafletMarkerLayer) return;
  leafletMarkerLayer.clearLayers();
  for (const cluster of clusterPoints(latestData.points)) {
    const display = displayCoordinate(cluster.representative);
    const marker = L.marker([display[1], display[0]], {
      icon: createLeafletPhotoIcon(cluster),
      riseOnHover: true,
      title: cluster.points.length === 1 ? truncateMapHoverTitle(cluster.representative.title) : "",
    });
    marker.on("click", () => { if (!addMode && !correctionPoint && !locateTarget) handleMarkerClick(cluster, marker.getElement()); });
    marker.addTo(leafletMarkerLayer);
    if (cluster.points.length === 1 && cluster.points[0].itemId) {
      singlePointMarkers.set(cluster.points[0].itemId, { engine: "leaflet", marker });
    }
    attachMarkerHover(marker.getElement(), cluster);
    attachPointContextMenu(marker.getElement(), cluster);
  }
}

function drawGoogleMarkers(): void {
  if (!googleMap || !window.google?.maps?.marker?.AdvancedMarkerElement) return;
  for (const marker of googleMarkers) marker.map = null;
  googleMarkers = [];
  const AdvancedMarkerElement = window.google.maps.marker.AdvancedMarkerElement;
  for (const cluster of clusterPoints(latestData.points)) {
    const dimensions = markerDimensions(cluster);
    const root = document.createElement("div");
    root.className = "photo-marker-google";
    root.style.width = `${dimensions.width}px`;
    root.style.height = `${dimensions.height}px`;
    root.innerHTML = buildMarkerHtml(cluster);
    const marker = new AdvancedMarkerElement({
      map: googleMap,
      position: { lat: cluster.representative.latitude, lng: cluster.representative.longitude },
      content: root,
      title: cluster.points.length === 1 ? truncateMapHoverTitle(cluster.representative.title) : `${cluster.points.length} 个地点`,
      zIndex: cluster.points.length > 1 ? 1500 : 1000,
    });
    marker.addListener?.("click", (event: any) => {
      event?.domEvent?.stopPropagation?.();
      if (!addMode && !correctionPoint && !locateTarget) handleMarkerClick(cluster, root);
    });
    attachMarkerHover(root, cluster);
    attachPointContextMenu(root, cluster);
    googleMarkers.push(marker);
    if (cluster.points.length === 1 && cluster.points[0].itemId) {
      singlePointMarkers.set(cluster.points[0].itemId, { engine: "google", marker });
    }
  }
}

function drawAmapMarkers(): void {
  if (!amapMap || !window.AMap) return;
  for (const marker of amapMarkers) marker.setMap?.(null);
  amapMarkers = [];
  for (const cluster of clusterPoints(latestData.points)) {
    const display = displayCoordinate(cluster.representative);
    const dimensions = markerDimensions(cluster);
    const root = document.createElement("div");
    root.className = "photo-marker-amap";
    root.style.width = `${dimensions.width}px`;
    root.style.height = `${dimensions.height}px`;
    root.innerHTML = buildMarkerHtml(cluster);
    const marker = new window.AMap.Marker({
      position: display,
      content: root,
      offset: new window.AMap.Pixel(
        -Math.round(dimensions.width / 2),
        -dimensions.height,
      ),
      title: cluster.points.length === 1 ? truncateMapHoverTitle(cluster.representative.title) : "",
    });
    attachMarkerHover(root, cluster);
    attachPointContextMenu(root, cluster);
    marker.on?.("click", (event: any) => {
      event?.originalEvent?.stopPropagation?.();
      if (!addMode && !correctionPoint && !locateTarget) handleMarkerClick(cluster, root);
    });
    marker.setMap(amapMap);
    amapMarkers.push(marker);
    if (cluster.points.length === 1 && cluster.points[0].itemId) {
      singlePointMarkers.set(cluster.points[0].itemId, { engine: "amap-api2", marker });
    }
  }
}

function markerDimensions(cluster: PointCluster): { width: number; height: number } {
  const hasImage = cluster.points.some((point) => Boolean(point.image));
  if (hasImage) return { width: cluster.points.length > 1 ? 58 : 64, height: (cluster.points.length > 1 ? 58 : 64) + MARKER_TIP_HEIGHT };
  const text = truncateMapDisplayText(
    (cluster.representative.displayText || cluster.representative.title || "地点").trim(),
  );
  return {
    width: Math.min(190, Math.max(44, Array.from(text).length * 13 + 18)),
    height: 30 + MARKER_TIP_HEIGHT,
  };
}

function createLeafletPhotoIcon(cluster: PointCluster): unknown {
  const dimensions = markerDimensions(cluster);
  return L.divIcon({
    className: "photo-marker-leaflet",
    html: buildMarkerHtml(cluster),
    iconSize: [dimensions.width, dimensions.height],
    iconAnchor: [Math.round(dimensions.width / 2), dimensions.height],
    popupAnchor: [0, -dimensions.height],
  });
}

function buildMarkerHtml(cluster: PointCluster): string {
  const count = cluster.points.length;
  const imagePoint = cluster.representative.image
    ? cluster.representative
    : cluster.points.find((point) => Boolean(point.image));
  const image = imagePoint?.image;
  const displayText = (cluster.representative.displayText || cluster.representative.title || "地点").trim();

  if (!image) {
    return `<div class="text-map-marker"${count === 1 ? ` title="${escapeHtml(truncateMapHoverTitle(displayText))}"` : ""}>
      ${escapeHtml(truncateMapDisplayText(displayText))}
      ${count > 1 ? `<span class="photo-marker-badge">${count > 999 ? "999+" : count}</span>` : ""}
    </div>`;
  }

  const content = `<span class="photo-marker-cover" style="background-image:url(&quot;${escapeHtml(image)}&quot;)"></span>`;
  return `<div class="photo-map-marker${count > 1 ? " is-cluster" : " is-single"}">
    <div class="photo-marker-thumb">${content}</div>
    ${count > 1 ? `<span class="photo-marker-badge">${count > 999 ? "999+" : count}</span>` : ""}
  </div>`;
}

/** 相同的悬浮列表用于 Leaflet 和高德，避免地图引擎自带弹窗的滚动差异。 */
const pointPreview = document.createElement("div");
pointPreview.className = "map-point-preview";
pointPreview.hidden = true;
document.body.appendChild(pointPreview);
let previewHideTimer = 0;
let previewPinned = false;
let previewAnchor: HTMLElement | null = null;

function cancelPreviewHide(): void {
  window.clearTimeout(previewHideTimer);
  previewHideTimer = 0;
}

function hidePointPreview(): void {
  cancelPreviewHide();
  pointPreview.hidden = true;
  pointPreview.innerHTML = "";
  previewPoints = [];
  previewAnchor = null;
  previewPinned = false;
}

function schedulePreviewHide(): void {
  if (previewPinned) return;
  cancelPreviewHide();
  previewHideTimer = window.setTimeout(() => hidePointPreview(), 350);
}

function positionPointPreview(anchor: HTMLElement): void {
  if (pointPreview.hidden || !anchor.isConnected) return;
  const marker = anchor.getBoundingClientRect();
  const popup = pointPreview.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - popup.width - 8,
    marker.left + (marker.width - popup.width) / 2));
  const top = marker.top - popup.height - 10;
  const y = top >= 8 ? top : Math.min(window.innerHeight - popup.height - 8, marker.bottom + 10);
  pointPreview.style.left = `${Math.max(8, x)}px`;
  pointPreview.style.top = `${Math.max(8, y)}px`;
}

let previewPoints: MapPoint[] = [];

function isMapPointOpenable(point: MapPoint): boolean {
  const validId = (id: string) => /^\d{14}-[a-z0-9]{7}$/.test(id);
  return validId(point.blockId) || [point.itemId, point.valueId, point.avID, point.databaseBlockID].every(validId);
}

function pointRowHtml(point: MapPoint, index: number): string {
  const title = escapeHtml(truncateMapHoverTitle(point.title));
  return isMapPointOpenable(point)
    ? `<button class="map-preview-row" type="button" data-map-item-index="${index}">${title}</button>`
    : `<span class="map-preview-row is-disabled">${title}</span>`;
}

function showPointPreview(cluster: PointCluster, anchor: HTMLElement, pinned = false): void {
  if (!anchor || !anchor.isConnected) return;
  cancelPreviewHide();
  previewPinned = pinned;
  previewAnchor = anchor;
  previewPoints = cluster.points;
  pointPreview.classList.toggle("is-cluster", cluster.points.length > 1);
  pointPreview.innerHTML = cluster.points.length === 1
    ? `<div class="map-preview-single">${escapeHtml(truncateMapHoverTitle(cluster.points[0].title))}</div>`
    : `<div class="map-preview-count">共 ${cluster.points.length} 个地点</div>
       <div class="map-preview-list" role="list">${cluster.points.map(pointRowHtml).join("")}</div>`;
  pointPreview.hidden = false;
  positionPointPreview(anchor);
}

function attachMarkerHover(element: HTMLElement | null, cluster: PointCluster): void {
  if (!element) return;
  element.addEventListener("mouseenter", () => {
    if (addMode || correctionPoint || cluster.points.length > 1) return;
    if (previewPinned && previewAnchor === element) return;
    showPointPreview(cluster, element);
  });
  element.addEventListener("mouseleave", schedulePreviewHide);
}

/** 单点右键菜单：聚合点没有此菜单，避免不知道要编辑哪一条记录。 */
const pointContextMenu = document.createElement("div");
pointContextMenu.className = "map-point-context-menu";
pointContextMenu.hidden = true;
pointContextMenu.setAttribute("role", "menu");
pointContextMenu.innerHTML = `
  <button type="button" role="menuitem" data-action="correct">矫正位置</button>
  <button type="button" role="menuitem" class="is-danger" data-action="delete">删除</button>`;
document.body.appendChild(pointContextMenu);
let contextPoint: MapPoint | null = null;

function hidePointContextMenu(): void {
  pointContextMenu.hidden = true;
  contextPoint = null;
}

function attachPointContextMenu(element: HTMLElement | null, cluster: PointCluster): void {
  if (!element || cluster.points.length !== 1) return;
  const point = cluster.points[0];
  if (![point.itemId, point.avID, point.databaseBlockID].every(id => /^\d{14}-[a-z0-9]{7}$/.test(id))) return;
  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (addMode || correctionPoint || locateTarget || mapAddingPoint) return;
    hidePointPreview();
    contextPoint = point;
    pointContextMenu.hidden = false;
    const width = pointContextMenu.offsetWidth;
    const height = pointContextMenu.offsetHeight;
    pointContextMenu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - width - 6))}px`;
    pointContextMenu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - height - 6))}px`;
  });
}

function exitPointCorrection(): void {
  correctionPoint = null;
  addModeSequence += 1;
  document.body.classList.remove("map-correct-mode");
  if (!addMode) mapAddHint.hidden = true;
  mapAddHint.classList.remove("is-error", "is-busy");
}

function activatePointCorrection(point: MapPoint): void {
  hidePointContextMenu();
  hidePointPreview();
  correctionPoint = point;
  addModeSequence += 1;
  document.body.classList.add("map-correct-mode");
  mapAddHint.hidden = false;
  mapAddHint.classList.remove("is-error", "is-busy");
  mapAddHint.textContent = "矫正位置：单击新位置（Esc 取消）";
}

/**
 * Accessible, styled replacement for window.confirm() in both standalone and
 * native database map iframes. Does not mutate data until callers confirm.
 */
class MapDeleteDialog {
  private readonly overlay: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private resolvePending: ((confirmed: boolean) => void) | null = null;
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly doc: Document = document) {
    const overlay = doc.createElement("div");
    overlay.className = "map-delete-overlay";
    overlay.hidden = true;

    const dialog = doc.createElement("section");
    dialog.className = "map-delete-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "map-delete-dialog-title");
    dialog.setAttribute("aria-describedby", "map-delete-dialog-description");

    const heading = doc.createElement("h2");
    heading.id = "map-delete-dialog-title";
    heading.textContent = "确认删除地点？";

    const title = doc.createElement("p");
    title.className = "map-delete-dialog-point";

    const description = doc.createElement("p");
    description.id = "map-delete-dialog-description";
    description.className = "map-delete-dialog-description";
    description.textContent = "将从来源数据库移除该条目及地图坐标。若条目关联文档，原文档不会被删除。";

    const actions = doc.createElement("div");
    actions.className = "map-delete-dialog-actions";

    const cancelButton = doc.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "map-delete-dialog-cancel";
    cancelButton.textContent = "取消";

    const deleteButton = doc.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "map-delete-dialog-confirm";
    deleteButton.textContent = "确认删除";

    actions.append(cancelButton, deleteButton);
    dialog.append(heading, title, description, actions);
    overlay.append(dialog);
    doc.body.append(overlay);

    this.overlay = overlay;
    this.title = title;
    this.cancelButton = cancelButton;
    this.deleteButton = deleteButton;

    cancelButton.addEventListener("click", () => this.close(false));
    deleteButton.addEventListener("click", () => this.close(true));
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) this.close(false);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close(false);
      } else if (event.key === "Tab") {
        // Keep keyboard focus inside the two-action confirmation.
        const next = event.shiftKey ? this.deleteButton : this.cancelButton;
        if (this.doc.activeElement === (event.shiftKey ? this.cancelButton : this.deleteButton)) {
          event.preventDefault();
          next.focus();
        }
      }
    });
  }

  confirm(name: string): Promise<boolean> {
    if (this.resolvePending) return Promise.resolve(false);
    this.previousFocus = this.doc.activeElement instanceof HTMLElement
      ? this.doc.activeElement : null;
    // textContent prevents map titles injecting markup into a destructive UI.
    this.title.textContent = name.trim() || "未命名地点";
    this.overlay.hidden = false;
    this.cancelButton.focus();
    return new Promise<boolean>((resolve) => { this.resolvePending = resolve; });
  }

  close(confirmed: boolean): void {
    if (!this.resolvePending) return;
    const resolve = this.resolvePending;
    this.resolvePending = null;
    this.overlay.hidden = true;
    this.previousFocus?.focus();
    this.previousFocus = null;
    resolve(confirmed);
  }
}
const mapDeleteDialog = new MapDeleteDialog();

async function requestPointDeletion(point: MapPoint): Promise<void> {
  hidePointContextMenu();
  if (mapAddingPoint || pendingMutationId) return;
  if (!await mapDeleteDialog.confirm(point.title)) return;
  // Recheck after the asynchronous dialog: the iframe state may have changed.
  if (mapAddingPoint || pendingMutationId) return;
  mapAddingPoint = true;
  pendingMutationAction = "delete";
  pendingMutationId = `map-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.parent.postMessage({
    type: "dodoMapMutatePoint", action: "delete", requestId: pendingMutationId,
    point: { itemId: point.itemId, avID: point.avID, databaseBlockID: point.databaseBlockID },
  }, window.location.origin);
}

pointContextMenu.addEventListener("pointerdown", event => event.stopPropagation());
pointContextMenu.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
  if (!button || !contextPoint) return;
  event.preventDefault();
  event.stopPropagation();
  const point = contextPoint;
  if (button.dataset.action === "correct") activatePointCorrection(point);
  else if (button.dataset.action === "delete") void requestPointDeletion(point);
});
document.addEventListener("pointerdown", event => {
  if (!pointContextMenu.hidden && !pointContextMenu.contains(event.target as Node)) hidePointContextMenu();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  hidePointContextMenu();
  if (correctionPoint && !mapAddingPoint) exitPointCorrection();
  if ((locateTarget || unlocatedPanelOpen) && !locateRequestId) exitLocateExisting();
});
function openMapPoint(point: MapPoint): void {
  if (!isMapPointOpenable(point)) return;
  window.parent.postMessage({
    type: "dodoMapOpenItem",
    blockId: point.blockId,
    itemId: point.itemId,
    valueId: point.valueId,
    avID: point.avID,
    databaseBlockID: point.databaseBlockID,
    title: point.title,
  }, window.location.origin);
}

function handleMarkerClick(cluster: PointCluster, element: HTMLElement | null): void {
  if (cluster.points.length === 1) {
    openMapPoint(cluster.points[0]);
    hidePointPreview();
  } else if (element) {
    showPointPreview(cluster, element, true);
  }
}

pointPreview.addEventListener("mouseenter", cancelPreviewHide);
pointPreview.addEventListener("mouseleave", schedulePreviewHide);
pointPreview.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-map-item-index]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const point = previewPoints[Number(button.dataset.mapItemIndex)];
  if (point) openMapPoint(point);
});
document.addEventListener("pointerdown", (event) => {
  if (pointPreview.hidden || !previewPinned) return;
  const target = event.target as Node;
  if (!pointPreview.contains(target) && !previewAnchor?.contains(target)) hidePointPreview();
});
function fitAll(): void {
  const points = latestData.points;
  invalidateMapSize();
  if (activeEngine === "leaflet" && leafletMap) {
    if (!points.length) {
      const center = activeConfig.mapSource === "amap" ? wgs84ToGcj02(...DEFAULT_CENTER_WGS84) : DEFAULT_CENTER_WGS84;
      leafletMap.setView([center[1], center[0]], DEFAULT_ZOOM);
    } else if (points.length === 1) {
      const [longitude, latitude] = displayCoordinate(points[0]);
      leafletMap.setView([latitude, longitude], POINT_ZOOM);
    } else {
      const bounds = L.latLngBounds(points.map((point) => {
        const [longitude, latitude] = displayCoordinate(point);
        return [latitude, longitude];
      }));
      leafletMap.fitBounds(bounds, { padding: [42, 42] });
    }
    return;
  }

  if (activeEngine === "google" && googleMap) {
    const maps = window.google.maps;
    if (!points.length) {
      googleMap.setCenter({ lat: DEFAULT_CENTER_WGS84[1], lng: DEFAULT_CENTER_WGS84[0] });
      googleMap.setZoom(DEFAULT_ZOOM);
    } else if (points.length === 1) {
      googleMap.setCenter({ lat: points[0].latitude, lng: points[0].longitude });
      googleMap.setZoom(POINT_ZOOM);
    } else {
      const bounds = new maps.LatLngBounds();
      for (const point of points) bounds.extend({ lat: point.latitude, lng: point.longitude });
      googleMap.fitBounds(bounds, 42);
    }
    return;
  }
  if (activeEngine === "amap-api2" && amapMap) {
    if (!points.length) {
      amapMap.setZoomAndCenter?.(DEFAULT_ZOOM, wgs84ToGcj02(...DEFAULT_CENTER_WGS84));
    } else if (points.length === 1) {
      amapMap.setZoomAndCenter?.(POINT_ZOOM, wgs84ToGcj02(points[0].longitude, points[0].latitude));
    } else if (amapMarkers.length) {
      amapMap.setFitView?.(amapMarkers, false, [42, 42, 42, 42], 16);
    }
  }
}

function invalidateMapSize(): void {
  leafletMap?.invalidateSize?.({ pan: false });
  amapMap?.resize?.();
  // Google Maps observes container size automatically.
}

/**
 * Apply a persisted WGS84 correction in-place. Moving a single visible marker
 * does not reinitialize the map, fetch tiles or change pan/zoom. If the point
 * joins a cluster, only the marker overlay is rebuilt.
 */
function applyPointCorrection(itemId: string, latitude: number, longitude: number): void {
  if (!itemId || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  const point = latestData.points.find(row => row.itemId === itemId);
  if (!point) return;
  point.latitude = latitude;
  point.longitude = longitude;

  // Keep the cached tabular representation and hover details in sync without
  // refetching the AV. Subsequent unrelated refreshes still read fresh data.
  if (activeMapTable && activeMapMapping) {
    const rowIndex = activeMapTable.rowBlockIds.indexOf(itemId);
    const bound = resolveFieldBinding(activeMapTable,
      activeMapMapping.fieldMapping.coordinate, ["location"]);
    if (rowIndex >= 0 && bound.status === "resolved") {
      const raw = String(longitude) + "," + String(latitude);
      activeMapTable.rows[rowIndex][bound.index] = raw;
      point.description = activeMapTable.headers
        .map((header, index) => String(header) + "：" + String(activeMapTable!.rows[rowIndex][index] || "")).join("\n");
    }
  }

  const handle = singlePointMarkers.get(itemId);
  const remainsSingle = clusterPoints(latestData.points).some(
    group => group.points.length === 1 && group.points[0].itemId === itemId);
  if (!handle || !remainsSingle || handle.engine !== activeEngine) {
    drawMarkers(false); // Recluster overlays only; preserve the underlying map.
    return;
  }
  const coords = displayCoordinate(point);
  if (handle.engine === "leaflet") handle.marker.setLatLng([coords[1], coords[0]]);
  else if (handle.engine === "google") handle.marker.position = { lat: coords[1], lng: coords[0] };
  else if (handle.engine === "amap-api2") handle.marker.setPosition(coords);
}
function render(data: MapPreviewData): void {
  const signature = JSON.stringify({ data, engineSignature, source: activeConfig.mapSource });
  if (signature === lastRenderSignature) return;
  const previousPoints = latestData.points;
  // A native cell update can re-render the table without changing marker
  // geometry. Reuse the existing markers (and their referenced point objects)
  // rather than clearing every marker after a successful correction.
  const sameMarkers = !initialViewportPending &&
    previousPoints.length === data.points.length &&
    previousPoints.every((before, index) => {
      const after = data.points[index];
      return before.itemId === after.itemId &&
        before.latitude === after.latitude && before.longitude === after.longitude &&
        before.title === after.title && before.image === after.image &&
        before.displayText === after.displayText;
    });
  if (sameMarkers) {
    data.points = data.points.map((next, index) => Object.assign(previousPoints[index], next));
  }
  latestData = data;
  renderUnlocatedItems();
  lastRenderSignature = signature;
  if (sameMarkers) return; // Marker overlays and viewport are already current.
  const firstRenderForEngine = initialViewportPending;
  initialViewportPending = false;
  const restored = firstRenderForEngine && restoreMapViewport();
  drawMarkers(false);
  if (firstRenderForEngine && !restored) fitAll();
}

async function reload(): Promise<void> {
  const currentRevision = ++revision;
  try {
    const blockId = resolveBlockId();
    if (!blockId) throw new Error("请在思源文档中打开地图。");
    const [context, globalSettings] = await Promise.all([
      loadMapContext(blockId),
      requestGlobalMapSettings(),
    ]);
    if (currentRevision !== revision) return;
    activeConfig = globalSettings;
    document.documentElement.style.setProperty("--map-marker-bg", globalSettings.markerBackgroundColor);
    document.documentElement.style.setProperty("--map-marker-text-color", globalSettings.markerTextColor);
    activeMapTable = context.table;
    activeMapMapping = context.config;
    await ensureMapEngine(activeConfig);
    if (currentRevision !== revision) return;
    updateSearchUi();
    render(context.table
      ? buildMapPreviewData(context.table, context.config.fieldMapping)
      : { points: [], message: context.message });
  } catch (error) {
    if (currentRevision !== revision) return;
    render({ points: [], message: error instanceof Error ? error.message : "地图加载失败，请在设置中重试。" });
  }
}

function updateSearchUi(): void {
  const visible = ((activeConfig.mapSource === "amap" || activeConfig.mapSource === "google") && activeConfig.searchEnabled)
    || (activeConfig.mapSource === "google" && Boolean(engineNotice));
  searchRoot.hidden = !visible;
  if (!visible) {
    clearSearchResults();
    return;
  }
  const hasKey = activeConfig.mapSource === "google"
    ? Boolean(activeConfig.googleKey && activeEngine === "google") : Boolean(activeConfig.amapKey);
  searchInput.disabled = !hasKey;
  searchButton.disabled = !hasKey;
  searchInput.placeholder = hasKey ? "搜索地点" : activeConfig.mapSource === "google" ? "Google 地图需要 Key / Map ID" : "请先在设置中填写高德 Key";
  searchHint.textContent = hasKey ? engineNotice : (engineNotice || "地点搜索需要地图 API Key");
}

function scheduleSearch(): void {
  window.clearTimeout(searchTimer);
  if (!searchInput.value.trim()) {
    clearSearchResults();
    return;
  }
  searchTimer = window.setTimeout(() => { void searchPlaces(); }, 300);
}

async function searchPlaces(): Promise<void> {
  const query = searchInput.value.trim();
  if (!activeConfig.searchEnabled || !["amap", "google"].includes(activeConfig.mapSource)) return;
  if (activeConfig.mapSource === "google") {
    await searchGooglePlaces(query);
    return;
  }
  if (!activeConfig.amapKey) {
    searchHint.textContent = "请先在设置中填写高德 Key";
    return;
  }
  if (query.length < 2) {
    clearSearchResults();
    return;
  }
  const token = ++searchToken;
  searchRoot.classList.add("is-busy");
  searchHint.textContent = "正在搜索…";
  try {
    const params = new URLSearchParams({
      key: activeConfig.amapKey,
      keywords: query,
      datatype: "all",
      output: "json",
    });
    const data = await requestJsonp<any>(`${AMAP_TIPS_URL}?${params.toString()}`);
    if (token !== searchToken) return;
    if (!data || data.status !== "1") throw new Error(data?.info || "地点搜索失败");
    searchItems = normalizeSearchTips(data.tips);
    activeSearchIndex = searchItems.length ? 0 : -1;
    searchHint.textContent = searchItems.length ? "" : "没有找到地点";
    renderSearchResults();
  } catch (error) {
    if (token !== searchToken) return;
    searchItems = [];
    activeSearchIndex = -1;
    searchHint.textContent = error instanceof Error ? error.message : "地点搜索失败";
    renderSearchResults();
  } finally {
    if (token === searchToken) searchRoot.classList.remove("is-busy");
  }
}

/** 使用 Places API (New) 的 session token 合并自动补全与详情计费。 */
async function searchGooglePlaces(query: string): Promise<void> {
  if (!activeConfig.googleKey || activeEngine !== "google") return;
  if (query.length < 2) { clearSearchResults(); return; }
  const token = ++searchToken;
  searchRoot.classList.add("is-busy");
  searchHint.textContent = "正在搜索…";
  try {
    const places = await window.google.maps.importLibrary("places");
    if (!places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      throw new Error("请在 Google Cloud 启用 Places API (New)");
    }
    if (!googleSearchSession) googleSearchSession = new places.AutocompleteSessionToken();
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query, sessionToken: googleSearchSession,
    });
    if (token !== searchToken || activeEngine !== "google") return;
    googlePlacePredictions = (suggestions || []).map((item: any) => item.placePrediction).filter(Boolean).slice(0, 8);
    searchItems = googlePlacePredictions.map((prediction: any, index: number) => ({
      id: String(prediction.placeId || `google-${index}`),
      name: String(prediction.mainText?.toString?.() || prediction.text?.toString?.() || "地点"),
      district: String(prediction.secondaryText?.toString?.() || ""),
      address: "", longitude: 0, latitude: 0,
    }));
    activeSearchIndex = searchItems.length ? 0 : -1;
    searchHint.textContent = searchItems.length ? "" : "没有找到地点";
    renderSearchResults();
  } catch (error) {
    if (token !== searchToken) return;
    googlePlacePredictions = [];
    searchItems = [];
    activeSearchIndex = -1;
    searchHint.textContent = error instanceof Error ? error.message : "Google 地点搜索失败";
    renderSearchResults();
  } finally {
    if (token === searchToken) searchRoot.classList.remove("is-busy");
  }
}

async function selectGooglePlace(index: number): Promise<void> {
  const prediction = googlePlacePredictions[index];
  if (!prediction || !googleMap || activeEngine !== "google") return;
  searchRoot.classList.add("is-busy");
  try {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
    if (!googleMap || activeEngine !== "google") return;
    const location = place.location;
    if (!location) throw new Error("Google 地点没有可用坐标");
    const latitude = Number(typeof location.lat === "function" ? location.lat() : location.lat);
    const longitude = Number(typeof location.lng === "function" ? location.lng() : location.lng);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new Error("Google 地点坐标无效");
    const label = String(place.displayName || prediction.mainText?.toString?.() || "地点");
    clearSearchResults();
    googleMap.setCenter({ lat: latitude, lng: longitude });
    googleMap.setZoom(SEARCH_ZOOM);
    clearSearchMarker();
    googleSearchMarker = new window.google.maps.marker.AdvancedMarkerElement({
      map: googleMap, position: { lat: latitude, lng: longitude }, title: label,
    });
    searchInput.value = label;
    googleSearchSession = null;
    if (locateTarget) stageLocateExisting(longitude, latitude);
  } catch (error) {
    searchHint.textContent = error instanceof Error ? error.message : "Google 地点详情请求失败";
  } finally {
    searchRoot.classList.remove("is-busy");
  }
}

function requestJsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `__dodoAmapTips${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => cleanup(new Error("地点搜索超时")), 6000);
    window[callbackName] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => cleanup(new Error("地点搜索失败"));
    script.src = `${url}&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);

    function cleanup(error?: Error): void {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
    }
  });
}

function normalizeSearchTips(tips: any): SearchPlace[] {
  return (Array.isArray(tips) ? tips : [])
    .map((tip, index) => {
      const parts = String(tip?.location || "").split(",").map(Number);
      if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
      return {
        id: String(tip?.id || `${index}-${tip?.name || ""}`),
        name: String(tip?.name || ""),
        district: String(tip?.district || ""),
        address: Array.isArray(tip?.address) ? "" : String(tip?.address || ""),
        longitude: parts[0],
        latitude: parts[1],
      } satisfies SearchPlace;
    })
    .filter((item): item is SearchPlace => Boolean(item))
    .slice(0, 8);
}

function renderSearchResults(): void {
  if (!searchItems.length) {
    searchResultsElement.hidden = true;
    searchResultsElement.innerHTML = "";
    return;
  }
  searchResultsElement.innerHTML = searchItems.map((item, index) => {
    const detail = [item.district, item.address].filter(Boolean).join(" ");
    return `<button type="button" class="map-search-item${index === activeSearchIndex ? " is-active" : ""}" data-search-index="${index}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>`;
  }).join("");
  searchResultsElement.hidden = false;
}

function clearSearchResults(): void {
  searchToken += 1;
  searchItems = [];
  googlePlacePredictions = [];
  googleSearchSession = null;
  activeSearchIndex = -1;
  searchResultsElement.hidden = true;
  searchResultsElement.innerHTML = "";
  searchHint.textContent = "";
}

function selectSearchPlace(place: SearchPlace): void {
  if (locateTarget) stageLocateExisting(place.longitude, place.latitude);
  clearSearchResults();
  searchInput.value = place.name;
  clearSearchMarker();
  if (activeEngine === "amap-api2" && amapMap && window.AMap) {
    amapMap.setZoomAndCenter?.(SEARCH_ZOOM, [place.longitude, place.latitude]);
    amapSearchMarker = new window.AMap.Marker({ position: [place.longitude, place.latitude] });
    amapSearchMarker.setMap(amapMap);
  } else if (leafletMap) {
    leafletMap.setView([place.latitude, place.longitude], SEARCH_ZOOM);
    leafletSearchMarker = L.marker([place.latitude, place.longitude], { title: place.name }).addTo(leafletMap);
  }
}

function clearSearchMarker(): void {
  if (leafletSearchMarker && leafletMap) leafletMap.removeLayer?.(leafletSearchMarker);
  leafletSearchMarker = null;
  amapSearchMarker?.setMap?.(null);
  amapSearchMarker = null;
  if (googleSearchMarker) googleSearchMarker.map = null;
  googleSearchMarker = null;
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" && searchItems.length) {
    event.preventDefault();
    activeSearchIndex = Math.min(activeSearchIndex + 1, searchItems.length - 1);
    renderSearchResults();
    return;
  }
  if (event.key === "ArrowUp" && searchItems.length) {
    event.preventDefault();
    activeSearchIndex = Math.max(activeSearchIndex - 1, 0);
    renderSearchResults();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const item = searchItems[activeSearchIndex];
    if (item) {
      if (activeEngine === "google") void selectGooglePlace(activeSearchIndex);
      else selectSearchPlace(item);
    } else void searchPlaces();
    return;
  }
  if (event.key === "Escape") clearSearchResults();
}

function wgs84ToGcj02(longitude: number, latitude: number): [number, number] {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
    return [longitude, latitude];
  }
  const a = 6378245;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(longitude - 105, latitude - 35);
  let dLng = transformLng(longitude - 105, latitude - 35);
  const radLat = latitude / 180 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((a / sqrtMagic * Math.cos(radLat)) * Math.PI);
  return [longitude + dLng, latitude + dLat];
}

function transformLat(x: number, y: number): number {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  result += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  result += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return result;
}

function transformLng(x: number, y: number): number {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  result += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  result += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return result;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Existing-row location picker, separate from creating a new database item. */
function renderUnlocatedItems(): void {
  if (!unlocatedPanelOpen) return;
  const rows = latestData.unlocated || [];
  const term = unlocatedSearch.value.trim().toLocaleLowerCase();
  const filtered = term ? rows.filter(item => item.title.toLocaleLowerCase().includes(term)) : rows;
  unlocatedTitle.textContent = `未定位条目（${rows.length}）`;
  unlocatedList.innerHTML = filtered.length
    ? filtered.map(item => `<button class="map-unlocated-item" type="button"
        data-unlocated-id="${escapeHtml(item.itemId)}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</button>`).join("")
    : `<div class="map-unlocated-empty">${rows.length ? "没有匹配的条目" : "当前视图没有位置为空的条目"}</div>`;
}
function clearLocatePreview(): void {
  if (locatePreviewMarker) {
    if (activeEngine === "leaflet" && leafletMap) leafletMap.removeLayer?.(locatePreviewMarker);
    else if (activeEngine === "google") locatePreviewMarker.map = null;
    else locatePreviewMarker.setMap?.(null);
  }
  locatePreviewMarker = null;
}
function exitLocateExisting(): void {
  if (locateRequestId) return; // Do not abandon a write that might have committed.
  unlocatedPanelOpen = false;
  unlocatedPanel.hidden = true;
  locateTarget = null;
  locateCandidate = null;
  locateConfirm.hidden = true;
  locateSave.disabled = false;
  clearLocatePreview();
  document.body.classList.remove("map-locate-mode");
  if (!addMode && !correctionPoint) mapAddHint.hidden = true;
  mapAddHint.classList.remove("is-busy", "is-error");
}
function beginLocateExisting(): void {
  if (locateRequestId || mapAddingPoint) return;
  if (correctionPoint) exitPointCorrection();
  if (addMode) updateMapAddMode(false);
  exitLocateExisting();
  unlocatedPanelOpen = true;
  unlocatedSearch.value = "";
  unlocatedPanel.hidden = false;
  renderUnlocatedItems();
  unlocatedSearch.focus();
}
function chooseUnlocatedItem(itemId: string): void {
  const item = latestData.unlocated?.find(entry => entry.itemId === itemId);
  if (!item || locateRequestId) return;
  unlocatedPanelOpen = false;
  unlocatedPanel.hidden = true;
  locateTarget = item;
  locateCandidate = null;
  locateConfirm.hidden = true;
  clearLocatePreview();
  document.body.classList.add("map-locate-mode");
  mapAddHint.hidden = false;
  mapAddHint.classList.remove("is-busy", "is-error");
  mapAddHint.textContent = `为「${item.title}」选点：点击地图（Esc 取消）`;
}
function stageLocateExisting(mapLongitude: number, mapLatitude: number): void {
  if (!locateTarget || locateRequestId || !Number.isFinite(mapLongitude) ||
      !Number.isFinite(mapLatitude)) return;
  const [lng, lat] = activeConfig.mapSource === "amap"
    ? gcj02ToWgs84(mapLongitude, mapLatitude) : [mapLongitude, mapLatitude];
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return;
  locateCandidate = { longitude: Number(lng.toFixed(7)), latitude: Number(lat.toFixed(7)) };
  clearLocatePreview();
  if (activeEngine === "leaflet" && leafletMap) {
    locatePreviewMarker = L.circleMarker([mapLatitude, mapLongitude], {
      radius: 8, color: "#fff", weight: 2, fillColor: "#4b62dc", fillOpacity: .94,
      interactive: false,
    }).addTo(leafletMap);
  } else if (activeEngine === "amap-api2" && amapMap && window.AMap) {
    locatePreviewMarker = new window.AMap.Marker({position: [mapLongitude, mapLatitude]});
    locatePreviewMarker.setMap(amapMap);
  } else if (activeEngine === "google" && googleMap && window.google?.maps?.marker?.AdvancedMarkerElement) {
    locatePreviewMarker = new window.google.maps.marker.AdvancedMarkerElement({
      map: googleMap, position: {lat: mapLatitude, lng: mapLongitude},
    });
  }
  locateTitle.textContent = `为「${locateTarget.title}」确认位置`;
  locateCoords.textContent = `经度 ${locateCandidate.longitude} · 纬度 ${locateCandidate.latitude}`;
  locateConfirm.hidden = false;
  mapAddHint.hidden = false;
  mapAddHint.textContent = "确认位置，或继续点击地图重新选点（Esc 取消）";
}
function submitLocateExisting(): void {
  if (!locateTarget || !locateCandidate || locateRequestId) return;
  locateRequestId = `map-locate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mapAddingPoint = true;
  locateSave.disabled = true;
  mapAddHint.hidden = false;
  mapAddHint.classList.add("is-busy");
  mapAddHint.classList.remove("is-error");
  mapAddHint.textContent = `正在为「${locateTarget.title}」保存位置…`;
  window.parent.postMessage({
    type: "dodoMapLocateExisting", requestId: locateRequestId,
    point: {itemId: locateTarget.itemId, avID: locateTarget.avID,
      databaseBlockID: locateTarget.databaseBlockID},
    longitude: locateCandidate.longitude, latitude: locateCandidate.latitude,
  }, window.location.origin);
}
unlocatedSearch.addEventListener("input", renderUnlocatedItems);
unlocatedList.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-unlocated-id]");
  if (button?.dataset.unlocatedId) chooseUnlocatedItem(button.dataset.unlocatedId);
});
document.getElementById("map-unlocated-close")?.addEventListener("click", exitLocateExisting);
document.getElementById("map-locate-cancel")?.addEventListener("click", exitLocateExisting);
document.getElementById("map-locate-reselect")?.addEventListener("click", () => {
  if (locateRequestId) return;
  locateConfirm.hidden = true;
  locateCandidate = null;
  clearLocatePreview();
});
locateSave.addEventListener("click", submitLocateExisting);

function updateMapAddMode(enabled: boolean): void {
  addMode = enabled;
  addModeSequence++;
  document.body.classList.toggle("map-add-mode", enabled);
  if (enabled) {
    if (locateTarget || unlocatedPanelOpen) exitLocateExisting();
    hidePointPreview();
  }
  mapAddHint.hidden = !enabled;
  mapAddHint.classList.remove("is-busy", "is-error");
  mapAddHint.textContent = "标记模式";
  window.parent.postMessage({ type: "dodoMapAddModeState", enabled }, window.location.origin);
}

/** 高德瓦片/API2 返回 GCJ-02，而思源原生 location 必须保存 WGS84。 */
function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  let resultLng = lng;
  let resultLat = lat;
  for (let i = 0; i < 6; i++) {
    const [calculatedLng, calculatedLat] = wgs84ToGcj02(resultLng, resultLat);
    resultLng += lng - calculatedLng;
    resultLat += lat - calculatedLat;
  }
  return [resultLng, resultLat];
}

async function reverseGeocode(wgsLng: number, wgsLat: number): Promise<string> {
  if (activeEngine === "google") {
    const maps = window.google?.maps;
    if (!maps?.Geocoder) await maps?.importLibrary?.("geocoding");
    const geocoder = new maps.Geocoder();
    const result = await geocoder.geocode({ location: { lng: wgsLng, lat: wgsLat } });
    return String(result?.results?.[0]?.formatted_address || "").trim();
  }
  if (!activeConfig.amapKey) throw new Error("请先在地图设置中配置高德 Key，才能识别地点名称。");
  // 高德逆地理编码使用 GCJ-02，经纬度按 lng,lat 顺序传参。
  const [gcjLng, gcjLat] = wgs84ToGcj02(wgsLng, wgsLat);
  const params = new URLSearchParams({
    key: activeConfig.amapKey,
    location: `${gcjLng.toFixed(6)},${gcjLat.toFixed(6)}`,
    extensions: "all",
    radius: "1000",
    output: "json",
  });
  const response = await requestJsonp<any>(`${AMAP_REVERSE_GEOCODE_URL}?${params}`);
  if (response?.status !== "1") {
    if (String(response?.infocode) === "20011") throw new Error("高德没有海外逆地理编码权限（20011）");
    throw new Error(response?.info || "高德逆地理编码失败。");
  }
  const address = response?.regeocode?.formatted_address;
  const nearPoi = (Array.isArray(response?.regeocode?.pois) ? response.regeocode.pois : [])
    .find((poi: any) => typeof poi?.name === "string" && poi.name.trim() &&
      Number.isFinite(Number(poi.distance)) && Number(poi.distance) <= 100);
  const name = typeof nearPoi?.name === "string" ? nearPoi.name.trim()
    : typeof address === "string" ? address.trim() : "";
  // 允许空名称：地图点的建立不依赖地理编码结果。
  return name;
}

let pendingPointNameFallback: PointNameFallback | null = null;

async function onMapLocationClick(mapLng: number, mapLat: number): Promise<void> {
  if ((!addMode && !correctionPoint && !locateTarget) || mapAddingPoint) return;
  if (!Number.isFinite(mapLng) || !Number.isFinite(mapLat) || Math.abs(mapLng) > 180 || Math.abs(mapLat) > 90) return;
  if (locateTarget) {
    stageLocateExisting(mapLng, mapLat);
    return; // Only save after explicit confirmation; do not create a new item.
  }
  const sequence = addModeSequence;
  mapAddingPoint = true;
  mapAddHint.hidden = false;
  mapAddHint.classList.add("is-busy");
  mapAddHint.classList.remove("is-error");
  if (correctionPoint) {
    // 矫正只修改位置经纬度，保留名称和原始关联，不要求高德 Key。
    const point = correctionPoint;
    const [rawLng, rawLat] = activeConfig.mapSource === "amap"
      ? gcj02ToWgs84(mapLng, mapLat) : [mapLng, mapLat];
    pendingMutationAction = "correct";
    pendingMutationId = `map-correct-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mapAddHint.textContent = "正在矫正位置…";
    window.parent.postMessage({
      type: "dodoMapMutatePoint", action: "correct", requestId: pendingMutationId,
      point: { itemId: point.itemId, avID: point.avID, databaseBlockID: point.databaseBlockID },
      longitude: Number(rawLng.toFixed(7)), latitude: Number(rawLat.toFixed(7)),
    }, window.location.origin);
    return;
  }
  mapAddHint.textContent = "标记模式";
  try {
    const [rawLng, rawLat] = activeConfig.mapSource === "amap"
      ? gcj02ToWgs84(mapLng, mapLat) : [mapLng, mapLat];
    const longitude = Number(rawLng.toFixed(7));
    const latitude = Number(rawLat.toFixed(7));
    const selected = await chooseMapPointName(
      longitude, latitude, activeEngine === "google"
        ? () => reverseGeocode(longitude, latitude)
        : activeConfig.mapSource === "amap" && activeConfig.amapKey
          ? () => reverseGeocode(longitude, latitude) : undefined,
    );
    if (!addMode || sequence !== addModeSequence) return; // 逆编码期间已取消，绝不创建条目
    mapAddHint.textContent = selected.fallback
      ? "未取得地点名称，正在使用经纬度创建标记…" : "正在创建标记…";
    if (activeEngine === "google" && !selected.fallback) {
      // Google 查询地址只能供当前 Google 地图展示；数据库跨多个底图共享。
      // 用户主动填写的自定义名称才作为持久化标签使用。
      const custom = window.prompt("Google 查询到地址（仅供参考）：" + selected.name + "\n请输入要保存的自定义地点名称，留空则保存坐标。", "");
      if (custom === null || !addMode || sequence !== addModeSequence) return;
      selected.name = custom.trim() || `坐标 ${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    }
    const requestId = `map-point-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingPointNameFallback = selected.fallback;
    pendingPointRequestId = requestId;
    window.parent.postMessage({ type: "dodoMapCreatePoint", requestId, name: selected.name, longitude, latitude }, window.location.origin);
  } catch (error) {
    if (addMode && sequence === addModeSequence) {
      mapAddHint.classList.remove("is-busy");
      mapAddHint.classList.add("is-error");
      mapAddHint.textContent = error instanceof Error ? error.message : "获取地点名称失败。";
    }
  } finally {
    if (!pendingPointRequestId && !pendingMutationId) mapAddingPoint = false;
  }
}

function setMapAddMode(enabled: boolean): void {
  if (enabled && correctionPoint) exitPointCorrection();
  if (!enabled) {
    updateMapAddMode(false);
    if (!pendingPointRequestId && !pendingMutationId) mapAddingPoint = false;
    return;
  }
  if (!activeEngine || !activeMapTable || !activeMapMapping ||
      resolveFieldBinding(activeMapTable, activeMapMapping.fieldMapping.coordinate, ["location"]).status !== "resolved") {
    updateMapAddMode(false);
    mapAddHint.hidden = false;
    mapAddHint.classList.add("is-error");
    mapAddHint.textContent = "请先设置有效的来源数据库和位置字段。";
    window.setTimeout(() => { if (!addMode) mapAddHint.hidden = true; }, 4000);
    return;
  }
  // 高德 Key 只用于可选的地点名称识别；未配置也可以直接按坐标新增标记。
  updateMapAddMode(true);
}

window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  if (event.data?.type === "dodoMapBeginLocateExisting") {
    beginLocateExisting();
  } else if (event.data?.type === "dodoMapSetAddMode") {
    setMapAddMode(event.data.enabled === true);
  } else if (event.data?.type === "dodoMapLocateExistingResult" &&
             locateRequestId && event.data.requestId === locateRequestId) {
    locateRequestId = "";
    mapAddingPoint = false;
    locateSave.disabled = false;
    mapAddHint.classList.remove("is-busy");
    if (event.data.success) {
      exitLocateExisting();
      void reload();
    } else {
      mapAddHint.classList.add("is-error");
      mapAddHint.textContent = String(event.data.error || "添加位置失败，请重试。");
    }
  } else if (event.data?.type === "dodoMapMutatePointResult" &&
             pendingMutationId && event.data.requestId === pendingMutationId &&
             event.data.action === pendingMutationAction) {
    const action = pendingMutationAction;
    pendingMutationId = "";
    pendingMutationAction = null;
    mapAddingPoint = false;
    if (event.data.success) {
      if (action === "correct") {
        exitPointCorrection();
        applyPointCorrection(String(event.data.itemId || ""),
          Number(event.data.latitude), Number(event.data.longitude));
      } else {
        void reload(); // Deletion still needs to remove the record from the map.
      }
      mapAddHint.hidden = true;
      mapAddHint.classList.remove("is-busy", "is-error");
    } else {
      mapAddHint.hidden = false;
      mapAddHint.classList.remove("is-busy");
      mapAddHint.classList.add("is-error");
      mapAddHint.textContent = String(event.data.error || "操作地点失败，请重试。");
      if (action === "delete") {
        window.setTimeout(() => { if (!addMode && !correctionPoint) mapAddHint.hidden = true; }, 6500);
      }
    }
  } else if (event.data?.type === "dodoMapPointCorrected") {
    // Another open copy of the same map was corrected; update its overlay too.
    applyPointCorrection(String(event.data.itemId || ""),
      Number(event.data.latitude), Number(event.data.longitude));  } else if (event.data?.type === "dodoMapCreatePointResult" && event.data.requestId === pendingPointRequestId) {
    pendingPointRequestId = "";
    mapAddingPoint = false;
    if (event.data.success) {
      const fallback = pendingPointNameFallback;
      updateMapAddMode(false);
      if (fallback) {
        const note = fallback === "overseas"
          ? "高德未授权境外地点名称查询，已按坐标创建标记。可在源数据库修改名称。"
          : fallback === "no-key"
            ? "未配置高德 Key，已按坐标创建标记。可在源数据库修改名称。"
            : "未取得地点名称，已按坐标创建标记。可在源数据库修改名称。";
        mapAddHint.hidden = false;
        mapAddHint.textContent = note;
        window.setTimeout(() => { if (!addMode && !correctionPoint) mapAddHint.hidden = true; }, 6500);
      }
      pendingPointNameFallback = null;
      void reload();
    } else {
      pendingPointNameFallback = null;
      if (addMode) {
        mapAddHint.classList.remove("is-busy");
        mapAddHint.classList.add("is-error");
        mapAddHint.textContent = String(event.data.error || "创建地点失败，请重试。");
      }
    }
  }
});
searchInput.addEventListener("input", scheduleSearch);
searchInput.addEventListener("keydown", handleSearchKeydown);
searchButton.addEventListener("click", () => { void searchPlaces(); });
searchResultsElement.addEventListener("mousedown", (event) => event.preventDefault());
searchResultsElement.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-search-index]");
  if (!button) return;
  const item = searchItems[Number(button.dataset.searchIndex)];
  if (item) {
    if (activeEngine === "google") void selectGooglePlace(Number(button.dataset.searchIndex));
    else selectSearchPlace(item);
  }
});
window.addEventListener("message", (event) => {
  if (event.origin === window.location.origin && event.source === window.parent && event.data?.type === "dodoMapRefresh") {
    void reload();
  }
});

const resizeObserver = new ResizeObserver(invalidateMapSize);
resizeObserver.observe(document.body);

void reload();

window.addEventListener("pagehide", () => {
  revision += 1;
  searchToken += 1;
  window.clearTimeout(searchTimer);
  resizeObserver.disconnect();
  destroyMapEngine();
}, { once: true });
