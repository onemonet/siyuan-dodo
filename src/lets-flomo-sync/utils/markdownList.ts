const ORDERED_LIST_REGEX = /^(\d+)\.\s+(.+)$/;
const UNORDERED_LIST_REGEX = /^[-*+]\s+(.+)$/;
const LIST_INDENT_SIZE = 4;

interface ListState {
  counters: number[];
  currentLevel: number;
}

function getIndentLevel(line: string, trimmedLine: string): number {
  return Math.floor((line.length - trimmedLine.length) / LIST_INDENT_SIZE);
}

function syncListLevel(state: ListState, level: number): void {
  if (level > state.currentLevel) {
    state.counters.push(1);
    state.currentLevel = level;
    return;
  }

  if (level < state.currentLevel) {
    state.counters.splice(level);
    state.currentLevel = level;
  }
}

function getNextOrderedCounter(state: ListState, level: number): number {
  const counter = state.counters[level] || 1;
  state.counters[level] = counter + 1;
  return counter;
}

function resetListState(state: ListState): void {
  state.counters = [];
  state.currentLevel = 0;
}

export function fixListHierarchy(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  const state: ListState = {
    counters: [],
    currentLevel: 0,
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    const orderedListMatch = trimmedLine.match(ORDERED_LIST_REGEX);
    if (orderedListMatch) {
      const level = getIndentLevel(line, trimmedLine);
      syncListLevel(state, level);

      const counter = getNextOrderedCounter(state, level);
      const text = orderedListMatch[2];
      result.push(`${"    ".repeat(level)}${counter}. ${text}`);
      continue;
    }

    const unorderedListMatch = trimmedLine.match(UNORDERED_LIST_REGEX);
    if (unorderedListMatch) {
      const level = getIndentLevel(line, trimmedLine);
      syncListLevel(state, level);

      const text = unorderedListMatch[1];
      result.push(`${"    ".repeat(level)}- ${text}`);
      continue;
    }

    if (trimmedLine !== "") {
      resetListState(state);
    }

    result.push(line);
  }

  return result.join("\n");
}
