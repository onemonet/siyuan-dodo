import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import { runInNewContext } from "node:vm";

// Test the *actual locator method* extracted from the plugin, without booting SiYuan.
const source = readFileSync("src/lets-excalidraw/index.ts", "utf8");
const start = source.indexOf("  private getAgentTargetIframe(");
const end = source.indexOf("\n  public isDarkMode()", start);
assert(start >= 0 && end > start, "Locator source unavailable");
const method = source.slice(start, end);
const { code } = await transform(`class Locator {\n${method}\n}`, { loader: "ts", format: "cjs" });

function locate(frames, { canvasId, activeFrame = null, visible = false } = {}) {
  const makeVisible = (frame) => visible || frame.visible === true;
  const document = {
    querySelectorAll(selector) {
      if (selector.includes(".b3-dialog--open")) return [];
      if (selector.includes(".excalidraw-edit-tab") || selector.startsWith("iframe[")) return frames;
      return [];
    },
  };
  for (const frame of frames) frame.getClientRects = () => makeVisible(frame) ? [{}] : [];
  const Locator = runInNewContext(code + "\nLocator;", {
    document, plugin: { name: "siyuan-dodo" },
    location: { href: "http://localhost:6806/" }, URL,
  });
  const locator = new Locator();
  locator.EDIT_TAB_TYPE = "excalidraw-edit-tab";
  locator.getActiveCustomTab = () => activeFrame ? { element: { querySelector: () => activeFrame } } : null;
  return locator.getAgentTargetIframe(canvasId);
}

const frame = {
  isConnected: true,
  contentWindow: {},
  src: "http://localhost:6806/plugins/siyuan-dodo/excalidraw/app/?imageURL=assets%2Fexcalidraw-a.svg",
};
assert.equal(locate([frame]), frame,
  "An editor must remain addressable after its tab is hidden by the SiYuan Agent tab");
assert.equal(locate([frame], { canvasId: "assets/excalidraw-a.svg" }), frame,
  "Explicit canvasId must locate hidden editor");
assert.equal(locate([frame], { visible: true }), frame, "Visible editor should work");
assert.equal(locate([]), null, "No editor should not be guessed");
const frame2 = { ...frame, src: frame.src.replace("excalidraw-a.svg", "excalidraw-b.svg") };
assert.throws(() => locate([frame, frame2]), /存在多个已打开的画布/,
  "Multiple hidden editors should require an explicit target");
assert.equal(locate([frame, frame2], { canvasId: "assets/excalidraw-b.svg" }), frame2,
  "Explicit canvasId disambiguates hidden editors");
assert.throws(() => locate([frame], { canvasId: "assets/missing.svg" }), /未找到指定 canvasId/,
  "Missing canvas is distinguishable from duplicate editors");
console.log("PASS: active and hidden Excalidraw editor lookup");
