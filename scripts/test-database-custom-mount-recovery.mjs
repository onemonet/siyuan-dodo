import assert from "node:assert/strict";
import { build } from "esbuild";

await build({
  entryPoints: ["src/lets-database-view/custom/renderer.ts"],
  outfile: "tmp/custom-view-test/mount-recovery.mjs",
  bundle: true, format: "esm", platform: "node", logLevel: "silent",
  plugins: [{
    name: "custom-mount-test-stubs",
    setup(b) {
      b.onResolve({ filter: /^\.\.\/core\/view-host$|^\.\/storage$/ },
        args => ({ path: args.path, namespace:"custom-mount-stub" }));
      b.onLoad({ filter: /.*/, namespace:"custom-mount-stub" }, args => ({
        loader:"js",
        contents: args.path.includes("storage")
          ? "export async function getCustomApp(){ return {html:'<!doctype html><html><head></head><body>App内容</body></html>',manifest:{version:3}} }"
          : "export const databaseViewHost={beginRead:()=>()=>true}",
      }));
    },
  }],
});
const { renderCustomView, customRuntimeReady } =
  await import("../tmp/custom-view-test/mount-recovery.mjs");
const av = { dataset:{nodeId:"20261104000000-aaaaaaa"} };
const messages = [];
const frame = {
  isConnected: true,
  contentWindow: {
    dodoDB: Object.freeze({getSchema(){}}),
    postMessage(data){messages.push(data)},
  },
  srcdoc: "",
};
const mounted = {
  kind:"custom", frame,
  customAppId:"app-11111111-2222-3333-4444-555555555555",
  customVersion:3,
};
const mounts = new Map([[av,mounted]]);
const bridge = {
  enabled:()=>true,
  mounted:()=>mounts,
  read:async()=>({
    "20261104000000-bbbbbbb": {
      custom:{appId:mounted.customAppId},
    },
  }),
};
mounted.viewId="20261104000000-bbbbbbb";

assert(customRuntimeReady(frame));
await renderCustomView(av,bridge);
assert.equal(messages.length,1,"An already booted same-version iframe receives one refresh");
assert.equal(messages[0].type,"dodoCustomRefresh");
assert.equal(frame.srcdoc,"","A healthy iframe should never be reloaded");

// Chromium may discard iframe document on reparenting even though Dodo's
// mounted.customVersion and customAppId remain identical.
frame.contentWindow={ postMessage(data){messages.push(data)} };
assert.equal(customRuntimeReady(frame),false);
await renderCustomView(av,bridge);
assert.match(frame.srcdoc,/App内容/);
assert.match(frame.srcdoc,/window\.dispatchEvent\(new Event\('dodoDBReady'\)\)/);
assert.equal(messages.length,1,
  "Refresh cannot be posted to a blank iframe without dodoDB bootstrap");

frame.contentWindow={ dodoDB:{listRecords(){}}, postMessage(data){messages.push(data)} };
await renderCustomView(av,bridge);
assert.equal(messages.length,2,"Hydrated iframe resumes normal refresh behavior");
assert.equal(messages.at(-1).type,"dodoCustomRefresh");
console.log("PASS: custom iframe same-version refresh, blank-document recovery after view switch, and loaded SDK detection");
