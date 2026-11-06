import { normalizeToolbarPreferences, toolbarDefaults } from "./toolbar-preferences";

export const defaults = {
  ...toolbarDefaults,
  labelDisplay: "showLabelOnHover",
  embedImageFormat: "svg" as "svg" | "png",
  fullscreenEdit: false,
  editWindow: "dialog",
  themeMode: "themeLight",
  snippets: [] as string[],
  enableAutoSave: true,
  autoSaveInterval: 0,
  fullSaveDelay: 5,
};

export function normalizeConfig(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = { ...defaults, ...normalizeToolbarPreferences(input), snippets: [...defaults.snippets] };
  for (const [key, options] of Object.entries({
    labelDisplay: ["noLabel", "showLabelAlways", "showLabelOnHover"],
    embedImageFormat: ["svg", "png"], editWindow: ["dialog", "tab"],
    themeMode: ["themeLight", "themeDark", "themeOS"],
  })) if (options.includes(input[key] as string)) result[key] = input[key];
  for (const key of ["fullscreenEdit", "enableAutoSave"])
    if (typeof input[key] === "boolean") result[key] = input[key];
  for (const key of ["autoSaveInterval", "fullSaveDelay"]) {
    const value = input[key];
    if ((typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) && Number(value) >= 0)
      result[key] = Number(value);
  }
  if (Array.isArray(input.snippets)) result.snippets = input.snippets.filter((item): item is string => typeof item === "string");
  return result;
}

async function readFile(path: string): Promise<string | null> {
  const response = await fetch("/api/file/getFile", { method: "POST", body: JSON.stringify({ path }) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`读取 ${path} 失败：HTTP ${response.status}`);
  const text = await response.text();
  let result: any;
  try { result = JSON.parse(text); } catch { /* Raw file contents are validated by the caller. */ }
  if (result?.code === 404) return null;
  if (typeof result?.code === "number" && result.code !== 0) {
    throw new Error(`读取 ${path} 失败：${result.msg || result.code}`);
  }
  return text;
}

function validateLibrary(text: string) {
  const data = JSON.parse(text);
  if (data?.type !== "excalidrawlib" || !Array.isArray(data.libraryItems)) throw new Error("旧 Excalidraw 素材库格式无效，未修改源文件。");
}

type SettingsStore = {
  get(space: string): any;
  setBySpace(space: string, key: string, value: unknown): void;
  save(): Promise<void>;
};

export async function migrateExcalidrawData(store: SettingsStore, pluginName: string) {
  const oldRoot = "/data/storage/petal/siyuan-dodo-excalidraw";
  if (!store.get("excalidraw")?.configImported) {
    const text = await readFile(`${oldRoot}/config.json`);
    const old = text === null ? null : JSON.parse(text);
    if (old !== null && (!old || typeof old !== "object" || Array.isArray(old))) throw new Error("旧 Excalidraw 配置格式无效。");
    const config = normalizeConfig(old ?? store.get("excalidraw"));
    for (const [key, value] of Object.entries(config)) store.setBySpace("excalidraw", key, value);
    store.setBySpace("excalidraw", "configImported", true);
    try { await store.save(); }
    catch (error) { store.setBySpace("excalidraw", "configImported", false); throw error; }
  }
  if (!store.get("excalidraw")?.libraryImported) {
    const target = `/data/storage/petal/${pluginName}/excalidraw-library.excalidrawlib`;
    const existing = await readFile(target);
    if (existing !== null) validateLibrary(existing);
    else {
      const source = await readFile(`${oldRoot}/library.excalidrawlib`);
      if (source !== null) {
        validateLibrary(source);
        const body = new FormData();
        body.append("path", target);
        body.append("isDir", "false");
        body.append("file", new Blob([source], { type: "application/json" }), "library.excalidrawlib");
        const response = await fetch("/api/file/putFile", { method: "POST", body });
        if (!response.ok || (await response.json()).code !== 0) throw new Error("Excalidraw 素材库复制失败，原文件已保留。");
        if (await readFile(target) !== source) throw new Error("Excalidraw 素材库复制校验失败。");
      }
    }
    store.setBySpace("excalidraw", "libraryImported", true);
    try { await store.save(); }
    catch (error) { store.setBySpace("excalidraw", "libraryImported", false); throw error; }
  }
}
