import type { Dialog } from "siyuan";

export function bindDialogOutsideClick(dialog: Dialog): () => void {
  const handleClick = (event: MouseEvent) => {
    const path =
      typeof event.composedPath === "function"
        ? event.composedPath()
        : ((event as MouseEvent & { path?: EventTarget[] }).path ?? []);
    if (path.includes(dialog.element)) {
      return;
    }
    dialog.destroy();
  };

  document.addEventListener("click", handleClick, true);
  return () => document.removeEventListener("click", handleClick, true);
}
