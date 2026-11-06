import { exportScene } from "@excalidraw/excalidraw";

/**
 * The next build consolidated exportToSvg/exportToBlob into exportScene.
 * Keep the prior app-level signatures in one place: SiYuan SVG/PNG attachments
 * must continue embedding the editable Excalidraw scene, not only the preview.
 */
type LegacyExportOptions = {
  elements: readonly any[];
  appState: Record<string, any>;
  files: Record<string, any>;
  exportPadding?: number;
  mimeType?: string;
};

function toSceneArgs(options: LegacyExportOptions) {
  const { appState } = options;
  return {
    data: {
      elements: options.elements,
      appState,
      files: options.files,
    },
    config: {
      // The previous API used appState.export* flags; the next API puts
      // rendering options in config.
      theme: appState.exportWithDarkMode ? "dark" : "light",
      canvasBackgroundColor: appState.exportBackground
        ? (appState.viewBackgroundColor || "#ffffff")
        : false,
      embedScene: !!appState.exportEmbedScene,
      scale: appState.exportScale ?? 1,
      padding: options.exportPadding ?? 10,
      frames: appState.frameRendering,
    },
  };
}

export async function exportToSvg(options: LegacyExportOptions): Promise<SVGSVGElement> {
  return exportScene({ type: "svg", ...toSceneArgs(options) } as any) as Promise<SVGSVGElement>;
}

export async function exportToBlob(options: LegacyExportOptions): Promise<Blob> {
  const type = options.mimeType === "image/jpeg" ? "jpeg" : "png";
  return exportScene({ type, ...toSceneArgs(options) } as any) as Promise<Blob>;
}
