import { resolve, join } from "node:path";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const assetPath = (path: string) => resolve(__dirname, path).replace(/\\/g, "/");
const watching = process.argv.includes("--watch");
const output = watching
  ? resolve(process.env.SIYUAN_PLUGIN_DIR || resolve(
      process.env.USERPROFILE || process.env.HOME || ".",
      "SiYuan", "data", "plugins", "siyuan-dodo",
    ))
  : "dist";

// In Vite --watch mode the initial emptyOutDir cleans old assets, but
// incremental builds can write new content-hashed names without removing the
// previous files. Prune obsolete generated .js/.css files after each
// *successful* compilation, never on buildStart or during a failed build.
const pruneOldWatchChunks = () => ({
  name: "prune-excalidraw-watch-chunks",
  apply: "build" as const,
  writeBundle(_options: unknown, bundle: Record<string, unknown>) {
    if (!watching) return;
    const current = new Set(Object.keys(bundle).map(path => path.replace(/\\/g, "/")));
    if (![...current].some(path => /^assets\/app-[\w-]+\.js$/.test(path))) return;
    const assets = resolve(__dirname, output, "excalidraw", "assets");
    if (!existsSync(assets)) return;
    let removed = 0;
    for (const entry of readdirSync(assets, { withFileTypes: true })) {
      if (!entry.isFile() || !/-[\w-]{8,}\.(?:js|css)$/i.test(entry.name)) continue;
      if (current.has("assets/" + entry.name)) continue;
      rmSync(join(assets, entry.name));
      removed++;
    }
    if (removed) console.log("[Excalidraw watch] pruned", removed, "stale hashed chunks");
  },
});


export default defineConfig({
  root: resolve(__dirname, "src/lets-excalidraw"),
  base: "./",
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  esbuild: { jsx: "automatic" },
  plugins: [pruneOldWatchChunks(), viteStaticCopy({ targets: [
    { src: assetPath("node_modules/@excalidraw/excalidraw/dist/prod/fonts"), dest: "app" },
    { src: assetPath("node_modules/vditor/dist"), dest: "embed/markdown/vditor" },
    { src: assetPath("src/lets-excalidraw/licenses/*"), dest: "licenses" },
  ] })],
  build: {
    outDir: resolve(__dirname, output, "excalidraw"),
    emptyOutDir: true,
    rollupOptions: { input: {
      app: resolve(__dirname, "src/lets-excalidraw/app/index.html"),
      markdown: resolve(__dirname, "src/lets-excalidraw/embed/markdown/index.html"),
      siyuan: resolve(__dirname, "src/lets-excalidraw/embed/siyuan/index.html"),
    } },
  },
});
