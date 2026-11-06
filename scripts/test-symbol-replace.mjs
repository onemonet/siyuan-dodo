import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

const output = resolve("scripts/.symbol-replace-rules-test.cjs");
const source = await readFile(resolve("src/lets-symbol-replace/rules.ts"), "utf8");
await writeFile(output, ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText);
try {
  const { parseSymbolReplacementRules, findSymbolReplacement, normalizeSymbolReplacementRulesText, DEFAULT_SYMBOL_REPLACE_RULES_TEXT } = createRequire(import.meta.url)(output);
  assert.equal(DEFAULT_SYMBOL_REPLACE_RULES_TEXT, "-> | →\n-》 | →");
  const input = ["# ignore", "", "-> | →", "=> | ⇒", "-> | duplicate", "a | left|right", "---> | ⟶", "invalid", " | invalid", "empty | "].join("\n");
  const rules = parseSymbolReplacementRules(input);
  assert.equal(rules.length, 4);
  assert.equal(rules.find(rule => rule.trigger === "a")?.replacement, "left|right");
  assert.equal(findSymbolReplacement("Hello --->", rules)?.replacement, "⟶");
  assert.equal(findSymbolReplacement("Hello ->", rules)?.replacement, "→");
  assert.equal(findSymbolReplacement("=>", rules)?.replacement, "⇒");
  assert.equal(findSymbolReplacement("no-match", rules), null);
  console.log("PASS: | delimiter, replacement with embedded |, trigger =>, comment/blank, duplicate and longest match");

  const legacy = "# leave comment\n-> => →\n-》 => →\n\t\nfoo\tbar\n";
  const migrated = normalizeSymbolReplacementRulesText(legacy);
  assert.equal(migrated, "# leave comment\n-> | →\n-》 | →\n\t\nfoo | bar\n");
  assert.equal(normalizeSymbolReplacementRulesText(migrated), migrated);
  assert.equal(normalizeSymbolReplacementRulesText(22), null);
  assert.deepEqual(parseSymbolReplacementRules(legacy), parseSymbolReplacementRules(migrated));
  console.log("PASS: legacy => and Tab migration is idempotent and preserves old rule behavior");
} finally {
  await rm(output, { force: true });
}
