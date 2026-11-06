import assert from "node:assert/strict";
import { build } from "esbuild";

const compile = async (entry, plugins = []) => {
  const result = await build({entryPoints: [entry], bundle: true, write: false,
    platform: "node", format: "esm", plugins});
  const code = result.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
};
const {
  normalizeDrawingStyle, captureCurrentDrawingStyle, DEFAULT_DRAWING_INITIAL_STYLE,
} = await compile("src/lets-excalidraw/drawing-style.ts");
assert.deepEqual(DEFAULT_DRAWING_INITIAL_STYLE, {
  currentItemRoughness: 0, currentItemRoundness: null,
});
const sample = normalizeDrawingStyle({
  currentItemRoughness: 0, currentItemRoundness: null,
  currentItemStrokeWidth: 3.5, currentItemStrokeStyle: "solid",
  currentItemFillStyle: "hachure", currentItemStrokeColor: "#abcdef",
  currentItemBackgroundColor: "transparent", currentItemFontSize: 22,
  currentItemOpacity: 80, currentItemTextAlign: "right",
  currentItemEndArrowhead: "arrow", selectedElementIds: {secret: true},
  weirdSetting: "bad",
});
assert.equal(Object.keys(sample).length, 11);
assert.equal(sample.currentItemRoughness, 0);
assert.equal(sample.currentItemRoundness, null);
assert.ok(!("selectedElementIds" in sample));
assert.ok(!("weirdSetting" in sample));
assert.deepEqual(normalizeDrawingStyle({
  currentItemStrokeWidth: -2, currentItemRoughness: 1e10,
  currentItemRoundness: {type:3, unrelated:"ignored"},
  currentItemStrokeColor: "javascript:bad",
}), { currentItemRoundness: {type: 3} });
assert.deepEqual(captureCurrentDrawingStyle({currentItemRoughness:2,selectedElementIds:{a:true}}),
  {currentItemRoughness: 2});
const {normalizeToolbarPreferences, toolbarPatch} =
  await compile("src/lets-excalidraw/toolbar-preferences.ts");
assert.deepEqual(normalizeToolbarPreferences({}).drawingInitialStyle,
  DEFAULT_DRAWING_INITIAL_STYLE);
assert.deepEqual(toolbarPatch({drawingInitialStyle:sample}).drawingInitialStyle,
  {...DEFAULT_DRAWING_INITIAL_STYLE, ...sample});

let stored = new Map();
globalThis.localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
const m = await compile("src/lets-excalidraw/app/interactions/tool-state-persistence.ts", [{
  name: "mock-excalidraw",
  setup(bundle) {
    bundle.onResolve({filter:/^@excalidraw\/excalidraw$/}, () => ({
      path: "excalidraw", namespace: "stub",
    }));
    bundle.onLoad({filter:/.*/, namespace:"stub"}, () => ({
      contents: "export const CaptureUpdateAction={NEVER:'never'};", loader:"js",
    }));
  },
}]);
let updates = [], listeners = new Set();
const existingElements = [{id:"a",roughness:9,roundness:{type:3}}];
let state = {
  currentItemRoughness: 4, currentItemRoundness:{type:3},
  currentItemStrokeWidth:1, currentItemStrokeColor:"#1e1e1e",
};
const api = {
  getAppState() {return state},
  getSceneElements() {return existingElements},
  updateScene(patch) {
    updates.push(patch);
    if (patch.appState) state = {...state,...patch.appState};
    for (const callback of listeners) callback(existingElements,state);
  },
  onChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};
stored.set(m.LOCAL_DRAWING_STYLE_KEY,
  JSON.stringify({currentItemRoughness:7,currentItemStrokeColor:"#ff5500"}));
let session = m.startDrawingStyleSession(api, {
  currentItemRoughness:0,currentItemRoundness:null,currentItemStrokeWidth:5,
}, false);
assert.equal(state.currentItemRoughness, 0);
assert.equal(state.currentItemRoundness, null);
assert.equal(state.currentItemStrokeWidth, 5);
assert.equal(state.currentItemStrokeColor, "#1e1e1e"); // local ignored
assert.deepEqual(existingElements, [{id:"a",roughness:9,roundness:{type:3}}]);
assert.equal(updates.at(-1).captureUpdate, "never");
assert.equal(listeners.size, 0);
session.setRememberLastUsed(true);
assert.equal(listeners.size,1);
api.updateScene({appState:{currentItemRoughness:2}});
session.destroy();
assert.equal(listeners.size,0);
assert.equal(JSON.parse(stored.get(m.LOCAL_DRAWING_STYLE_KEY)).currentItemRoughness,2);
session = m.startDrawingStyleSession(api,
  {currentItemRoughness:0,currentItemRoundness:null,currentItemStrokeWidth:5}, true);
assert.equal(state.currentItemRoughness,2); // local wins when enabled
assert.equal(state.currentItemStrokeWidth,5); // missing local key uses synced init
assert.equal(state.currentItemRoundness,null);
session.destroy();
session = m.startDrawingStyleSession(api,
  {currentItemRoughness:0,currentItemRoundness:null,currentItemStrokeWidth:5}, false);
assert.equal(state.currentItemRoughness,0); // disable local, shared default restored
session.destroy();
assert.deepEqual(existingElements,[{id:"a",roughness:9,roundness:{type:3}}]);
console.log("PASS: whitelist, sharp corners/roughness 0, plugin initialization, local-only precedence, toggles and existing shape safety");

