import assert from 'node:assert/strict';
import { build } from 'esbuild';

const files = new Map();
let writes = 0, readFailure = false, writeFailure = false, saveFailure = false;
let missingStatus = 404, kernelCode = 0;
globalThis.fetch = async (url, options) => {
  if (url === '/api/file/getFile') {
    if (readFailure) return new Response('denied', { status: 403 });
    if (kernelCode) return Response.json({ code: kernelCode, msg: 'kernel read failed', data: null }, { status: 202 });
    const path = JSON.parse(options.body).path;
    return files.has(path) ? new Response(files.get(path)) : missingStatus === 404 ? new Response('', { status: 404 }) : Response.json({ code: 404, msg: 'path does not exist', data: null }, { status: missingStatus });
  }
  assert.equal(url, '/api/file/putFile');
  if (writeFailure) return Response.json({ code: -1 });
  writes++;
  files.set(options.body.get('path'), await options.body.get('file').text());
  return Response.json({ code: 0 });
};
const store = {
  value: {}, get() { return this.value; },
  setBySpace(_space, key, value) { this.value[key] = value; },
  async save() { if (saveFailure) throw new Error('settings write failed'); },
};
const bundled = await build({ entryPoints: ['src/lets-excalidraw/config.ts'], bundle: true, write: false, format: 'esm' });
const { normalizeConfig, migrateExcalidrawData } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
assert.equal(normalizeConfig({ fullSaveDelay: '0.5', autoSaveInterval: -1 }).fullSaveDelay, 0.5);
assert.equal(normalizeConfig({ embedImageFormat: 'html', enableAutoSave: 'true', autoSaveInterval: Infinity }).embedImageFormat, 'svg');
const old = '/data/storage/petal/siyuan-dodo-excalidraw';
const target = '/data/storage/petal/siyuan-dodo/excalidraw-library.excalidrawlib';
files.set(old + '/config.json', JSON.stringify({ themeMode: 'themeDark', autoSaveInterval: '0.5', snippets: ['css-id'], enabled: true }));
const library = JSON.stringify({ type: 'excalidrawlib', version: 2, libraryItems: [] });
files.set(old + '/library.excalidrawlib', library);
await migrateExcalidrawData(store, 'siyuan-dodo');
assert.equal(store.value.autoSaveInterval, 0.5);
assert.equal(store.value.enabled, undefined, 'legacy config must not change module enablement');
assert.deepEqual(store.value.snippets, ['css-id']);
assert.equal(files.get(target), library);
assert.equal(files.get(old + '/library.excalidrawlib'), library, 'migration preserves source');
store.value.themeMode = 'themeOS';
await migrateExcalidrawData(store, 'siyuan-dodo');
assert.equal(store.value.themeMode, 'themeOS');
assert.equal(writes, 1, 'restarts do not overwrite a migrated library');
store.value = {}; files.set(target, library.replace('"version":2', '"version":1'));
await migrateExcalidrawData(store, 'siyuan-dodo');
assert.equal(writes, 1, 'existing destination must be preserved');
store.value = {}; files.delete(target); writeFailure = true;
await assert.rejects(migrateExcalidrawData(store, 'siyuan-dodo'), /复制失败/);
assert.equal(store.value.libraryImported, undefined);
writeFailure = false;
await migrateExcalidrawData(store, 'siyuan-dodo');
assert.equal(store.value.libraryImported, true, 'failed migration can be retried');
store.value = {}; readFailure = true;
await assert.rejects(migrateExcalidrawData(store, 'siyuan-dodo'), /HTTP 403/);
assert.equal(store.value.configImported, undefined);
readFailure = false; saveFailure = true;
await assert.rejects(migrateExcalidrawData(store, 'siyuan-dodo'), /settings write/);
assert.equal(store.value.configImported, false);
saveFailure = false;
files.delete(old + '/config.json'); files.delete(old + '/library.excalidrawlib'); files.delete(target);
store.value = {};
await migrateExcalidrawData(store, 'siyuan-dodo');
assert.equal(store.value.configImported, true, 'fresh installs initialize without legacy files');

