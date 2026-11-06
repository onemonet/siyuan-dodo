import type { App, Dialog as SiyuanDialog, Protyle as SiyuanProtyle } from "siyuan";
import { Dialog, Protyle } from "siyuan";

const QUICK_NOTE_UI = {
  title: "速记",
  protyleId: "quickNoteProtyle",
  autoDeleteId: "quickNoteAutoDelete",
  cancelButtonId: "quickNoteCancel",
  confirmButtonId: "quickNoteConfirm",
  width: "720px",
  height: "620px",
  contentMinHeight: "540px",
  focusDelayMs: 100,
  escapeKey: "Escape",
  enterKey: "Enter",
} as const;

export interface QuickNoteControls {
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  autoDeleteCheckbox: HTMLInputElement;
}

export interface QuickNoteDialogSession {
  focus(): void;
  destroy(): void;
}

interface QuickNoteDialogCallbacks {
  onConfirm: (controls: QuickNoteControls) => Promise<void>;
  onCancel: (controls: QuickNoteControls) => void;
  onAutoDeleteChange: (shouldDeleteOnClose: boolean) => void;
  onDestroy: () => void;
}

export function disableQuickNoteControls(controls: QuickNoteControls): void {
  controls.confirmButton.disabled = true;
  controls.cancelButton.disabled = true;
}

export function enableQuickNoteControls(controls: QuickNoteControls): void {
  controls.confirmButton.disabled = false;
  controls.cancelButton.disabled = false;
}

export class QuickNoteDialogPresenter {
  constructor(private readonly app: App) {}

  create(
    tempDocumentId: string,
    callbacks: QuickNoteDialogCallbacks,
  ): QuickNoteDialogSession {
    let activeProtyle: SiyuanProtyle | null = null;
    const cleanupTasks: Array<() => void> = [];
    const dialog = new Dialog({
      title: QUICK_NOTE_UI.title,
      content: this.createDialogContent(),
      width: QUICK_NOTE_UI.width,
      height: QUICK_NOTE_UI.height,
      destroyCallback: () => {
        cleanupTasks.forEach((cleanupTask) => cleanupTask());
        activeProtyle?.destroy();
        activeProtyle = null;
        callbacks.onDestroy();
      },
    });

    try {
      activeProtyle = this.createProtyle(dialog, tempDocumentId);
      const controls = this.getDialogControls(dialog);
      cleanupTasks.push(this.bindControls(dialog, controls, callbacks));
      window.setTimeout(() => activeProtyle?.focus(), QUICK_NOTE_UI.focusDelayMs);

      return {
        focus: () => activeProtyle?.focus(),
        destroy: () => dialog.destroy(),
      };
    } catch (error) {
      dialog.destroy();
      throw error;
    }
  }

  private createDialogContent(): string {
    return `
      <div class="b3-dialog__content" style="display: flex; flex-direction: column; height: 100%; min-height: ${QUICK_NOTE_UI.contentMinHeight}; padding: 0;">
        <div id="${QUICK_NOTE_UI.protyleId}" style="flex: 1; min-height: 0; overflow: hidden;"></div>
        <div class="fn__flex" style="padding: 12px 20px; border-top: 1px solid var(--b3-theme-border); background: var(--b3-theme-surface); border-bottom-left-radius: var(--b3-border-radius); border-bottom-right-radius: var(--b3-border-radius);">
          <div class="fn__flex-1">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="${QUICK_NOTE_UI.autoDeleteId}" class="b3-switch" checked />
              <span class="fn__color-secondary" style="font-size: 12px;">关闭时自动删除</span>
            </label>
          </div>
          <button id="${QUICK_NOTE_UI.cancelButtonId}" class="b3-button b3-button--outline fn__flex-center" style="margin-right: 12px;">取消</button>
          <button id="${QUICK_NOTE_UI.confirmButtonId}" class="b3-button b3-button--primary fn__flex-center">确认</button>
        </div>
      </div>
    `;
  }

  private createProtyle(
    dialog: SiyuanDialog,
    tempDocumentId: string,
  ): SiyuanProtyle {
    const protyleElement = this.getRequiredElement<HTMLElement>(
      dialog,
      QUICK_NOTE_UI.protyleId,
    );

    return new Protyle(this.app, protyleElement, {
      blockId: tempDocumentId,
      action: ["cb-get-focus"],
      render: {
        title: false,
        gutter: true,
        scroll: true,
        breadcrumb: false,
      },
    });
  }

  private bindControls(
    dialog: SiyuanDialog,
    controls: QuickNoteControls,
    callbacks: QuickNoteDialogCallbacks,
  ): () => void {
    const handleAutoDeleteChange = (): void => {
      callbacks.onAutoDeleteChange(controls.autoDeleteCheckbox.checked);
    };
    const handleConfirmClick = (): void => {
      void callbacks.onConfirm(controls);
    };
    const handleCancelClick = (): void => {
      callbacks.onCancel(controls);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      this.handleKeyDown(event, dialog, controls);
    };

    controls.autoDeleteCheckbox.addEventListener("change", handleAutoDeleteChange);
    controls.confirmButton.addEventListener("click", handleConfirmClick);
    controls.cancelButton.addEventListener("click", handleCancelClick);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      controls.autoDeleteCheckbox.removeEventListener("change", handleAutoDeleteChange);
      controls.confirmButton.removeEventListener("click", handleConfirmClick);
      controls.cancelButton.removeEventListener("click", handleCancelClick);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }

  private handleKeyDown(
    event: KeyboardEvent,
    dialog: SiyuanDialog,
    controls: QuickNoteControls,
  ): void {
    if (!dialog.element.contains(event.target as Node)) {
      return;
    }

    if (event.key === QUICK_NOTE_UI.escapeKey) {
      this.preventShortcutEvent(event);
      controls.cancelButton.click();
      return;
    }

    if (event.key === QUICK_NOTE_UI.enterKey && (event.ctrlKey || event.metaKey)) {
      this.preventShortcutEvent(event);
      controls.confirmButton.click();
    }
  }

  private getDialogControls(dialog: SiyuanDialog): QuickNoteControls {
    return {
      confirmButton: this.getRequiredElement<HTMLButtonElement>(
        dialog,
        QUICK_NOTE_UI.confirmButtonId,
      ),
      cancelButton: this.getRequiredElement<HTMLButtonElement>(
        dialog,
        QUICK_NOTE_UI.cancelButtonId,
      ),
      autoDeleteCheckbox: this.getRequiredElement<HTMLInputElement>(
        dialog,
        QUICK_NOTE_UI.autoDeleteId,
      ),
    };
  }

  private getRequiredElement<T extends HTMLElement>(
    dialog: SiyuanDialog,
    elementId: string,
  ): T {
    const element = dialog.element.querySelector<T>(`#${elementId}`);

    if (!element) {
      throw new Error(
        `QuickNoteDialogPresenter.getRequiredElement: 弹窗元素不存在; elementId=${elementId}`,
      );
    }

    return element;
  }

  private preventShortcutEvent(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }
}
