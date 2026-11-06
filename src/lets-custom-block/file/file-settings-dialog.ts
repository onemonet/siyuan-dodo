import { Dialog } from "siyuan";
import { isMobile } from "../../utils";
import { bindDialogOutsideClick } from "../utils/dialog-utils";
import FileSettingsPanel from "./FileSettingsPanel.svelte";

const PANEL_WIDTH = 340;
const PANEL_GAP = 8;

interface ActiveFileSettings {
  dialog: Dialog;
  blockId: string;
}

let active: ActiveFileSettings | null = null;

export function closeFileSettings(): void {
  active?.dialog.destroy();
  active = null;
}

export function openFileSettings(
  fileBlockId: string,
  anchor?: HTMLElement,
): Dialog {
  if (active) {
    const existing = active;
    active = null;
    existing.dialog.destroy();
    if (existing.blockId === fileBlockId) {
      return existing.dialog;
    }
  }

  let panel: FileSettingsPanel | undefined;
  let removeOutsideClick: (() => void) | null = null;
  const dialog = new Dialog({
    title: "文件块设置",
    content: `<div id="dodo-file-settings" style="height:100%;"></div>`,
    width: isMobile ? "92vw" : `${PANEL_WIDTH}px`,
    height: isMobile ? "min(420px, 70vh)" : undefined,
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
    const container = dialog.element.querySelector<HTMLElement>(
      ".b3-dialog__container",
    );
    const scrim = dialog.element.querySelector<HTMLElement>(".b3-dialog__scrim");

    if (wrapper) {
      wrapper.style.pointerEvents = "none";
    }
    if (scrim) {
      scrim.style.display = "none";
    }
    if (container) {
      const anchorRect = anchor?.getBoundingClientRect();
      let left = anchorRect
        ? anchorRect.right + PANEL_GAP
        : window.innerWidth - PANEL_WIDTH - PANEL_GAP;
      let top = anchorRect?.top ?? PANEL_GAP;
      const panelHeight = Math.round(Math.min(420, window.innerHeight * 0.78));

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

    dialog.element
      .querySelector(".b3-dialog__close")
      ?.classList.remove("fn__none");
  }

  panel = new FileSettingsPanel({
    target: dialog.element.querySelector("#dodo-file-settings") as HTMLElement,
    props: { fileBlockId },
  });
  active = { dialog, blockId: fileBlockId };
  return dialog;
}
