# 渡渡鸟工具箱（SiYuan Dodo）

一款面向 [思源笔记](https://github.com/siyuan-note/siyuan) 的模块化工具箱插件，将常用增强功能集成在一起，可按需启用。

> 💡 **声明**：本插件主要供作者自用，现将其开源分享。开发过程中参考并引用了思源社区及其他开源项目的优秀成果，相关来源、授权与致谢可在各子模块的 README、源码或第三方许可证文件中查看。如果本工具箱对你有所帮助，感谢这些开源项目的作者与贡献者。
>
> **AI 辅助开发说明**：本插件包含由 AI 生成或辅助编写、修改和重构的代码，部分文档也由 AI 辅助完成。项目仍可能存在错误、兼容性问题及尚未充分测试的行为，使用前请自行评估风险并备份重要数据。

## 使用说明

1. **介绍说明：** 本插件集成了多种个人常用的功能，少部分功能迁移自其他插件。
2. **免责声明：** 本插件为个人自用，不保证任何意义上的稳定性。\
   **无国际化：** 本插件仅为个人使用，暂不考虑多语言支持。\
   **可能存在硬编码：** 插件内部可能存在一些硬编码的变量，例如个人笔记本 ID 等。\
   **跨平台适配弱：** 本插件主要为思源本地 Electron 应用设计，未针对其他系统、服务器模式或移动端进行特别适配，可能存在兼容性问题。

## 功能模块

各模块的具体功能、使用方式和注意事项见对应 README。

- **[数据库视图](src/lets-database-view/README.md)**：地图、图表、时间线、甘特图、日历和自定义视图。
- **[Excalidraw](src/lets-excalidraw/README.md)**：手绘画布、思源块嵌入和思维导图增强。
- **[文件管理](src/lets-file-manager/README.md)**：思源附件浏览、管理和预览。
- **[自定义块](src/lets-custom-block/README.md)**：计算、折叠、SQL、相册等自定义块。
- **[主页](src/lets-home/README.md)**：可自由布局的个人工作台。
- **[文档面包屑](src/lets-doc-breadcrumb/README.md)**：显示文档层级路径并提供跳转。
- **[快捷输入](src/lets-quick-input/README.md)**：通过 @ 搜索文档和输入语义时间。
- **[符号自动替换](src/lets-symbol-replace/README.md)**：根据自定义规则替换输入文本。
- **[链接图标](src/lets-link-icon/README.md)**：外链图标与链接卡片。
- **[Flomo 同步](src/lets-flomo-sync/README.md)**：同步 Flomo 笔记。
- **[分享到 Notion](src/lets-notion-share/README.md)**：将思源文档分享到 Notion。

## 开发与许可

项目采用 `src/lets-*/` 子模块自动注册机制；构建、安装与测试说明见 [开发指南](docs/DEVELOPMENT.md)，参与项目请阅读 [贡献指南](CONTRIBUTING.md)。

提供两个独立构建版本：执行 `pnpm build` 生成包含全部模块的本地自用包 `package.zip`；执行 `pnpm build:marketplace` 生成集市版 `package-marketplace.zip`，暂不包含主页、Excalidraw、分享到 Notion。GitHub Release 会将集市版作为 `package.zip` 发布，不会发布本地完整包。

项目采用 [MIT License](LICENSE)。部分功能参考或迁移自其他开源项目；感谢原作者和社区贡献者。第三方代码及素材仍遵循各自许可证，详见模块说明和 [第三方授权文件](src/lets-excalidraw/licenses/)。
