import assert from "node:assert/strict";
import { build } from "esbuild";

// The adapter contract matters to SiYuan: exports must keep the editable
// scene inside the generated SVG/PNG, not just render a flattened preview.
const transformed = await build({
  entryPoints: ["src/lets-excalidraw/app/excalidraw-export.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  logLevel: "silent",
  plugins: [{
    name: "fake-excalidraw-next",
    setup(build) {
      build.onResolve({ filter: /^@excalidraw\/excalidraw$/ }, () => ({
        path: "excalidraw-next",
        namespace: "fixture",
      }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: "export const exportScene = async (args) => args;",
        loader: "js",
      }));
    },
  }],
});
const module = { exports: {} };
new Function("module", "exports", "require", transformed.outputFiles[0].text)(
  module, module.exports, () => { throw new Error("Unexpected require in isolated export adapter"); },
);
const { exportToSvg, exportToBlob } = module.exports;
const originalElements = [{ id: "rect-1", type: "rectangle" }];
const originalFiles = { "image-1": { id: "image-1" } };
const appState = {
  exportEmbedScene: true,
  exportBackground: false,
  exportWithDarkMode: false,
  exportScale: 2,
  viewBackgroundColor: "#aabbcc",
};

const svg = await exportToSvg({
  elements: originalElements,
  appState,
  files: originalFiles,
  exportPadding: 14,
});
assert.equal(svg.type, "svg");
assert.equal(svg.data.elements, originalElements);
assert.equal(svg.data.files, originalFiles);
assert.equal(svg.data.appState, appState);
assert.equal(svg.config.embedScene, true, "SVG must retain editable data");
assert.equal(svg.config.canvasBackgroundColor, false);
assert.equal(svg.config.theme, "light");
assert.equal(svg.config.padding, 14);
assert.equal(svg.config.scale, 2);

const png = await exportToBlob({
  elements: originalElements,
  appState: { ...appState, exportBackground: true, exportWithDarkMode: true },
  files: originalFiles,
  mimeType: "image/png",
});
assert.equal(png.type, "png");
assert.equal(png.config.embedScene, true, "PNG must retain editable data");
assert.equal(png.config.canvasBackgroundColor, "#aabbcc");
assert.equal(png.config.theme, "dark");

console.log("PASS: Excalidraw next exportScene SVG/PNG adapter preserves editable scene and rendering options");
