export interface SymbolReplacementRule {
  trigger: string;
  replacement: string;
}

export const SYMBOL_REPLACE_PLUGIN_NAME = "symbolReplace";
export const RULES_SETTING_KEY = "rulesText";
export const SKIP_CODE_SETTING_KEY = "skipCode";
export const DEFAULT_SYMBOL_REPLACE_RULES_TEXT = ["-> | →", "-》 | →"].join("\n");

export function parseSymbolReplacementRules(text: unknown): SymbolReplacementRule[] {
  if (typeof text !== "string") {
    return [];
  }

  const seenTriggers = new Set<string>();
  const rules: SymbolReplacementRule[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const parts = splitRuleLine(line);
    if (!parts) {
      continue;
    }

    const trigger = parts[0].trim();
    const replacement = parts[1].trim();
    if (!trigger || !replacement || seenTriggers.has(trigger)) {
      continue;
    }

    seenTriggers.add(trigger);
    rules.push({ trigger, replacement });
  }

  return rules.sort((left, right) => right.trigger.length - left.trigger.length);
}

export function findSymbolReplacement(
  textBeforeCaret: string,
  rules: SymbolReplacementRule[],
): SymbolReplacementRule | null {
  return rules.find((rule) => textBeforeCaret.endsWith(rule.trigger)) ?? null;
}

/** 优先使用 | 分隔；保留 => 和 Tab 作为旧设置的兼容输入。 */
function splitRuleLine(line: string): [string, string] | null {
  const separator = line.indexOf("|");
  if (separator >= 0) {
    return [line.slice(0, separator), line.slice(separator + 1)];
  }

  const tabIndex = line.indexOf("\t");
  if (tabIndex >= 0) {
    return [line.slice(0, tabIndex), line.slice(tabIndex + 1)];
  }

  const legacyIndex = line.indexOf("=>");
  if (legacyIndex >= 0) {
    return [line.slice(0, legacyIndex), line.slice(legacyIndex + 2)];
  }

  return null;
}

/** 将已保存的旧版规则升级成 | 分隔，不改动注释、空行和已有的新格式规则。 */
export function normalizeSymbolReplacementRulesText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.split(/\r?\n/).map(raw => {
    if (!raw.trim() || raw.trimStart().startsWith("#") || raw.includes("|")) return raw;
    const tab = raw.indexOf("\t");
    const arrow = raw.indexOf("=>");
    if (tab < 0 && arrow < 0) return raw;
    const start = tab >= 0 && (arrow < 0 || tab < arrow) ? tab : arrow;
    const width = start === tab ? 1 : 2;
    const trigger = raw.slice(0, start).trim();
    const replacement = raw.slice(start + width).trim();
    if (!trigger || !replacement) return raw;
    return `${trigger} | ${replacement}`;
  }).join("\n");
}