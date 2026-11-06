// Synthetic sixty-block capture test: fake rasterizer isolates cache costs
// from machine-specific GPU/font/Protyle timing. No user data is touched.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('tmp/excalidraw-validation/snapshot-benchmark.mjs');
await build({
  entryPoints: ['src/lets-excalidraw/app/utils/iframeCapture.ts'],
  outfile: output, format: 'esm', platform: 'node', bundle: true,
  plugins: [{
    name: 'mock-snapshot-renderer',
    setup(builder) {
      builder.onResolve({ filter: /^@zumer\/snapdom$/ }, () => ({
        path: 'snapdom', namespace: 'snapshot-fixture',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'snapshot-fixture' }, () => ({
        contents: "export const snapdom = {toPng: async () => {globalThis.__snapshotCalls++; await new Promise(resolve => setTimeout(resolve, 3)); return {src:'data:image/png;base64,aGVsbG8='};}};",
        loader: 'js',
      }));
    },
  }],
});
globalThis.window = { setTimeout };
globalThis.location = { href: 'http://localhost/plugins/siyuan-dodo/excalidraw/app/' };
const iframe = {
  clientWidth: 450, clientHeight: 270,
  contentDocument: { querySelector() { return {}; }, body: {} },
};
globalThis.document = { querySelector() { return iframe; } };
globalThis.__snapshotCalls = 0;

const { captureAllIframes, getSnapshotCaptureStats } = await import(pathToFileURL(output).href);
const blockId = index => '2026103112' + String(index).padStart(4, '0') + '-abcdefg';
const elements = Array.from({length: 60}, (_, index) => ({
  id: 'siyuan-' + index, type: 'embeddable',
  link: 'siyuan://blocks/' + blockId(index),
  width: 450, height: 270,
  customData: { embedSiyuan: { blockId: blockId(index), contentHash: 'hash-' + index } },
}));
const run = async (name, current, previous, expectedCaptured) => {
  const started = performance.now();
  const result = await captureAllIframes(current, previous);
  const stats = getSnapshotCaptureStats();
  const elapsed = (performance.now() - started).toFixed(1);
  assert.equal(stats.total, 60, name);
  assert.equal(stats.captured, expectedCaptured, name);
  assert.equal(stats.reused, 60 - expectedCaptured, name);
  console.log(name, 'elapsedMs=' + elapsed,
    'captured=' + stats.captured, 'reused=' + stats.reused, 'rendererCalls=' + globalThis.__snapshotCalls);
  return result;
};
let cache = await run('COLD_60', elements, new Map(), 60);
cache = await run('UNCHANGED_60', elements, cache, 0);
const move = elements.map((item, index) => index === 10
  ? {...item, x: 4444, y: 333, backgroundColor: '#ffeeaa'} : item);
cache = await run('MOVE_COLOR_ONLY', move, cache, 0);
const edit = move.map((item, index) => index === 20
  ? {...item, customData:{embedSiyuan:{...item.customData.embedSiyuan,contentHash:'updated'}}}
  : item);
cache = await run('ONE_BLOCK_CONTENT_UPDATED', edit, cache, 1);
const resize = edit.map((item, index) => index === 30 ? {...item, width: 460} : item);
cache = await run('ONE_BLOCK_RESIZED', resize, cache, 1);
const link = resize.map((item, index) => index === 40
  ? {...item, link:'siyuan://blocks/20261031129999-abcdefg'} : item);
cache = await run('ONE_BLOCK_LINK_CHANGED', link, cache, 1);
const nonce = link.map((item, index) => index === 50
  ? {...item, customData:{...item.customData,embedIframeVersionNonce:173}} : item);
cache = await run('ONE_BLOCK_REFRESHED', nonce, cache, 1);
assert.equal(globalThis.__snapshotCalls, 64);
console.log('PASS: sixty-block warm-cache reuse, scene-only edits, source change invalidation');
