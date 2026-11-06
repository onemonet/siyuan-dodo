import { Protyle, type App } from "siyuan";
import * as Siyuan from "siyuan";

const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/i;
const ELEMENT_ID = /^[a-zA-Z0-9_-]{6,80}$/;
const renderMethodNames = [
  "highlightRender", "mathRender", "mermaidRender", "flowchartRender",
  "graphvizRender", "chartRender", "abcRender", "mindmapRender",
  "plantumlRender", "htmlRender",
] as const;

type NativeMessage = {
  event: "dodoSiyuanNativeRender" | "dodoSiyuanNativeEdit";
  blockId: string;
  elementId: string;
};

type VerifiedEmbed = {
  canvas: HTMLIFrameElement;
  embed: HTMLIFrameElement;
  source: Window;
};

/**
 * A bridge to the real SiYuan plugin runtime. The Excalidraw drawing and
 * its embeddables are nested iframes; SiYuan's Protyle uses the host's App,
 * document, menus, event bus, CSS and save transactions.
 *
 * Only accept messages from an iframe that belongs to an open Excalidraw
 * canvas AND whose scene element has exactly the requested block link.
 */
export class NativeEmbedBridge {
  private overlay: HTMLDivElement | null = null;
  private activeProtyle: Protyle | null = null;
  private positionTimer: number | null = null;
  private editSource: Window | null = null;
  private editCanvas: HTMLIFrameElement | null = null;
  private editElementId: string | null = null;
  private outsideCleanup: (() => void) | null = null;

  constructor(
    private readonly getApp: () => App,
    private readonly canvases: () => HTMLIFrameElement[],
  ) {}

  start() {
    window.addEventListener("message", this.handleMessage);
  }

  stop() {
    window.removeEventListener("message", this.handleMessage);
    this.closeEditor();
  }

  /** Close when a canvas tab/dialog is destroyed. */
  closeForCanvas(canvas: HTMLIFrameElement) {
    if (this.overlay?.dataset.canvasSrc === canvas.src) this.closeEditor();
  }

  private identify(event: MessageEvent, msg: NativeMessage): VerifiedEmbed | null {
    if (event.origin !== location.origin || !BLOCK_ID.test(msg.blockId) ||
        !ELEMENT_ID.test(msg.elementId) || !event.source) return null;
    for (const canvas of this.canvases()) {
      if (!canvas.isConnected || !canvas.contentWindow) continue;
      try {
        const canvasWindow = canvas.contentWindow as Window & {
          excalidrawAPI?: { getSceneElements(): Array<{ id: string; link?: string }> };
        };
        const element = canvasWindow.excalidrawAPI?.getSceneElements()
          .find(item => item.id === msg.elementId);
        if (element?.link !== `siyuan://blocks/${msg.blockId}`) continue;
        const embeds = canvasWindow.document.querySelectorAll<HTMLIFrameElement>(
          'iframe[src*="/excalidraw/embed/siyuan/"]',
        );
        for (const embed of embeds) {
          if (embed.contentWindow !== event.source) continue;
          const url = new URL(embed.src, location.href);
          if (url.origin !== location.origin ||
              url.searchParams.get("blockId") !== msg.blockId ||
              url.searchParams.get("elementId") !== msg.elementId) continue;
          return { canvas, embed, source: event.source as Window };
        }
      } catch {
        // Closing/reloading an iframe, or a sandboxed cross-origin document.
      }
    }
    return null;
  }

  private readonly handleMessage = (event: MessageEvent) => {
    if (!event.data) return;
    let msg: NativeMessage;
    try { msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
    catch { return; }
    if (msg?.event === "dodoSiyuanNativeToolbarAction") {
      if (event.origin !== location.origin || !event.source || !this.overlay ||
          !this.editCanvas || !this.editElementId) return;
      const command = msg as unknown as { elementId?: string; action?: string };
      if (event.source !== this.editCanvas.contentWindow ||
          command.elementId !== this.editElementId) return;
      if (command.action !== "done" && command.action !== "refresh" &&
          command.action !== "link") return;
      const canvas = this.editCanvas;
      const id = this.editElementId;
      this.closeEditor();
      if (command.action === "link") canvas.contentWindow?.postMessage(
        JSON.stringify({ event: "dodoSiyuanEditLink", elementId: id }), location.origin);
      return;
    }
    if (!msg || (msg.event !== "dodoSiyuanNativeRender" &&
                  msg.event !== "dodoSiyuanNativeEdit")) return;
    const target = this.identify(event, msg);
    if (!target) return;
    if (msg.event === "dodoSiyuanNativeRender") {
      void this.renderPreview(target).catch(error =>
        console.warn("[Excalidraw] Native SiYuan preview render failed:", error));
    } else {
      this.openEditor(target, msg.blockId);
    }
  };

  private syncRendererStyles(target: VerifiedEmbed) {
    try {
      const targetDoc = target.source.document;
      const existingHref = new Set(
        [...targetDoc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => link.href),
      );
      const existingStyle = new Set(
        [...targetDoc.head.querySelectorAll<HTMLStyleElement>('style')].map(style => style.textContent),
      );
      // Some renderers (e.g. mathRender) lazily load KaTeX CSS into the
      // SiYuan host after the preview iframe copied its initial theme.
      for (const entry of document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
        'link[rel="stylesheet"], style',
      )) {
        if (entry instanceof HTMLLinkElement) {
          if (!entry.href || existingHref.has(entry.href)) continue;
          existingHref.add(entry.href);
        } else {
          if (!entry.textContent || existingStyle.has(entry.textContent)) continue;
          existingStyle.add(entry.textContent);
        }
        const copy = entry.cloneNode(true) as HTMLElement;
        copy.removeAttribute("id");
        // Resolve the URL in the host document before inserting the cloned
        // link in a nested Excalidraw iframe with a different base path.
        if (entry instanceof HTMLLinkElement && copy instanceof HTMLLinkElement) {
          copy.href = entry.href;
        }
        targetDoc.head.append(copy);
      }
    } catch {
      // Detached iframe: it will be recreated and refreshed independently.
    }
  }

