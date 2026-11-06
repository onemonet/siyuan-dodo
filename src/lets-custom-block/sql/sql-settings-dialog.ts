import { Dialog } from "siyuan";
import { isMobile } from "../../utils";
import { bindDialogOutsideClick } from "../utils/dialog-utils";
import SqlSettingsPanel from "./SqlSettingsPanel.svelte";

const PANEL_WIDTH = 360;
const PANEL_GAP = 8;

interface ActiveSqlSettings {
  dialog: Dialog;
  blockId: string;
}

let active: ActiveSqlSettings | null = null;

export function closeSqlSettings(): void {
  active?.dialog.destroy();
  active = null;
}

export function openSqlSettings(
  sqlBlockId: string,
  anchor?: HTMLElement,
): Dialog {
  if (active) {
    const existing = active;
    active = null;
    existing.dialog.destroy();
    if (existing.blockId === sqlBlockId) {
      return existing.dialog;
    }
  }

  let panel: SqlSettingsPanel | undefined;
  let removeOutsideClick: (() => void) | null = null;
  const dialog = new Dialog({
    title: "SQL块设置",
    content: `<div id="dodo-sql-settings" style="height:100%;"></div>`,
    width: isMobile ? "92vw" : `${PANEL_WIDTH}px`,
    height: isMobile ? "min(600px, 78vh)" : undefined,
    transparent: true,
    destroyCallback: () => {
      removeOutsideClick?.();
      removeOutsideClick = null;
      panel?.$destroy();
      if (active?.dialog === dialog) {
        active = null;
      }
    },
  });
  removeOutsideClick = bindDialogOutsideClick(dialog);

  if (!isMobile) {
    const wrapper = dialog.element.querySelector<HTMLElement>(".b3-dialog");
    const container = dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
    const scrim = dialog.element.querySelector<HTMLElement>(".b3-dialog__scrim");
    if (wrapper) {
      wrapper.style.pointerEvents = "none";
    }
    if (scrim) {
      scrim.style.display = "none";
    }
    if (container) {
      const panelHeight = Math.round(Math.min(600, window.innerHeight * 0.78));
      const anchorRect = anchor?.getBoundingClientRect();
      let left = anchorRect
        ? anchorRect.right + PANEL_GAP
        : window.innerWidth - PANEL_WIDTH - PANEL_GAP;
      let top = anchorRect?.top ?? PANEL_GAP;
      if (left + PANEL_WIDTH > window.innerWidth - PANEL_GAP) {
        left = window.innerWidth - PANEL_WIDTH - PANEL_GAP;
      }
      if (top + panelHeight > window.innerHeight - PANEL_GAP) {
        top = window.innerHeight - panelHeight - PANEL_GAP;
      }
      container.style.pointerEvents = "auto";
      container.style.position = "fixed";
      container.style.width = `${PANEL_WIDTH}px`;
      container.style.height = `${panelHeight}px`;
      container.style.left = `${Math.max(PANEL_GAP, left)}px`;
      container.style.top = `${Math.max(PANEL_GAP, top)}px`;
    }
    dialog.element.querySelector(".b3-dialog__close")?.classList.remove("fn__none");
  }

  panel = new SqlSettingsPanel({
    target: dialog.element.querySelector("#dodo-sql-settings") as HTMLElement,
    props: { sqlBlockId },
  });
  active = { dialog, blockId: sqlBlockId };
  return dialog;
}
