import { readFileSync } from "fs";
import { createHash } from "crypto";
import { relative, resolve } from "path";
import { defineConfig, transformWithEsbuild } from "vite";
import minimist from "minimist";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import zipPack from "vite-plugin-zip-pack";
import fg from "fast-glob";
import { build as esbuildBundle } from "esbuild";

const args = minimist(process.argv.slice(2));
const isWatch = args.watch || args.w || false;
// const devDistDir = "./dev"
const devDistDir = resolve(process.env.SIYUAN_PLUGIN_DIR || resolve(process.env.USERPROFILE || process.env.HOME || ".", "SiYuan", "data", "plugins", "siyuan-dodo"));
const isMarketplace = process.env.DODO_BUILD_TARGET === "marketplace";
const distDir = isWatch ? devDistDir : isMarketplace ? "./dist-marketplace" : "./dist";
const excalidrawBuildPage = resolve(__dirname, distDir, "excalidraw/app/index.html");
const excalidrawBuildId = isMarketplace
  ? "not-in-marketplace"
  : createHash("sha256").update(readFileSync(excalidrawBuildPage)).digest("hex").slice(0, 12);
const timelinePreviewRoot = resolve(__dirname, "src/lets-custom-block/timeline");
const timelinePreviewPatterns = [
  "src/lets-custom-block/timeline/types.ts",
  "src/lets-custom-block/timeline/services/**/*",
  "src/lets-custom-block/timeline/iframe/**/*",
];
const galleryPreviewRoot = resolve(__dirname, "src/lets-custom-block/gallery");
const galleryPreviewPatterns = ["src/lets-custom-block/gallery/iframe/**/*"];
const galleryMuuriPath = resolve(__dirname, "node_modules/muuri/dist/muuri.min.js");

console.log("isWatch=>", isWatch);
console.log("distDir=>", distDir);

function emitTimelinePreviewAssets() {
  return {
    name: "emit-timeline-preview-assets",
    async buildStart() {
      const files = await fg(timelinePreviewPatterns, { onlyFiles: true });
      for (const file of files) {
        this.addWatchFile(file);
      }
      for (const file of await fg(["src/shared/av/*.ts"])) this.addWatchFile(file);
    },
    async generateBundle() {
      const files = await fg(timelinePreviewPatterns, { onlyFiles: true });

      for (const file of files) {
        const absolutePath = resolve(__dirname, file);
        const relativePath = relative(timelinePreviewRoot, absolutePath).replace(/\\/g, "/");

        // converter-service is the host-side plugin controller: importing it inside
        // the isolated preview would require settings.ts, api.ts and plugin.ts.
        if (!relativePath || relativePath === "index.ts" || relativePath === "plugin.ts" ||
            relativePath === "services/converter-service.ts") {
          continue;
        }

        if (file.endsWith(".ts")) {
          const transformed = await esbuildBundle({
            entryPoints: [absolutePath], bundle: true, platform: "browser",
            format: "esm", target: "es2020", write: false,
          });
          this.emitFile({
            type: "asset",
            fileName: `preview/timeline/${relativePath.replace(/\.ts$/, ".js")}`,
            source: transformed.outputFiles[0].text,
          });
          continue;
        }

        this.emitFile({
          type: "asset",
          fileName: `preview/timeline/${relativePath}`,
          source: readFileSync(absolutePath),
        });
      }

    },
  };
}

function emitGalleryPreviewAssets() {
  return {
    name: "emit-gallery-preview-assets",
    async buildStart() {
      const files = await fg(galleryPreviewPatterns, { onlyFiles: true });
      for (const file of files) {
        this.addWatchFile(file);
      }
      this.addWatchFile(galleryMuuriPath);
    },
    async generateBundle() {
      const files = await fg(galleryPreviewPatterns, { onlyFiles: true });

      for (const file of files) {
        const absolutePath = resolve(__dirname, file);
        const relativePath = relative(galleryPreviewRoot, absolutePath).replace(/\\/g, "/");

        if (file.endsWith(".ts")) {
          const transformed = await transformWithEsbuild(
            readFileSync(absolutePath, "utf8"),
            absolutePath,
            {
              loader: "ts",
              format: "esm",
              target: "es2020",
            },
          );

          this.emitFile({
            type: "asset",
            fileName: `preview/gallery/${relativePath.replace(/\.ts$/, ".js")}`,
            source: transformed.code,
          });
          continue;
        }

        this.emitFile({
          type: "asset",
          fileName: `preview/gallery/${relativePath}`,
          source: readFileSync(absolutePath),
        });
      }

      this.emitFile({
        type: "asset",
        fileName: "preview/gallery/iframe/muuri.min.js",
        source: readFileSync(galleryMuuriPath),
      });
    },
  };
}

