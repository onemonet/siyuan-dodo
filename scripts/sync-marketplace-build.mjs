/**
 * Install a verified marketplace/test build into a separate SiYuan workspace.
 * Never touch the normal full-build plugin directory or the user's AV data.
 * Usage: node scripts/sync-marketplace-build.mjs --target D:/SiYuanNote/data/plugins/siyuan-dodo
 */
import {
  cpSync, existsSync, lstatSync, mkdtempSync, readFileSync,
  readdirSync, renameSync, rmSync, statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist-marketplace");
const targetArg = process.argv[process.argv.indexOf("--target") + 1];
if (!process.argv.includes("--target") || !targetArg || targetArg.startsWith("--")) {
  throw new Error("明确指定集市测试插件目录: --target D:/SiYuanNote/data/plugins/siyuan-dodo");
}
const target = resolve(targetArg);
const pluginName = "siyuan-dodo";
const pluginsDir = dirname(target);
const dataDir = dirname(pluginsDir);

function safeDir(folder, label) {
  if (!existsSync(folder) || !lstatSync(folder).isDirectory() ||
      lstatSync(folder).isSymbolicLink()) {
    throw new Error(label + " 必须是已有实体目录：" + folder);
  }
}
function listedFiles(folder) {
  const names = [];
  function visit(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("不允许复制符号链接：" + entry.name);
      if (entry.isDirectory()) visit(join(dir, entry.name), prefix + entry.name + "/");
      else if (entry.isFile()) names.push(prefix + entry.name);
      else throw new Error("不支持的插件文件类型：" + entry.name);
    }
  }
  visit(folder);
  return names.sort();
}
function fileSha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
if (basename(target) !== pluginName ||
    basename(pluginsDir).toLowerCase() !== "plugins" ||
    basename(dataDir).toLowerCase() !== "data") {
  throw new Error("仅允许部署到指定思源工作空间 data/plugins/siyuan-dodo 目录");
}
safeDir(source, "集市版构建输出");
safeDir(pluginsDir, "思源插件根目录");
safeDir(dataDir, "思源数据目录");
if (source === target || target.startsWith(source + "/") || source.startsWith(target + "/")) {
  throw new Error("构建源与插件安装目录重叠");
}
const metadata = JSON.parse(readFileSync(join(source, "plugin.json"), "utf8"));
if (metadata.name !== pluginName) throw new Error("目标插件名不匹配");
const sourceFiles = listedFiles(source);
for (const required of ["plugin.json", "index.js", "index.css", "README.md", "icon.png", "preview.png"]) {
  if (!sourceFiles.includes(required)) throw new Error("集市构建缺少必需文件：" + required);
}
if (sourceFiles.some(name => name.startsWith("excalidraw/") ||
    name.startsWith("skills/dodo-toolbox-excalidraw/"))) {
  throw new Error("集市构建包含未发布的 Excalidraw 资源，拒绝安装");
}
const bundle = readFileSync(join(source, "index.js"), "utf8");
for (const excluded of ["home", "excalidraw", "notion-share"]) {
  if (bundle.includes("./lets-" + excluded + "/index.ts")) {
    throw new Error("集市版仍注册未发布模块：" + excluded);
  }
}
if (existsSync(target)) {
  safeDir(target, "已安装插件目录");
  const current = readdirSync(target);
  if (current.length) {
    const oldMetaPath = join(target, "plugin.json");
    if (!existsSync(oldMetaPath) ||
        JSON.parse(readFileSync(oldMetaPath, "utf8")).name !== pluginName) {
      throw new Error("已有安装目录非 siyuan-dodo 插件，拒绝替换");
    }
  }
}

const stage = mkdtempSync(join(dataDir, ".siyuan-dodo-marketplace-stage-"));
const backup = join(dataDir, ".siyuan-dodo-marketplace-previous-" + process.pid + "-" + Date.now());
let renamedPrevious = false;
let deployed = false;
let verified = false;
try {
  cpSync(source, stage, { recursive: true, force: true });
  const staged = listedFiles(stage);
  if (staged.length !== sourceFiles.length ||
      staged.some((name, i) => name !== sourceFiles[i])) {
    throw new Error("预部署文件列表不完整");
  }
  for (const name of sourceFiles) {
    if (statSync(join(stage, name)).size !== statSync(join(source, name)).size) {
      throw new Error("构建文件复制不完整：" + name);
    }
  }
  if (existsSync(target)) {
    renameSync(target, backup);
    renamedPrevious = true;
  }
  try {
    renameSync(stage, target);
    deployed = true;
  } catch (error) {
    if (renamedPrevious) {
      renameSync(backup, target);
      renamedPrevious = false;
    }
    throw error;
  }
  for (const required of ["index.js", "index.css", "plugin.json"]) {
    if (fileSha(join(source, required)) !== fileSha(join(target, required))) {
      throw new Error("安装校验失败：" + required);
    }
  }
  verified = true;
  console.log("[集市测试版已部署]", target);
  console.log("[构建信息] 版本", metadata.version, "文件", sourceFiles.length,
    "JS SHA256", fileSha(join(target, "index.js")));
} finally {
  if (!deployed && existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  if (deployed && !verified && renamedPrevious && existsSync(backup)) {
    // A failed verification must not destroy the last usable installation.
    rmSync(target, { recursive: true, force: true });
    renameSync(backup, target);
    renamedPrevious = false;
  }
  if (verified && renamedPrevious && existsSync(backup)) {
    rmSync(backup, { recursive: true, force: true });
  }
}