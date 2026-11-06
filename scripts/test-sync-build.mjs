import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncBuiltPlugin } from './sync-build.mjs';

const temp = mkdtempSync(join(tmpdir(), 'dodo-sync-test-'));
const build = join(temp, 'dist');
const installed = join(temp, 'data', 'plugins', 'siyuan-dodo');
function file(name, value) {
  const path = join(name.startsWith('dist/') ? temp : installed, name.startsWith('dist/') ? name : name);
  mkdirSync(join(path, '..'), {recursive: true});
  writeFileSync(path, value);
}
try {
  const src = join(build, 'excalidraw');
  const out = join(installed, 'excalidraw');
  mkdirSync(join(src, 'assets'), {recursive: true});
  mkdirSync(join(out, 'assets'), {recursive: true});
  file('dist/plugin.json', JSON.stringify({name:'siyuan-dodo'}));
  file('plugin.json', JSON.stringify({name:'siyuan-dodo'}));
  file('dist/index.js', 'new-plugin');
  file('index.js', 'old-plugin');
  for (const entry of ['app/index.html', 'embed/siyuan/index.html', 'embed/markdown/index.html']) {
    file('dist/excalidraw/' + entry, entry);
  }
  file('dist/excalidraw/assets/app-CURRENT123.js', 'new-bundle');
  file('excalidraw/assets/app-OLDHASH001.js', 'old-bundle');
  file('excalidraw/assets/app-OLDHASH002.css', 'old-css');
  file('excalidraw/assets/my-extra-file.txt', 'preserve unknown');
  file('settings.json', 'user config');
  const estimate = syncBuiltPlugin({sourceDir: build, targetDir: installed, dryRun:true});
  assert.equal(estimate.eligible, 2);
  assert.equal(existsSync(join(out,'assets','app-OLDHASH001.js')),true);
  const first = syncBuiltPlugin({sourceDir: build, targetDir: installed});
  assert.equal(first.removed,2);
  assert.equal(readFileSync(join(installed,'index.js'),'utf8'),'new-plugin');
  assert.equal(readFileSync(join(out,'assets','app-CURRENT123.js'),'utf8'),'new-bundle');
  assert.equal(readFileSync(join(out,'assets','my-extra-file.txt'),'utf8'),'preserve unknown');
  assert.equal(readFileSync(join(installed,'settings.json'),'utf8'),'user config');
  assert.equal(existsSync(join(out,'assets','app-OLDHASH002.css')),false);
  const second = syncBuiltPlugin({sourceDir: build, targetDir: installed});
  assert.equal(second.removed,0);
  assert.throws(() => syncBuiltPlugin({sourceDir: build, targetDir: join(temp,'invalid')}));
  rmSync(join(build,'excalidraw','app','index.html'));
  assert.throws(() => syncBuiltPlugin({sourceDir: build,targetDir:installed}));
  assert.equal(existsSync(join(out,'assets','app-CURRENT123.js')),true);
  console.log('PASS: dry-run, post-copy stale cleanup, preserved user files, repeat idempotence, unsafe-target guards, invalid-build no deletion');
} finally {
  rmSync(temp, {recursive:true,force:true});
}