function emitMapPreviewAssets() {
  return {
    name: "emit-map-preview-assets",
    async buildStart() {
      const files = await fg(["src/lets-database-view/map/**/*"]);
      for (const file of files) this.addWatchFile(file);
      for (const file of await fg(["src/shared/av/*.ts"])) this.addWatchFile(file);
      this.addWatchFile(resolve(__dirname, 'src/lets-database-view/view-config-schema.ts'));
    },
    async generateBundle() {
      // 不在 generateBundle 内嵌套启动 Vite build：嵌套 build 在 --watch 下会卡住。
      // 地图 iframe 依赖 map-data 和共享的 AV 适配器；均输出到 iframe 同目录，避免未解析的模块导入。
      const mapRoot = resolve(__dirname, "src/lets-database-view/map");
      const mainPath = resolve(mapRoot, "iframe/main.ts");
      const bundled = await esbuildBundle({
        entryPoints: [mainPath], bundle: true, platform: "browser",
        format: "esm", target: "es2020", write: false,
      });
      this.emitFile({ type: "asset", fileName: "preview/map/main.js",
        source: bundled.outputFiles[0].text });
      this.emitFile({
        type: "asset",
        fileName: "preview/map/index.html",
        source: readFileSync(resolve(mapRoot, "iframe/index.html")),
      });

      for (const fileName of ["chart-iframe.html", "chart-iframe.js"]) {
        this.emitFile({ type: "asset", fileName: `preview/chart/${fileName}`,
          source: readFileSync(resolve(__dirname, `src/lets-database-view/visual/${fileName}`)) });
      }
      // Leaflet、地图样式等保持为 iframe 同目录静态资源，避免依赖主插件运行时环境。
      const staticFiles = await fg([
        "src/lets-database-view/map/iframe/**/*",
        "!src/lets-database-view/map/iframe/main.ts",
        "!src/lets-database-view/map/iframe/index.html",
      ], { onlyFiles: true });
      const iframeRoot = resolve(__dirname, "src/lets-database-view/map/iframe");
      for (const file of staticFiles) {
        const absolutePath = resolve(__dirname, file);
        const relativePath = relative(iframeRoot, absolutePath).replace(/\\/g, "/");
        this.emitFile({
          type: "asset",
          fileName: `preview/map/${relativePath}`,
          source: readFileSync(absolutePath),
        });
      }
    },
  };
}

/** Frappe Gantt is vendored as MIT-licensed, offline-only assets.
 * No runtime CDN calls and no styles installed in SiYuan's host DOM.
 */
function emitGanttPreviewAssets() {
  const root = resolve(__dirname, "src/lets-database-view/gantt/iframe");
  const sourceFiles = ["gantt-iframe.html", "main.js", "app.css"];
  const vendorFiles = [
    "frappe-gantt.umd.js",
    "frappe-gantt.css",
    "FRAPPE-GANTT-LICENSE.txt",
  ] as const;
  return {
    name: "emit-dodo-gantt-preview",
    buildStart() {
      for (const name of sourceFiles) this.addWatchFile(resolve(root, name));
      for (const name of vendorFiles) this.addWatchFile(resolve(root, name));
    },
    generateBundle() {
      // Browser/Electron can cache the iframe module beyond a plugin rebuild.
      // Version the HTML's JS/CSS URLs from their actual content, while the
      // host adds a navigation nonce to the HTML URL on each new mount.
      const version = createHash("sha256")
        .update(readFileSync(resolve(root, "main.js")))
        .update(readFileSync(resolve(root, "app.css")))
        .digest("hex").slice(0, 12);
      const vendorVersion = createHash("sha256")
        .update(readFileSync(resolve(root, "frappe-gantt.umd.js")))
        .update(readFileSync(resolve(root, "frappe-gantt.css")))
        .digest("hex").slice(0, 12);
      for (const name of sourceFiles) {
        let content: Buffer | string = readFileSync(resolve(root, name));
        if (name === "gantt-iframe.html") {
          content = content.toString("utf8")
            .replace('src="./main.js"', 'src="./main.js?v=' + version + '"')
            .replace('href="./app.css"', 'href="./app.css?v=' + version + '"')
            .replace('src="./frappe-gantt.umd.js"', 'src="./frappe-gantt.umd.js?v=' + vendorVersion + '"')
            .replace('href="./frappe-gantt.css"', 'href="./frappe-gantt.css?v=' + vendorVersion + '"');
        }
        this.emitFile({
          type: "asset",
          fileName: "preview/gantt/" + name,
          source: content,
        });
      }
      for (const name of vendorFiles) {
        this.emitFile({
          type: "asset",
          fileName: "preview/gantt/" + name,
          source: readFileSync(resolve(root, name)),
        });
      }
    },
  };
}