  private async renderPreview(target: VerifiedEmbed) {
    // Available in SiYuan >= 3.8.x; use runtime lookup because the pinned
    // npm 'siyuan' declarations are older than the installed editor.
    const method = (Siyuan as unknown as {
      ProtyleMethod?: Record<string, (...args: any[]) => any>;
    }).ProtyleMethod;
    if (!method) return;
    const root = target.source.document.getElementById("root");
    if (!root || !root.isConnected) return;
    // The host functions reuse SiYuan's internal version of KaTeX, hljs, etc.
    // A single call can fail when an embed requires editor context; do not
    // prevent other block types or the existing read-only DOM preview.
    for (const name of renderMethodNames) {
      if (!target.embed.isConnected) return;
      const render = method[name];
      if (typeof render !== "function") continue;
      try {
        await render(root, "/stage/protyle");
      } catch (error) {
        console.warn(`[Excalidraw] SiYuan ${name} unavailable for preview:`, error);
      }
      if (!root.isConnected) return;
    }
    this.syncRendererStyles(target);
  }

  private getRect(target: VerifiedEmbed): DOMRect | null {
    if (!target.canvas.isConnected || !target.embed.isConnected) return null;
    try {
      const outer = target.canvas.getBoundingClientRect();
      const inner = target.embed.getBoundingClientRect();
      const view = target.canvas.contentWindow!;
      const scaleX = outer.width / Math.max(1, view.innerWidth);
      const scaleY = outer.height / Math.max(1, view.innerHeight);
      return new DOMRect(
        outer.left + inner.left * scaleX,
        outer.top + inner.top * scaleY,
        inner.width * scaleX,
        inner.height * scaleY,
      );
    } catch { return null; }
  }

  private getSceneFill(target: VerifiedEmbed): string | null {
    try {
      const scene = (target.canvas.contentWindow as Window & {
        excalidrawAPI?: { getSceneElements(): Array<{
          id: string; backgroundColor?: string; fillStyle?: string
        }> };
      }).excalidrawAPI?.getSceneElements();
      const id = new URL(target.embed.src, location.href).searchParams.get('elementId');
      const element = scene?.find(item => item.id === id);
      const fill = element?.backgroundColor;
      return element?.fillStyle === 'solid' && fill && fill !== 'transparent' &&
        CSS.supports('color', fill) ? fill : null;
    } catch { return null; }
  }

