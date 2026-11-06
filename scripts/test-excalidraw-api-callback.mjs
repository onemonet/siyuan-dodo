import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync("src/lets-excalidraw/app/app.tsx", "utf8");
const upstreamTypes = readFileSync(
  "node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts", "utf8",
);
assert.match(upstreamTypes, /onExcalidrawAPI\?:\s*\(api:/, "upstream development version must expose the new callback");
assert.match(app, /onExcalidrawAPI=\{setExcalidrawAPI\}/, "editor must supply the new callback");
assert.doesNotMatch(app, /\bexcalidrawAPI=\{setExcalidrawAPI\}/, "legacy callback property no longer exists");
assert.match(app, /if \(!api\) \{[\s\S]*?return;[\s\S]*?\}/, "unmount must not mount against a null API");
assert.match(app, /mountEnhancements\(api\)/, "enhancement toolbar must mount after API is available");
console.log("PASS: Excalidraw next API callback mounts enhancement toolbar and handles unmount");
