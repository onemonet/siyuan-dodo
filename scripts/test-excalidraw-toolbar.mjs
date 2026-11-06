import assert from 'node:assert/strict';
import { build } from 'esbuild';
const load = async path => {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const { MAX_PINNED_TOOLS, normalizeToolbarPreferences, toolbarPatch } = await load('src/lets-excalidraw/toolbar-preferences.ts');
const { partitionTools, placeToolbar } = await load('src/lets-excalidraw/app/toolbar/model.ts');
const preferences = normalizeToolbarPreferences({ toolbarPinnedIds: ['future-tool', 'a', 'a'], toolbarPosition: { left: Infinity, top: 20 }, interactionEnabled: { valid: false, invalid: 1 } });
assert.deepEqual(preferences.toolbarPinnedIds, ['future-tool', 'a']);
assert.equal(MAX_PINNED_TOOLS, 30);
const thirtyOne = Array.from({length:31}, (_,index) => 'tool-' + index);
const savedThirty = normalizeToolbarPreferences({toolbarPinnedIds:thirtyOne});
assert.equal(savedThirty.toolbarPinnedIds.length, 30);
assert.deepEqual(savedThirty.toolbarPinnedIds, thirtyOne.slice(0,30));
assert.equal(toolbarPatch({toolbarPinnedIds:thirtyOne}).toolbarPinnedIds.length, 30);

assert.equal(preferences.toolbarPosition, null);
assert.deepEqual(preferences.interactionEnabled, { valid: false });
assert.deepEqual(toolbarPatch({ enabled: false, snippets: ['bad'], toolbarEnabled: false }), { toolbarEnabled: false });
assert.throws(() => toolbarPatch([]));
const context = { elements: [{ id: 'selected' }], api: {}, appState: {} };
const tools = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'hidden', when: () => false }, { id: 'empty-group', items: [{ when: () => false }] }];
const partition = partitionTools(tools, context, ['future-tool', 'b']);
assert.deepEqual(partition.pinned.map(tool => tool.id), ['b']);
assert.deepEqual(partition.more.map(tool => tool.id), ['a']);
const viewport = { width: 400, height: 300 }, size = { width: 120, height: 36 };
const follow = normalizeToolbarPreferences({});
assert.deepEqual(placeToolbar({ left: 100, right: 200, top: 100, bottom: 150 }, size, viewport, follow), { left: 90, top: 8 });
assert.equal(placeToolbar({ left: 0, right: 20, top: 5, bottom: 40 }, size, viewport, follow).top, 96);
assert.deepEqual(placeToolbar(null, size, viewport, { ...follow, toolbarMode: 'fixed', toolbarPosition: { left: 900, top: 700 } }), { left: 272, top: 256 });
assert.equal(placeToolbar(null, { width: 1000, height: 600 }, viewport, follow).left, 8);
// Rotation-handle clearance: when above the selection, toolbar bottom is 56px clear.
const positioned = placeToolbar({left: 200,right: 400,top: 250,bottom: 350}, size, {width:900,height:700}, follow);
assert.ok(positioned.top + size.height <= 250 - 55, positioned);
console.log('PASS: toolbar tool filtering, pin order, preference validation, positioning and edge clamping');