// Both legacy HTTP 202 and HTTP 200 JSON errors must remain distinct from file bytes.
for (const status of [202, 200]) {
  missingStatus = status;
  store.value = {};
  await migrateExcalidrawData(store, 'siyuan-dodo');
  assert.equal(store.value.configImported, true);
  assert.equal(store.value.libraryImported, true, 'missing library must not block module startup');
  store.value = {};
  files.set(old + '/library.excalidrawlib', library);
  await migrateExcalidrawData(store, 'siyuan-dodo');
  assert.equal(files.get(target), library, 'a missing destination must still copy an existing library');
  files.delete(target); files.delete(old + '/library.excalidrawlib');
}
missingStatus = 404;
for (const code of [403, 500]) {
  kernelCode = code;
  store.value = { configImported: true };
  await assert.rejects(migrateExcalidrawData(store, 'siyuan-dodo'), /kernel read failed/);
  assert.equal(store.value.libraryImported, undefined, 'permission and IO errors must remain retryable');
}
kernelCode = 0;
store.value = { configImported: true };
files.set(old + '/library.excalidrawlib', '{"type":"invalid","libraryItems":[]}');
await assert.rejects(migrateExcalidrawData(store, 'siyuan-dodo'), /素材库格式无效/);
assert.equal(files.has(target), false, 'invalid source must not be copied');
files.delete(old + '/library.excalidrawlib');
store.value = {};

// Bundle the actual controller with only SiYuan/DOM boundaries substituted.
const listeners = new Map();
let observers = 0, disconnects = 0, commands = 0, tabs = 0;
const host = {
  name: 'siyuan-dodo', app: {}, protyleSlash: [{ id: 'other-module' }],
  addCommand() { commands++; }, addTab() { tabs++; }, addFloatLayer() {},
  eventBus: { on(event, fn) { listeners.set(event, fn); }, off(event) { listeners.delete(event); } },
};
globalThis.__excalidrawTest = { host, store };
globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), siyuan: { plugins: [], config: { lang: 'zh_CN' } } };
globalThis.MutationObserver = class { constructor() { observers++; } observe() {} disconnect() { disconnects++; } };
globalThis.document = { body: {}, querySelectorAll: () => [], documentElement: { setAttribute() {}, removeAttribute() {}, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) } };
const stubs = {
  siyuan: 'export const getFrontend=()=>"desktop"; export const showMessage=()=>{}; export class Dialog{}; export class Custom{}; export class Protyle{}; export const fetchPost=()=>{}; export const fetchSyncPost=()=>{}; export const getAllModels=()=>({custom:[]}); export const openTab=()=>{};',
  '../utils': 'export const plugin=globalThis.__excalidrawTest.host;',
  '../settings': 'export const settings=globalThis.__excalidrawTest.store;',
  '../myscripts/syUtils': 'export const addProtyleSlash=item=>{const p=globalThis.__excalidrawTest.host;if(!p.protyleSlash.some(x=>x.id===item.id))p.protyleSlash.push(item)};',
  './libs/skill-runtime': 'export const createSiYuanSkillRuntime=()=>({registerPluginSkill:async()=>({action:"current"})});',
};
const controller = await build({ entryPoints: ['src/lets-excalidraw/index.ts'], bundle: true, write: false, format: 'esm', loader: { '.scss': 'empty' }, plugins: [{
  name: 'host-boundary', setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : args.path.endsWith('?raw') ? { path: args.path, namespace: 'raw' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path] }));
    build.onLoad({ filter: /.*/, namespace: 'raw' }, () => ({ contents: 'export default "Drawing guide"' }));
  }
}] });
const { default: Controller } = await import('data:text/javascript;base64,' + Buffer.from(controller.outputFiles[0].text).toString('base64'));
const module = new Controller();
await module.onload();
assert.equal(host.protyleSlash.length, 2);
assert.equal(commands, 1); assert.equal(tabs, 1);
globalThis.location = { origin: 'http://localhost', href: 'http://localhost/' };
const injected = [];
const originalGetSnippets = module.getSnippets;
module.getSnippets = async () => [{ type: 'js', content: 'import("/snippets/custom/excalidraw-v2/dist/excalidraw-v2.js")' }, { type: 'css', content: '.user-custom {color: red}' }];
document.createElement = () => ({ setAttribute() {} });
await module.injectSnippetsToIframe({ isConnected: true, contentDocument: { head: { appendChild: node => injected.push(node) } } });
assert.equal(injected.length, 1, 'legacy enhancement loader must not create a second toolbar');
assert.equal(injected[0].textContent, '.user-custom {color: red}', 'unrelated custom snippets remain available');
module.getSnippets = originalGetSnippets;
const replies = [[], []];
const frames = replies.map(list => ({ isConnected: true, contentWindow: { postMessage: (value, origin) => { assert.equal(origin, location.origin); list.push(JSON.parse(value)); } } }));
frames.forEach(frame => module.editors.set(frame, () => {}));
const sendPreference = (frame, patch, requestId) => module.handleEnhancementMessage({ source: frame.contentWindow, origin: location.origin, data: JSON.stringify({ event: 'enhancementPreferencesSave', patch, requestId }) });
module.handleEnhancementMessage({ source: {}, origin: location.origin, data: JSON.stringify({ event: 'enhancementPreferencesSave', requestId: 'untrusted', patch: { toolbarEnabled: false } }) });
sendPreference(frames[0], { toolbarShowLabels: true, enabled: false }, 'one');
sendPreference(frames[1], { toolbarMode: 'fixed' }, 'two');
await module.toolbarSaveQueue;
assert.equal(store.value.toolbarShowLabels, true);
assert.equal(store.value.toolbarMode, 'fixed', 'queued patches from different frames must merge');
assert.equal(store.value.enabled, undefined, 'toolbar messages cannot change module enablement');
assert.ok(replies.every(list => list.some(message => message.event === 'enhancementPreferencesChanged')));
saveFailure = true;
sendPreference(frames[0], { toolbarMode: 'follow' }, 'failure');
await module.toolbarSaveQueue;
assert.equal(store.value.toolbarMode, 'fixed', 'failed preference saves must roll back');
assert.ok(replies[0].some(message => message.requestId === 'failure' && message.error));
saveFailure = false;
module.editors.clear();

