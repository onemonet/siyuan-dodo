import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
// The converter only needs text metrics. No editor UI or network runs in these checks.
globalThis.devicePixelRatio = 1;
globalThis.Element = class { replaceChildren() {} };
globalThis.FontFace = class {};
globalThis.window = { devicePixelRatio: 1, location: { origin: 'http://localhost' }, addEventListener() {}, removeEventListener() {} };
globalThis.location = { search: '?imageURL=assets%2Fexcalidraw-test.svg' };
globalThis.document = {
  documentElement: { style: {} }, querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute() {}, getContext: () => ({ measureText: (text) => ({ width: text.length * 12, actualBoundingBoxAscent: 16, actualBoundingBoxDescent: 4 }) }) }),
  fonts: { check: () => true, add() {}, addEventListener() {} },
};
const bundled = await build({ entryPoints: ['src/lets-excalidraw/app/canvas.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty' }, logLevel: 'silent' });
const module = { exports: {} };
new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(module, module.exports, require);
const { addCanvasElements, updateCanvasElements, deleteCanvasElements, handleAgentCanvasCommand, repairCanvasBindings } = module.exports;
let scene = [];
let capture;
window.excalidrawAPI = {
  getSceneElements: () => scene.filter((element) => !element.isDeleted),
  getSceneElementsIncludingDeleted: () => scene,
  getAppState: () => ({ selectedElementIds: {} }),
  updateScene: (data) => { scene = data.elements; capture = data.captureUpdate; },
};
const get = (id) => scene.find((element) => element.id === id && !element.isDeleted);
const node = (id, x) => ({ id, type: 'rectangle', x, y: 0, width: 200, height: 80, label: { text: id } });
addCanvasElements([node('a', 0), node('b', 400), { id: 'edge', type: 'arrow', x: 0, y: 0, start: { id: 'a' }, end: { id: 'b' }, label: { text: '连接' } }]);
assert.equal(capture, 'IMMEDIATELY');
assert.equal(get('edge').startBinding.elementId, 'a');
assert.equal(get('edge').endBinding.elementId, 'b');
const edgeLabelId = get('edge').boundElements.find((ref) => ref.type === 'text').id;
const edgeLabelBefore = structuredClone(get(edgeLabelId));
addCanvasElements([node('unrelated', 800)]);
assert.deepEqual(get(edgeLabelId), edgeLabelBefore, 'adding unrelated content must preserve an arrow label');
const read = handleAgentCanvasCommand('read', { ids: ['a'] });
assert.equal(read.canvasId, 'assets/excalidraw-test.svg');
const textId = read.elements[0].labelId;
const textBefore = structuredClone(get(textId));
const edgeBefore = structuredClone(get('edge'));
updateCanvasElements([{ id: 'a', version: get('a').version, x: 100, text: '新标题' }]);
assert.equal(get(textId).originalText, '新标题');
assert.ok(get(textId).x > textBefore.x, 'bound text should follow the moved node');
assert.ok(get('edge').x > edgeBefore.x, 'the bound arrow endpoint should follow the moved node');
assert.ok(get('a').version > read.elements[0].version);
const beforeConflict = structuredClone(scene);
assert.throws(() => updateCanvasElements([{ id: 'a', version: 0, x: 900 }]), /版本/);
assert.deepEqual(scene, beforeConflict, 'stale updates must be atomic');
assert.throws(() => handleAgentCanvasCommand('delete', { canvasId: 'other.svg', ids: ['a'] }), /目标画布/);
assert.throws(() => addCanvasElements([{ id: 'bad', type: 'line', x: 0, y: 0, points: 'invalid' }]), /points/);
assert.deepEqual(scene, beforeConflict, 'invalid elements must not change the scene');
deleteCanvasElements(['a']);
assert.equal(get('a'), undefined);
assert.equal(get(textId), undefined);
assert.ok(get('edge'), 'deleting a node must retain its connecting arrow');
assert.equal(get('edge').startBinding, null);
assert.equal(scene.find((element) => element.id === 'a').isDeleted, true, 'deleted nodes need tombstones for undo');
const externalBefore = structuredClone(get('b'));
addCanvasElements([{ id: 'external-edge', type: 'arrow', x: 0, y: 0, start: { id: 'b' }, end: { id: 'unrelated' } }]);
assert.equal(get('external-edge').startBinding.elementId, 'b');
assert.equal(get('b').x, externalBefore.x);
assert.equal(get('b').width, externalBefore.width);
assert.equal(get('b').boundElements.find((ref) => ref.type === 'text').id, externalBefore.boundElements.find((ref) => ref.type === 'text').id);
addCanvasElements([node('framed', 1000), { id: 'frame', type: 'frame', name: '分组', children: ['framed'] }]);
assert.equal(get('framed').frameId, 'frame');
assert.ok(get('frame').width > 200);
const page = handleAgentCanvasCommand('read', { offset: 1, limit: 1 });
assert.equal(page.elements.length, 1);
assert.equal(page.nextOffset, 2);
assert.equal(handleAgentCanvasCommand('read', { ids: [] }).count, window.excalidrawAPI.getSceneElements().length, 'an empty optional ids filter must read the whole canvas');
addCanvasElements([{ id: 'center-title', type: 'text', x: 500, y: 20, text: '标题', textAlign: 'center' }]);
updateCanvasElements([{ id: 'center-title', x: 746, textAlign: 'center' }]);
assert.equal(get('center-title').x, 746, 'updating centered text must retain the requested scene x');
addCanvasElements([
  { id: 'auto-a', type: 'rectangle', x: 0, y: 400, label: { text: '自动尺寸' } },
  { id: 'auto-b', type: 'ellipse', x: 400, y: 400, label: { text: '终点' } },
  { id: 'auto-edge', type: 'arrow', x: 0, y: 0, start: { id: 'auto-a' }, end: { id: 'auto-b' } },
]);
assert.ok(Number.isFinite(get('auto-edge').x));
assert.ok(get('auto-edge').points.every((point) => point.every(Number.isFinite)));
updateCanvasElements([{ id: 'auto-edge', points: [[0, 0], [220, -120]] }]);
assert.equal(get('auto-edge').width, 220);
assert.equal(get('auto-edge').height, 120);
assert.throws(() => addCanvasElements([{ id: 'invalid-font', type: 'text', x: 0, y: 0, text: '字体', fontFamily: 9999 }]), /fontFamily/);
const collision = addCanvasElements([node('b', 1200)]);
assert.notEqual(collision.idMap.b, 'b');
const idleState = window.excalidrawAPI.getAppState;
window.excalidrawAPI.getAppState = () => ({ selectedElementIds: { b: true }, selectedElementsAreBeingDragged: true });
const beforeBusy = structuredClone(scene);
assert.throws(() => updateCanvasElements([{ id: 'b', x: 450 }]), /用户正在/);
assert.deepEqual(scene, beforeBusy);
window.excalidrawAPI.getAppState = idleState;

