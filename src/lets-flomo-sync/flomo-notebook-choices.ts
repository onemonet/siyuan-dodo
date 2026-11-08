/** Presentation-only notebook choices; persisted value stays the original SiYuan notebook ID. */
export interface FlomoNotebookChoice {
  id: string;
  name: string;
  icon?: string;
  closed?: boolean;
}

export interface FlomoNotebookChoices {
  options: Record<string, string>;
  notice: string;
}

function notebookEmoji(icon: string | undefined): string {
  const raw = typeof icon === "string" ? icon.trim() : "";
  if (/^[0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,7}$/i.test(raw)) {
    const codes = raw.split("-").map(code => Number.parseInt(code, 16));
    if (codes.every(code => code > 0 && code <= 0x10ffff &&
      (code < 0xd800 || code > 0xdfff))) {
      return String.fromCodePoint(...codes);
    }
  }
  // Native <select> options cannot display image-based SiYuan custom SVG icons.
  if (raw && raw.length <= 16 && !/[/<>]/.test(raw) && /[^\x00-\x7f]/.test(raw)) {
    return raw;
  }
  return "📓";
}

/** Keep the selected closed/missing notebook visible instead of changing saved data. */
export function buildFlomoNotebookChoices(
  notebooks: readonly FlomoNotebookChoice[],
  selectedId: string,
): FlomoNotebookChoices {
  const options: Record<string, string> = { "": "请选择笔记本" };
  const validIds = new Set<string>();
  let current: FlomoNotebookChoice | undefined;
  for (const notebook of notebooks) {
    if (!notebook || typeof notebook.id !== "string" || !notebook.id ||
        validIds.has(notebook.id)) continue;
    validIds.add(notebook.id);
    if (notebook.id === selectedId) current = notebook;
    if (notebook.closed && notebook.id !== selectedId) continue;
    const name = notebook.name?.trim() || "未命名笔记本";
    const closed = notebook.closed ? "（已关闭）" : "";
    options[notebook.id] = notebookEmoji(notebook.icon) + " " + name + closed;
  }
  let notice = "";
  if (selectedId && !current) {
    options[selectedId] = "原笔记本已不存在";
    notice = "原笔记本已不存在，请选择其他笔记本。";
  } else if (current?.closed) {
    notice = "当前笔记本已关闭，请打开或选择其他笔记本。";
  }
  if (notebooks.length === 0 && !selectedId) {
    options[""] = "暂无可用笔记本";
  } else if (Object.keys(options).length === 1 && !selectedId) {
    options[""] = "暂无已打开的笔记本";
  }
  return { options, notice };
}

/** Preserve a saved ID while notebook enumeration is pending or unavailable. */
export function pendingFlomoNotebookChoices(
  selectedId: string,
  state: "loading" | "error",
): FlomoNotebookChoices {
  const options: Record<string, string> = {
    "": state === "loading" ? "正在加载笔记本…" : "笔记本列表不可用",
  };
  if (selectedId) {
    options[selectedId] = state === "loading"
      ? "正在查找已保存的笔记本…"
      : "已保存的笔记本（暂时无法读取名称）";
  }
  return {
    options,
    notice: state === "error" ? "获取笔记本失败，请重新打开设置后重试。" : "",
  };
}