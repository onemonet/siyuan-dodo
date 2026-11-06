import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIST = resolve(projectRoot, "dist");
const generatedHashAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/i;

function safeDirectory(path, label) {
  if (!existsSync(path)) throw new Error(label + " 不存在: " + path);
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    throw new Error(label + " 必须是实际目录（不能是符号链接）: " + path);
  }
}
function readPluginName(directory) {
  const path = join(directory, "plugin.json");
  if (!existsSync(path)) throw new Error("缺少 plugin.json: " + path);
  const name = JSON.parse(readFileSync(path, "utf8")).name;
  if (!name || !/^[a-z0-9-]+$/i.test(name)) throw new Error("无效的插件名称: " + name);
  return name;
}
function buildFileList(root) {
  const result = [];
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error("拒绝处理符号链接: " + file);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) result.push(relative(root, file));
      else throw new Error("无法处理特殊文件: " + file);
    }
  };
  visit(root);
  return result;
}

export function syncBuiltPlugin({
  sourceDir = DEFAULT_DIST, targetDir, dryRun = false,
} = {}) {
  sourceDir = resolve(sourceDir);
  if (!targetDir) throw new Error("需要明确插件安装路径 --target <path>");
  targetDir = resolve(targetDir);
  safeDirectory(sourceDir, "构建输出目录");
  const name = readPluginName(sourceDir);
  // Allow only the exact SiYuan plugin directory under data/plugins.
  const parent = dirname(targetDir);
  if (relative(parent, targetDir) !== name ||
      dirname(parent).split(/[\\/]/).at(-1)?.toLowerCase() !== "data" ||
      parent.split(/[\\/]/).at(-1)?.toLowerCase() !== "plugins") {
    throw new Error("拒绝部署到非思源 data/plugins/" + name + " 目录: " + targetDir);
  }
  if (targetDir === sourceDir || sourceDir.startsWith(targetDir + sep) ||
      targetDir.startsWith(sourceDir + sep)) {
    throw new Error("构建目录与安装目录不能包含或重叠");
  }
  if (existsSync(targetDir)) {
    safeDirectory(targetDir, "安装插件目录");
    if (readPluginName(targetDir) !== name) throw new Error("安装插件名称不匹配");
  } else {
    safeDirectory(parent, "思源插件父目录");
  }
  const sourceExc = join(sourceDir, "excalidraw");
  const installedExc = join(targetDir, "excalidraw");
  safeDirectory(sourceExc, "Excalidraw 构建目录");
  safeDirectory(join(sourceExc, "assets"), "Excalidraw 构建资源目录");
  for (const page of ["app/index.html", "embed/siyuan/index.html", "embed/markdown/index.html"]) {
    if (!existsSync(join(sourceExc, page))) throw new Error("缺少构建入口: " + page);
  }
  const sourceAssets = buildFileList(join(sourceExc, "assets"));
  if (!sourceAssets.some(path => /^app-[\w-]+\.js$/i.test(path))) {
    throw new Error("没有发现 Excalidraw 主程序资源，拒绝清理旧文件");
  }
  const valid = new Set(sourceAssets.map(item => item.toLowerCase()));
  let stale = [];
  if (existsSync(installedExc)) {
    safeDirectory(installedExc, "已安装 Excalidraw 目录");
    const assetDir = join(installedExc, "assets");
    if (existsSync(assetDir)) {
      safeDirectory(assetDir, "已安装 Excalidraw 资源目录");
      stale = buildFileList(assetDir)
        .filter(path => !valid.has(path.toLowerCase()))
        // Never delete handwritten static files or user content.
        .filter(path => generatedHashAsset.test(path));
    }
  }
  const bytes = stale.reduce((sum, file) => sum + statSync(join(installedExc, "assets", file)).size, 0);
  if (dryRun) {
    console.log("[部署预检] 目标:", targetDir);
    console.log("[部署预检] 当前最新资源:", sourceAssets.length, "旧构建资源:", stale.length,
      "可清理 MiB:", (bytes / 1048576).toFixed(2));
    return { copied: 0, removed: 0, freedBytes: 0, eligible: stale.length, eligibleBytes: bytes };
  }

  // Copy and validate the NEW build before any deletion. Failed builds never
  // get here because the command is chained after a successful pnpm build.
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true, force: true, dereference: false });
  const installed = join(targetDir, "excalidraw");
  for (const path of sourceAssets) {
    const output = join(installed, "assets", path);
    const input = join(sourceExc, "assets", path);
    if (!existsSync(output) || statSync(output).size !== statSync(input).size) {
      throw new Error("复制校验未通过，保留旧文件: " + path);
    }
  }
  for (const page of ["app/index.html", "embed/siyuan/index.html"]) {
    if (readFileSync(join(installed, page), "utf8") !== readFileSync(join(sourceExc, page), "utf8")) {
      throw new Error("HTML 入口校验失败，保留旧文件: " + page);
    }
  }

  for (const path of stale) {
    rmSync(join(installed, "assets", path));
  }
  console.log("[部署完成] 新资源:", sourceAssets.length, "清除旧哈希资源:", stale.length,
    "释放 MiB:", (bytes / 1048576).toFixed(2));
  return { copied: sourceAssets.length, removed: stale.length, freedBytes: bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const next = args.indexOf("--target");
  const envPath = process.env.SIYUAN_PLUGIN_DIR;
  const name = readPluginName(DEFAULT_DIST);
  const defaultParent = resolve(process.env.USERPROFILE || process.env.HOME || "", "SiYuan", "data", "plugins");
  const dest = next >= 0 && args[next + 1] ? args[next + 1]
    : envPath ? (envPath.split(/[\\/]/).at(-1) === name ? envPath : join(envPath, name))
    : join(defaultParent, name);
  try {
    syncBuiltPlugin({ targetDir: dest, dryRun: args.includes("--dry-run") });
  } catch (error) {
    console.error("[部署失败]", error?.message || error);
    process.exitCode = 1;
  }
}