/** Bundle FullCalendar and its CSS locally for the isolated calendar iframe.
 * No CDN calls, shared host stylesheet or second Vite application.
 */
function emitCalendarPreviewAssets() {
  const root = resolve(__dirname, "src/lets-database-view/calendar/iframe");
  return {
    name: "emit-dodo-fullcalendar",
    buildStart() {
      for (const file of ["main.ts", "app.css", "index.html"]) {
        this.addWatchFile(resolve(root, file));
      }
    },
    async generateBundle() {
      const result = await esbuildBundle({
        entryPoints: [resolve(root, "main.ts")],
        outdir: resolve(root, ".generated"),
        bundle: true,
        platform: "browser",
        format: "iife",
        target: "es2022",
        minify: true,
        write: false,
        logLevel: "warning",
      });
      const js = result.outputFiles.find(file => file.path.endsWith("main.js"));
      const css = result.outputFiles.find(file => file.path.endsWith("main.css"));
      if (!js || !css) throw new Error("FullCalendar JS/CSS 离线打包不完整");
      const revision = createHash("sha256").update(js.contents).update(css.contents)
        .digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "preview/calendar/main.js", source: js.contents });
      this.emitFile({ type: "asset", fileName: "preview/calendar/main.css", source: css.contents });
      this.emitFile({ type: "asset", fileName: "preview/calendar/FULLCALENDAR-LICENSE.md",
        source: readFileSync(resolve(__dirname, "node_modules/fullcalendar/LICENSE.md")), });
      const html = readFileSync(resolve(root, "index.html"), "utf8")
        .replace('href="./main.css"', 'href="./main.css?v=' + revision + '"')
        .replace('src="./main.js"', 'src="./main.js?v=' + revision + '"');
      this.emitFile({ type: "asset", fileName: "preview/calendar/index.html", source: html });
    },
  };
}

// During marketplace builds, remove unpublished modules from the static import
// glob before Vite expands it. Local builds keep the original registration.
const unpublishedModules = ["home", "excalidraw", "notion-share"] as const;

function marketplaceEntryFilter() {
  return {
    name: "marketplace-module-filter",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!isMarketplace || !id.replace(/\\/g, "/").endsWith("/src/plugin-registry.ts")) return;
      const original = '["./lets-*/index.ts", "./lets-*/plugin.ts"]';
      if (!code.includes(original)) throw new Error("Cannot find plugin registry glob");
      const excludes = unpublishedModules.flatMap(name => [
        "!./lets-" + name + "/index.ts",
        "!./lets-" + name + "/plugin.ts",
      ]);
      return code.replace(original, JSON.stringify([
        "./lets-*/index.ts", "./lets-*/plugin.ts", ...excludes,
      ]));
    },
  };
}

