import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { SelectionContext } from "../toolbar/types";

const NONCE_LIMIT = 2147483647;
const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const newId = () => Array.from({ length: 21 }, () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]).join("");
export const randomNonce = () => Math.floor(Math.random() * NONCE_LIMIT);
export function selectElements(elements: readonly any[], selected: readonly any[]) {
  const ids = new Set(selected.map(element => typeof element === "string" ? element : element.id));
  const selectedElementIds: Record<string, boolean> = {}, selectedGroupIds: Record<string, boolean> = {};
  for (const element of elements) {
    if (element.isDeleted || !ids.has(element.id)) continue;
    selectedElementIds[element.id] = true;
    for (const groupId of element.groupIds || []) selectedGroupIds[groupId] = true;
  }
  return { selectedElementIds, selectedGroupIds, selectedLinearElement: null };
}
export function commitElements(context: SelectionContext, elements: any[], selected: any[]) {
  context.api.updateScene({ elements, appState: { ...context.appState, ...selectElements(elements, selected) }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
