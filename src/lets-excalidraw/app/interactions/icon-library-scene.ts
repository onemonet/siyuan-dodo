import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { nanoid } from "nanoid";
import { svgDataUrl } from "./tabler-icon-data";
import { librarySvg, type IconCatalog, type LibraryId } from "./icon-library-data";
import type { AvatarStyleId } from "./icon-avatar-generator";

export type IconMeta = { library: LibraryId; name: string; color: string; strokeWidth: number;
  avatarStyle?: AvatarStyleId };
const iconMeta = (element: any): IconMeta | null => {
  const value = element?.type === "image" ? element.customData?.dodoIcon : null;
  return ["tabler", "lucide", "iconpark", "phosphor", "carbon", "dicebear"].includes(value?.library) && typeof value.name === "string" ? value : null;
};
export const selectedLibraryImage = (api: any) => {
  const state = api.getAppState(), ids = Object.keys(state.selectedElementIds || {}).filter(id => state.selectedElementIds[id]);
  if (ids.length !== 1) return null;
  const element = api.getSceneElements().find((item: any) => item.id === ids[0] && !item.isDeleted);
  return element && iconMeta(element) ? element : null;
};
export function addLibraryFile(api: any, catalog: IconCatalog, meta: IconMeta): string {
  const id = nanoid();
  const dataURL = svgDataUrl(librarySvg(meta.library, catalog, meta.name, meta.color, meta.strokeWidth));
  api.addFiles([{ id, dataURL, mimeType: "image/svg+xml", created: Date.now(), lastRetrieved: Date.now() }]);
  return id;
}
export function insertLibraryImage(api: any, catalog: IconCatalog, meta: IconMeta, clientX: number, clientY: number): string {
  const state = api.getAppState();
  const point = viewportCoordsToSceneCoords({ clientX, clientY }, state);
  const fileId = addLibraryFile(api, catalog, meta), id = nanoid();
  const element = {
    id, type: "image", x: point.x - 48, y: point.y - 48, width: 96, height: 96,
    angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed: Math.floor(Math.random() * 2147483647),
    version: 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now(),
    isDeleted: false, boundElements: null, link: null, locked: false,
    fileId, status: "saved", scale: [1, 1], crop: null,
    customData: { dodoIcon: meta },
  };
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), element],
    appState: { selectedElementIds: { [id]: true }, activeTool: { type: "selection" } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return id;
}
export function updateLibraryImage(api: any, catalog: IconCatalog, element: any, color: string, strokeWidth: number,
  name?: string, avatarStyle?: AvatarStyleId): void {
  const prior = iconMeta(element);
  if (!prior) return;
  const meta: IconMeta = { ...prior, color, strokeWidth, name: name || prior.name,
    ...(prior.library === "dicebear" && avatarStyle ? {avatarStyle} : {}) };
  const fileId = addLibraryFile(api, catalog, meta);
  const elements = api.getSceneElementsIncludingDeleted().map((item: any) => item.id === element.id
    ? { ...item, fileId, customData: { ...item.customData, dodoIcon: meta },
      version: item.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }
    : item);
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
