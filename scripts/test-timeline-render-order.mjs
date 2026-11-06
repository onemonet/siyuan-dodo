import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

// Exercise the actual async controller with deferred native reads.
const source = await readFile("src/lets-custom-block/timeline/iframe/main.ts", "utf8");
const code = source.slice(source.indexOf("let renderRevision ="), source.indexOf('\nwindow.addEventListener("message"'));
const compiled = (await transform(code, { loader: "ts", target: "es2022" })).code;
const pending = [], rendered = [], errors = [];
let configID = 0;
const context = {
  setTheme() {}, resolveIsDark: async () => false, currentTimelineStateKey: () => "test-timeline-state",
  getBlockId: () => "block", getSearchParams: () => new URLSearchParams({ viewId: "view", avID: "20261023101010-aaaaaaa" }),
  getBlockAttrs: async () => ({ views: JSON.stringify({ views: { view: { mode: "timeline", configs: { timeline: { configID: ++configID } } } } }) }),
  VIEWS_ATTR: "views", sourceQuery: "search", TimelineBlockConfigService: { sanitizeConfig: (_block, config) => config },
  TimelineTableProvider: { load: (_block, config) => new Promise((resolve, reject) => pending.push({ config, resolve, reject })) },
  TimelineTransformerService: { transform: (_table, config) => ({ configID: config.configID, events: [] }) },
  loadingEl: {}, errorEl: {}, timelineEl: {}, recordTargets: new Map(), currentIsDark: false,
  renderer: { render: (_element, data) => rendered.push(data.configID) },
  renderedData: null, renderedConfig: null, decorateRecordTitles() {},
  showError: error => errors.push(error), console: { error() {} },
};
runInNewContext(compiled, context);
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const first = context.boot(); await tick();
const second = context.boot(); await tick();
assert.equal(pending.length, 2);
pending[1].resolve({ headers: [], rows: [] }); await second;
pending[0].resolve({ headers: [], rows: [] }); await first;
assert.deepEqual(rendered, [2], "slow previous read cannot replace the latest timeline");
const failing = context.boot(); await tick();
const succeeding = context.boot(); await tick();
pending[3].resolve({ headers: [], rows: [] }); await succeeding;
pending[2].reject(new Error("old failure")); await failing;
assert.deepEqual(errors, [], "an old error cannot blank a newer successful timeline");
const current = context.boot(); await tick();
pending[4].reject(new Error("current failure")); await current;
assert.deepEqual(errors, ["current failure"], "current failures remain visible");
console.log("PASS: timeline renders only the latest async result and ignores stale failures");