await module.onunload();
assert.deepEqual(host.protyleSlash.map(x => x.id), ['other-module']);
assert.equal(listeners.size, 0);
await module.onload();
assert.equal(commands, 1, 'reactivation must not duplicate persistent commands');
assert.equal(tabs, 1, 'reactivation must reuse tab registration');
assert.equal(observers, 2); assert.equal(disconnects, 1);
let closed = false;
module.editors.set({}, () => { closed = true; });
module.saveEditor = async () => { throw new Error('disk full'); };
await assert.rejects(module.onunload(), /disk full/);
assert.equal(module.active, true, 'failed saves leave the live editor available');
assert.equal(closed, false);
module.editors.clear();
await module.onunload();
window.siyuan.plugins.push({ name: 'siyuan-dodo-excalidraw' });
await assert.rejects(module.onload(), /先停用/);
assert.equal(module.active, false);
console.log('Excalidraw migration and module lifecycle checks passed.');

// The registry must keep a failed-to-unload module, including when rescanning.
const registryBundle = await build({ entryPoints: ['src/plugin-registry.ts'], bundle: true, write: false, format: 'esm',
  define: { 'import.meta.env.DEV': 'false' }, plugins: [{ name: 'registry-boundary', setup(build) {
    build.onResolve({ filter: /^(siyuan|\.\/settings)$/ }, args => ({ path: args.path, namespace: 'registry-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'registry-stub' }, args => ({ contents: args.path === 'siyuan' ? 'export const showMessage=()=>{};' : 'export const settings=globalThis.__excalidrawTest.store;' }));
  } }] });
const { PluginRegistry } = await import('data:text/javascript;base64,' + Buffer.from(registryBundle.outputFiles[0].text).toString('base64'));
const registry = PluginRegistry.getInstance();
let starts = 0, stops = 0;
const guarded = { name: 'excalidraw', enabled: true, onload: async () => { starts++; }, onunload: async () => { stops++; throw new Error('disk full'); } };
registry.registerPlugin(guarded);
await registry.beginPlugin('excalidraw');
const originalError = console.error;
console.error = () => {};
try {
  await registry.unloadPlugin('excalidraw');
  assert.equal(guarded.enabled, true);
  assert.equal(store.value.enabled, true);
  await registry.beginPlugin('excalidraw');
  assert.equal(starts, 1, 'a failed stop must not make the next enable duplicate initialization');
  await assert.rejects(registry.reScanPlugins(), /未能停用/);
  assert.equal(registry.getPlugin('excalidraw'), guarded);
  guarded.onunload = async () => { stops++; };
  await registry.unloadPlugin('excalidraw');
  assert.equal(guarded.enabled, false);
} finally { console.error = originalError; }
console.log('Excalidraw registry failure recovery checks passed.');