// Exercise the native drag binding updater, rather than the plugin's programmatic move path.
// Excalidraw next moved binding internals into @excalidraw/element.
const legacyDir = resolve(dirname(require.resolve('@excalidraw/excalidraw')), '../dev');
const findNativeChunk = (dir) => readdirSync(dir).find((file) => file.endsWith('.js') &&
  readFileSync(resolve(dir, file), 'utf8').includes('var updateBoundElements ='));
let nativeDir = legacyDir;
let nativeChunk = findNativeChunk(nativeDir);
const modularBindings = !nativeChunk;
if (modularBindings) {
  const elementEntry = require.resolve('@excalidraw/element', { paths: [dirname(require.resolve('@excalidraw/excalidraw'))] });
  nativeDir = resolve(dirname(elementEntry), '../dev');
  nativeChunk = findNativeChunk(nativeDir);
}
assert.ok(nativeChunk, 'locate the installed native drag binding implementation');
const nativeBundle = await build({ stdin: { contents: `export { updateBoundElements, LinearElementEditor } from ${JSON.stringify(resolve(nativeDir, nativeChunk))};`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty' }, logLevel: 'silent' });
const native = { exports: {} };
new Function('module', 'exports', 'require', nativeBundle.outputFiles[0].text)(native, native.exports, require);
addCanvasElements([
  { id: 'decision', type: 'diamond', x: 420, y: 380, width: 220, height: 120 },
  { id: 'success', type: 'ellipse', x: 730, y: 590, width: 200, height: 80 },
  { id: 'branch', type: 'arrow', x: 0, y: 0, start: { id: 'decision' }, end: { id: 'success' } },
]);
const unsafe = structuredClone(['decision', 'success', 'branch'].map(get));
unsafe[2].startBinding.focus = -11 / 6;
unsafe[2].endBinding.focus = -0.8407079646017681;
const repaired = repairCanvasBindings(unsafe);
assert.equal(unsafe[2].startBinding.focus, -11 / 6, 'repair must leave its input unchanged');
assert.equal(repaired[2].startBinding.focus, 0);
assert.equal(repaired[2].endBinding.focus, 0);
assert.equal(repaired[0], unsafe[0], 'repair must preserve unaffected nodes');
for (const elements of [['decision', 'success', 'branch'].map(get), repaired]) {
  for (const [targetId, endpoint] of [['decision', 0], ['success', 1]]) {
    const map = new Map(structuredClone(elements).map((element) => [element.id, element]));
    const arrow = map.get('branch');
    const before = native.exports.LinearElementEditor.getPointAtIndexGlobalCoordinates(arrow, endpoint, map);
    const target = map.get(targetId);
    target.x += 200;
    const scene = modularBindings ? {
      getNonDeletedElementsMap: () => map,
      getNonDeletedElements: () => [...map.values()],
      getElement: (id) => map.get(id),
      mutateElement: (element, updates) => Object.assign(element, updates),
    } : map;
    native.exports.updateBoundElements(target, scene);
    const after = native.exports.LinearElementEditor.getPointAtIndexGlobalCoordinates(arrow, endpoint, map);
    assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) > 50, `native drag of ${targetId} must move its branch endpoint`);
  }
}

// Exercise the production save function with a controlled pending/failing file write.
const source = ts.createSourceFile('app.tsx', readFileSync('src/lets-excalidraw/app/app.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = source.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations)
  .filter((declaration) => ['setSavingBegin', 'setSavingEnd', 'save'].includes(declaration.name.getText(source)));
const saveCode = ts.transpileModule(declarations.map((declaration) => `const ${declaration.getText(source)};`).join('\n') + '\nreturn save;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let completeWrite;
let failWrite = false;
const events = [];
const saveState = { saving: false, fullSave: false };
document.hasFocus = () => false;
window.excalidrawAPI.setToast = ({ message }) => events.push(message);
const blob = new Blob(['test'], { type: 'image/svg+xml' });
const save = new Function('saveStatus', 'saveTimeout', 'imageURL', 'triggleToast', 'postMessage', 'renderImageContentWithMetadataAndImage', 'renderImageContentWithOnlyMetadata', 'fetch', 'markSaved', saveCode)(
  saveState, 10000, 'assets/excalidraw-test.svg', (event) => events.push(event), () => {}, async () => blob, async () => blob,
  async () => { if (failWrite) return { ok: true, json: async () => ({ code: -1, msg: 'disk full' }) }; await new Promise((resolve) => { completeWrite = resolve; }); return { ok: true, json: async () => ({ code: 0 }) }; }, () => {},
);
const pending = save('save', true);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(saveState.saving, true);
assert.ok(!events.includes('savedone'), 'success must wait for the file write');
completeWrite();
assert.equal((await pending).saved, true, 'agent save must work without iframe focus');
assert.equal(saveState.saving, false);
failWrite = true;
await assert.rejects(save('save', true), /disk full/);
assert.equal(saveState.saving, false, 'a failed write must release the saving lock');
const compact = handleAgentCanvasCommand('read', { limit: 250 });
const full = handleAgentCanvasCommand('read', { limit: 250, detail: 'full' });
assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length * 0.65, 'default reads should omit verbose style and binding fields');
assert.ok('startBinding' in full.elements.find((element) => element.id === 'branch'));
assert.equal(compact.elements.find((element) => element.id === 'branch').startId, 'decision');
const executeDeclaration = source.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations)
  .find((declaration) => declaration.name.getText(source) === 'executeAgentCommand');
const executeCode = ts.transpileModule(`const ${executeDeclaration.getText(source)}; return executeAgentCommand;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let focused = [];
let saves = 0;
window.excalidrawAPI.scrollToContent = (elements) => { focused = elements.map((element) => element.id); };
handleAgentCanvasCommand('viewport', { canvasId: compact.canvasId, ids: [] });
assert.equal(focused.length, window.excalidrawAPI.getSceneElements().length);
const execute = new Function('handleAgentCanvasCommand', 'save', 'imageURL', executeCode)(handleAgentCanvasCommand, async () => { saves++; return { saved: true }; }, compact.canvasId);
const fast = await execute('add', { canvasId: compact.canvasId, elements: [node('fast', 1600)] });
assert.equal(fast.saved, true);
assert.equal(saves, 1, 'one draw command must save exactly once');
assert.ok(fast.elements.some((element) => element.id === 'fast'));
assert.deepEqual(focused, ['fast']);
await execute('add', { canvasId: compact.canvasId, elements: [node('intermediate', 1900)], finalize: false });
assert.equal(saves, 1, 'intermediate batches must not save');
const noChange = await execute('update', { canvasId: compact.canvasId, elements: [{ id: 'fast', x: get('fast').x }], finalize: true });
assert.deepEqual(noChange.elements, [], 'no-op updates must not return the entire drawing');
const failExecute = new Function('handleAgentCanvasCommand', 'save', 'imageURL', executeCode)(handleAgentCanvasCommand, async () => { throw new Error('disk full'); }, compact.canvasId);
const failedDraw = await failExecute('add', { canvasId: compact.canvasId, elements: [node('save-retry', 2200)] });
assert.equal(failedDraw.saved, false);
assert.match(failedDraw.error, /disk full/);
assert.ok(failedDraw.created.includes('save-retry'), 'save failures must retain IDs of already created elements');
console.log('Canvas and save regression checks passed.');