  private openEditor(target: VerifiedEmbed, blockId: string) {
    if (window.siyuan.config.readonly) {
      target.source.postMessage(JSON.stringify({ event: "dodoSiyuanNativeEditUnavailable" }), location.origin);
      return;
    }
    this.closeEditor();
    const rect = this.getRect(target);
    if (!rect || rect.width < 70 || rect.height < 40) return;

    const overlay = document.createElement("div");
    overlay.className = "dodo-excalidraw-native-editor";
    overlay.dataset.canvasSrc = target.canvas.src;
    overlay.style.cssText = [
      "position:fixed", "z-index:2147483000",
      "background:var(--b3-theme-background,#fff)",
      "color:var(--b3-theme-on-background,#222)",
      "border:1px solid var(--b3-theme-primary,#6f5de9)",
      "border-radius:5px", "overflow:hidden",
      "box-shadow:0 8px 24px #0002",
      "pointer-events:auto",
    ].join(";");

    // The editor occupies the entire embedded block. No separate title bar,
    // so native Protyle's content starts at the same top edge as the preview.
    const host = document.createElement("div");
    host.className = "dodo-excalidraw-native-editor-host";
    host.style.cssText = "height:100%;width:100%;min-height:0;overflow:auto";

    const styles = document.createElement("style");
    styles.textContent = `
      .dodo-excalidraw-native-editor .protyle,
      .dodo-excalidraw-native-editor .protyle-content,
      .dodo-excalidraw-native-editor .protyle-wysiwyg,
      .dodo-excalidraw-native-editor-host {
        background: transparent !important;
        background-color: transparent !important;
      }
    `;
    overlay.append(styles, host);
    document.body.append(overlay);
    this.overlay = overlay;
    this.editSource = target.source;
    this.editCanvas = target.canvas;
    this.editElementId = new URL(target.embed.src, location.href).searchParams.get("elementId");
    if (this.editElementId) target.canvas.contentWindow?.postMessage(
      JSON.stringify({ event: "dodoSiyuanNativeEditorState", elementId: this.editElementId, active: true }),
      location.origin);
    const updatePosition = () => {
      if (this.overlay !== overlay) return;
      const pos = this.getRect(target);
      if (!pos) { this.closeEditor(); return; }
      // Match the scene element's screen rectangle, while allowing a usable
      // text editing area if the canvas is zoomed far out.
      overlay.style.left = `${Math.max(0, pos.left)}px`;
      overlay.style.top = `${Math.max(0, pos.top)}px`;
      overlay.style.width = `${Math.min(Math.max(240, pos.width), window.innerWidth - Math.max(0, pos.left))}px`;
      overlay.style.height = `${Math.min(Math.max(150, pos.height), window.innerHeight - Math.max(0, pos.top))}px`;
      overlay.style.background = this.getSceneFill(target) || "var(--b3-theme-background,#fff)";
    };
    updatePosition();
    this.positionTimer = window.setInterval(updatePosition, 200);

    // A click anywhere outside the editing region completes the edit. The
    // canvas is a different iframe: pointer events do not bubble from it to
    // this host document, so listen in BOTH documents. Keep SiYuan popovers
    // usable (menus, select panels, dialogs can be appended to body).
    const onOutside = (event: PointerEvent) => {
      if (this.overlay !== overlay) return;
      const node = event.target;
      if (node instanceof Node && overlay.contains(node)) return;
      // Nested canvas nodes come from a different realm; instanceof Element
      // fails across iframes, so use the element's own closest method.
      if (node && typeof (node as Element).closest === "function" &&
          (node as Element).closest(
            ".dt-layer, .b3-menu, .b3-dialog, .protyle-util, .protyle-toolbar, .b3-select, .b3-tooltips"
          )) return;
      this.closeEditor();
    };
    document.addEventListener("pointerdown", onOutside, true);
    let canvasDocument: Document | null = null;
    try {
      canvasDocument = target.canvas.contentWindow?.document || null;
      canvasDocument?.addEventListener("pointerdown", onOutside, true);
    } catch { /* closing canvas */ }
    this.outsideCleanup = () => {
      document.removeEventListener("pointerdown", onOutside, true);
      canvasDocument?.removeEventListener("pointerdown", onOutside, true);
    };

    // The editor owns keyboard input while active, not Excalidraw's canvas.
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        this.closeEditor();
      } else {
        event.stopPropagation();
      }
    });
    try {
      this.activeProtyle = new Protyle(this.getApp(), host, {
        blockId,
        action: ["cb-get-focus"],
        render: { title: false, gutter: false, scroll: true, breadcrumb: false },
        after: (instance) => {
          if (this.overlay === overlay) {
            instance.resize();
            const focused = instance.protyle?.wysiwyg?.element?.querySelector(
              `[data-node-id="${blockId}"]`,
            );
            if (focused) instance.focusBlock(focused);
            else instance.focus();
          }
        },
      });
      target.source.postMessage(JSON.stringify({ event: "dodoSiyuanNativeEditStarted" }), location.origin);
    } catch (error) {
      console.warn("[Excalidraw] Native Protyle unavailable:", error);
      this.closeEditor();
      // Keep the existing hover editor as a compatibility fallback.
      target.source.postMessage(JSON.stringify({ event: "dodoSiyuanNativeEditUnavailable" }), location.origin);
    }
  }

  private closeEditor() {
    const canvas = this.editCanvas;
    const elementId = this.editElementId;
    this.editCanvas = null;
    this.editElementId = null;
    if (canvas?.contentWindow && elementId) canvas.contentWindow.postMessage(
      JSON.stringify({ event: "dodoSiyuanNativeEditorState", elementId, active: false }),
      location.origin);
    this.outsideCleanup?.();
    this.outsideCleanup = null;
    if (this.positionTimer !== null) window.clearInterval(this.positionTimer);
    this.positionTimer = null;
    this.activeProtyle?.destroy();
    this.activeProtyle = null;
    this.overlay?.remove();
    this.overlay = null;
    const source = this.editSource;
    this.editSource = null;
    // Native Protyle commits to the real SiYuan block; refresh only this
    // Excalidraw snapshot from that ID, rather than saving a second copy.
    try {
      source?.postMessage(JSON.stringify({ event: "dodoSiyuanNativeEditFinished" }), location.origin);
    } catch { /* The embedded frame may already have been destroyed. */ }
  }
}
