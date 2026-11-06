# 开发指南

## 环境与首次构建

- 思源笔记：`plugin.json` 声明的最低版本为 3.0.0；部分模块会使用较新的思源 API。
- Node.js：建议 22 LTS 或兼容的更新版本。
- pnpm：推荐 10.x；仓库使用 lockfile v9，**锁文件应随代码提交**。

```bash
pnpm install --frozen-lockfile
pnpm build
```

正常构建依次打包 Frappe Gantt 静态资源、Excalidraw React 编辑器与工具箱宿主；产物在 `dist/`，并生成 `package.zip`。不要手动提交 `dist/`、`package.zip` 或 `node_modules/`。

## 本地安装

先在思源中打开一个测试工作空间，确认其目录下存在 `data/plugins/`。

```bash
pnpm build
pnpm install:preview
```

`install:preview` 为部署预检，不会复制文件。确认目标目录无误后再使用：

```bash
pnpm install:local
```

默认安装目标基于 `USERPROFILE` / `HOME` 下的 `SiYuan/data/plugins/siyuan-dodo`。如果工作空间位于其他路径，请设置环境变量 `SIYUAN_PLUGIN_DIR`，值可以为完整插件目录，或 `data/plugins` 父目录。也可以执行：

```bash
node scripts/sync-build.mjs --dry-run --target "<工作空间>/data/plugins/siyuan-dodo"
node scripts/sync-build.mjs --target "<工作空间>/data/plugins/siyuan-dodo"
```

**注意：** 安装脚本会向所选插件目录复制构建结果并清理旧的 Excalidraw 哈希资源，不要把正式使用的工作空间当成测试环境。首次部署前请备份。

## 开发监听与测试

```bash
pnpm dev
pnpm test:database-view-core
pnpm test:visual
pnpm test:map
pnpm test:calendar
pnpm test:excalidraw
```

`pnpm dev` 启动两个 Vite watch 构建任务，分别处理 Excalidraw 与插件宿主，不代表自动连接或启用思源插件。如果需要指向特定测试插件目录，请通过环境变量配置，勿将自己的绝对路径写进仓库。

部分 `scripts/test-*.mjs` 为脱离思源内核的模拟回归；`scripts/*browser*.py` 等可能需要 Python Playwright、浏览器、代理端口或专门的测试数据，应根据脚本提示准备环境，且**不要对真实笔记数据直接运行破坏性测试**。

## 结构与开发约定

| 目录 | 用途 |
| --- | --- |
| `src/lets-*/` | 独立子模块及 README |
| `src/plugin-registry.ts` | 子模块扫描、注册、生命周期管理 |
| `src/shared/` | 模块间共享的思源数据库接口及工具 |
| `src/components/` | 通用 UI 组件 |
| `src/lets-excalidraw/` | React/Excalidraw 编辑器及独立打包入口 |
| `public/` | 插件运行所需静态资源及预览器 |
| `scripts/` | 构建、部署与测试脚本 |
| `docs/plans/` | 历史设计/迁移计划，**不能作为当前行为的唯一依据** |

新增子模块时按已有的 `src/lets-*/index.ts` 和 `plugin.ts` 模式注册；数据库视图相关代码应尽量复用 `src/shared/av/` 与 `src/lets-database-view/core/`，避免在单个视图内重复实现读写和生命周期逻辑。

## 发布

GitHub Actions 通过 Git tag 触发构建并将 `package.zip` 附加至 Release。创建 tag 前请执行构建、相关测试，并完成[公开发布检查清单](OPEN_SOURCE_CHECKLIST.md)。特别核对 `package.json` 与 `plugin.json` 的版本、正式仓库 URL、第三方资产授权及 Git 历史中的敏感信息。