// Generate release-specific metadata without changing README.md or plugin.json
// in the working tree used for full local builds.
function marketplaceMetadata() {
  return {
    name: "marketplace-metadata",
    generateBundle(this: any) {
      if (!isMarketplace) return;
      const manifest = JSON.parse(readFileSync(resolve(__dirname, "plugin.json"), "utf8"));
      const lines = readFileSync(resolve(__dirname, "README.md"), "utf8").split(/\r?\n/);
      const skipped = ["主页", "Excalidraw", "分享到 Notion"];
      let removed = 0;
      const filtered = lines.filter(line => {
        const exclude = skipped.some(name => line.startsWith("- **[" + name + "]("));
        if (exclude) removed++;
        return !exclude;
      });
      if (removed !== skipped.length) throw new Error("Marketplace README module list changed");
      const heading = filtered.indexOf("## 功能模块");
      if (heading < 0) throw new Error("Marketplace README missing features heading");
      filtered.splice(heading + 1, 0, "",
        "> 集市版暂不包含主页、Excalidraw、分享到 Notion。这些功能仅保留在本地自用完整包中。");
      // README is rendered from package.zip; source-tree links must point to
      // GitHub because src/docs are not shipped as installable plugin assets.
      const readme = filtered.join("\n").replace(
        /\]\((src\/[^)]+|docs\/[^)]+|CONTRIBUTING\.md|LICENSE)\)/g,
        (_match, relativePath: string) => "](" + manifest.url +
          (relativePath.endsWith("/") ? "/tree/main/" : "/blob/main/") +
          relativePath + ")",
      );
      this.emitFile({ type: "asset", fileName: "README.md", source: readme });

      manifest.description.default = "思源笔记数据库视图、附件管理与编辑增强工具箱";
      manifest.description["zh-CN"] = manifest.description.default;
      manifest.frontends = ["all"];
      manifest.keywords = manifest.keywords.filter((keyword: string) =>
        keyword.toLowerCase() !== "excalidraw");
      this.emitFile({ type: "asset", fileName: "plugin.json",
        source: JSON.stringify(manifest, null, 2) + "\n" });
    },
  };
}

export default defineConfig({
  // Compile new React/TSX UI using the automatic JSX runtime; Svelte remains unchanged.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  plugins: [
    marketplaceEntryFilter(),
    marketplaceMetadata(),
    svelte(),
    emitTimelinePreviewAssets(),
    emitGalleryPreviewAssets(),
    emitMapPreviewAssets(),
    emitGanttPreviewAssets(),
    emitCalendarPreviewAssets(),

    viteStaticCopy({
      targets: [
        ...(!isMarketplace ? [{
          src: "./skills/dodo-toolbox-excalidraw/SKILL.md",
          dest: "./skills/dodo-toolbox-excalidraw/",
        }] : []),
        {
          src: "./skills/dodo-custom-view/SKILL.md",
          dest: "./skills/dodo-custom-view/",
        },
        {
          src: "./skills/dodo-custom-view/references/*.md",
          dest: "./skills/dodo-custom-view/references/",
        },
        ...(!isMarketplace ? [{ src: "./docs/excalidraw-browser.md", dest: "./docs/" }] : []),
        {
          src: "./LICENSE",
          dest: "./",
        },
        ...(!isMarketplace ? [
          { src: "./README*.md", dest: "./" },
          { src: "./plugin.json", dest: "./" },
        ] : []),
        {
          src: "./preview.png",
          dest: "./",
        },
        {
          src: "./icon.png",
          dest: "./",
        },
      ],
    }),
  ],

  // https://github.com/vitejs/vite/issues/1930
  // https://vitejs.dev/guide/env-and-mode.html#env-files
  // https://github.com/vitejs/vite/discussions/3058#discussioncomment-2115319
  // 在这里自定义变量
  define: {
    "process.env.DEV_MODE": `"${isWatch}"`,
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    "process.env.DODO_EXCALIDRAW_BUILD_ID": JSON.stringify(excalidrawBuildId),
  },

  build: {
    // 输出路径
    outDir: distDir,
    emptyOutDir: isMarketplace,

    // 构建后是否生成 source map 文件
    sourcemap: false,

    // 设置为 false 可以禁用最小化混淆
    // 或是用来指定是应用哪种混淆器
    // boolean | 'terser' | 'esbuild'
    // 不压缩，用于调试
    minify: !isWatch,

    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/index.ts"),
      // the proper extensions will be added
      fileName: "index",
      formats: ["cjs"],
    },
    rollupOptions: {
      plugins: [
        ...(isWatch
          ? [
              {
                //监听静态资源文件
                name: "watch-external",
                async buildStart() {
                  const files = await fg([
                    "public/i18n/**",
                    "./README*.md",
                    "./plugin.json",
                  ]);
                  for (let file of files) {
                    this.addWatchFile(file);
                  }
                },
              },
            ]
          : [
              zipPack({
                inDir: distDir,
                outDir: "./",
                outFileName: isMarketplace ? "package-marketplace.zip" : "package.zip",
              }),
            ]),
      ],

      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["siyuan", "process"],

      output: {
        // Keep SiYuan plugin entry self-contained across desktop and mobile.
        inlineDynamicImports: true,
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "index.css";
          }
          return assetInfo.name;
        },
      },
    },
  },
});
