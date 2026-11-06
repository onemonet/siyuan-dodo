import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

// Verify the actual browser module graph, not every leftover file in dist
// (Vite deliberately keeps other generated assets when emptyOutDir=false).
const root = resolve("dist/preview/timeline");
const start = resolve(root, "iframe/main.js");
const checked = new Set();
const misses = [];
function inspect(file) {
  if (checked.has(file)) return;
  assert.ok(existsSync(file), `Missing timeline iframe entry: ${file}`);
  checked.add(file);
  const source = readFileSync(file, "utf8");
  const imports = /(?:from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)/g;
  for (const match of source.matchAll(imports)) {
    const dependency = resolve(dirname(file), match[1]);
    if (!existsSync(dependency)) misses.push(`${relative(root, file)} -> ${match[1]}`);
    else inspect(dependency);
  }
}
inspect(start);
assert.deepEqual(misses, [], `Unresolvable browser imports: ${misses.join(", ")}`);
const entry = readFileSync(start, "utf8");
assert.match(entry, /function resolveFieldBinding/,
  "Field binding must be bundled into the actual iframe entry");
assert.match(entry, /function renderAttributeView/,
  "Shared kernel reads must be bundled without source-path rewrites");
const page = readFileSync(resolve(root, "iframe/index.html"), "utf8");
assert.match(page, /window\.setTimeout/);
assert.match(page, /loading\.hidden = true/);
assert.match(page, /重试加载/);
assert.match(page, /<script type="module" src="\.\/main\.js(?:\?v=[^"]+)?"><\/script>/);
assert.match(readFileSync("vite.config.ts", "utf8"), /relativePath === "services\/converter-service\.ts"/,
  "Host-only timeline controller must not be newly emitted into the iframe bundle");
console.log(`PASS: timeline browser dependency graph (${checked.size} modules), fixed binding path, error timeout and retry`);
