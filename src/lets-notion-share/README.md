# 分享到 Notion：原生 Markdown ZIP 同步

适用于思源 v3.8.7、Notion API `2026-03-11`。保留旧的「分享到 Notion」「重新分享到 Notion」「取消分享」菜单、`notionShare.token`、`notionShare.databaseId` 设置及 `custom-dodo-share` 分享链接属性。

## 同步流程

1. `/api/export/exportMd` 使用 `id`、`includeSubDocs:false`、`markdownYFM:false` 导出单文档 Markdown ZIP；校验并下载返回的 `/export/*.zip`。
2. 使用 JSZip 读取 `.md` 和 `assets/`，将图片以及独立附件链接转换为独立文本定位标记。不自行转换标题、表格、代码、引用、折叠等正文块，尽量使用 Notion 官方 Markdown 解释器。
3. 新版 `GET /v1/databases/{id}` 确定唯一 `data_source_id`，读取该数据源的标题属性。
4. 本地资产采用 `POST /v1/file_uploads` + `POST /v1/file_uploads/{id}/send` 上传；正文通过 `POST /v1/pages` 的 `markdown` 或 `PATCH /v1/pages/{id}/markdown` 的 `replace_content` 写入；之后定位文本锚点，在同级原位置插入原生 image/file 块并删除锚点。支持在子块中递归定位。
5. 新页面一创建就写回 `custom-dodo-share`，便于插图失败后安全重试；全部完成后，记录 `custom-dodo-notion-synced-edit`，下一次更新前比较 `last_edited_time`，避免覆盖 Notion 侧修改。

## 注意

- Notion 没有公开的「上传思源 Markdown ZIP 并自动执行网页导入」API。这是复用 ZIP 中原生 Markdown + Notion 原生 Markdown API 的自动化方案；与网页端 ZIP 导入 **不保证逐块完全相同**。
- 使用「重新分享到 Notion」同步已存在文章。第一次覆盖旧版分享、或检测到 Notion 侧修改时会要求用户再次确认；取消则不修改 Notion 内容。
- ZIP 限制为 100MB / 500 个文件，本地单文件上传限定 20MB。缺失资源会在修改 Notion 页面前报错。单文档 `.md` 必须唯一；暂不批量同步子文档。
- 如果 Notion Markdown 自身解析失败、图片锚点未生成或上传中断，可能留下未完成的新页面或未插入完成的图片；分享回链会保留，下一次选择「重新分享到 Notion」继续修复。不要在出错后直接再次新建页面。
- Notion 原生 Markdown API 也不一定能表达思源所有专用块。需要结合实际样例继续完善少数特殊块。
- `scripts/test-notion-markdown.mjs` 和 `scripts/test-notion-api.mjs` 都使用本地构造的 ZIP 与模拟 Notion API；不会对实际 Notion 数据库新增或覆盖文章。

## 媒体和 ZIP 导入对照优化（2026-10-16）

按用户提供的同一篇「排版元素」实测：插件版和手动 ZIP 导入版的标题、表格、基础代码和公式总体保留；手动版 iframe 作为嵌入块而插件版是字面标签；手动版将下划线转为原生格式；两版此前都没有上传本地 MP4/WAV。手动版的部分深层列表反而发生降级，故没有直接照搬其全部转换。

- 思源导出的 `<video src="assets/*.mp4">` / `<audio src="assets/*.wav">` 已识别，本地资源经 File Upload API 上传，按顺序插入 Notion 原生 `video` 和 `audio` 块；使用 `src` 而非旧路径 `data-src`。
- 带有公网 URL 的 `<iframe>` 转成 Notion `embed` 块，保留 Bilibili 等外链视频的原位置。不处理 JS/local 等不可公开访问的来源。
- `<u>…</u>` 转为 `<span underline="true">…</span>`，去掉 `<kbd>/<sup>/<sub>` 字面标签，与手工 ZIP 导入的表现尽可能一致。
- 图片和音视频支持混合插入顺序；不修改正确的嵌套列表、表格、公式或代码块。
- 当前 Notion 上传仍使用 single_part，单文件大于 20MB 会在写入页面前报错；较大音视频需单独开发 multipart 上传。
- 本次测试使用模拟 Notion API；不覆盖用户提供的两个 Notion 对照页面。

## 增量同步 v2（2026-10-17）

现在「重新分享到 Notion」默认走差异同步，另提供「强制全量重建 Notion 页面」。每篇文章将原始 Markdown 基线、媒体块 ID、SHA-256、Notion 上传 ID 和嵌入信息保存在思源的文档属性 `custom-dodo-notion-sync-v2`，并通过 `custom-dodo-notion-synced-edit` 检测 Notion 端改动。取消分享将一并清理这些记录。

- **内容完全不变**：零文件上传、零页面和块修改。只读取 Notion 页面状态并检查源资源的 SHA-256。
- **安全的单点正文编辑**：先确认原文在 Notion 导出的 Markdown 中唯一出现，然后使用 `update_content` 定点更新，不破坏任何已上传媒体或原生块 ID。多处改动、块结构变化以及无法唯一定位的内容需确认全量重建。
- **图片、视频、音频二进制变化但顺序/路径不变**：只上传内容哈希改变的文件，在旧媒体块后插入替代块并删除旧块。其他媒体块及文件保持原状。
- **新增/删除/重排资源、复杂正文变化**：禁止隐式全量覆盖；确认后才使用 `replace_content` 全量重建。旧上传 ID 仅在 `GET /file_uploads/{id}` 验证状态为 uploaded 且未过期时可按哈希复用；失效的文件才重新上传。一次同步中的相同字节文件也只上传一次。
- **首次从旧版分享升级**：旧页面尚无可靠的媒体 SHA-256/块 ID 索引，需确认进行一次全量初始化，建立索引后便可持续增量。不能从文件名猜测字节哈希来假装已有可复用索引。
- **错误安全**：Notion 页面编辑冲突需要人工确认；无法安全定位的差异不自动覆盖。媒体插入完成后再写增量基线；发生网络中断则不要假定成功，可用显式全量重建恢复。
- **限制**：当前正文差异更新仅覆盖可唯一定位的一处小型文字修改，其余采用确认后的全量恢复。Notion 单文件 20MB 以上仍需后续增加分片上传。增量快照非常大的文档需要拆分。

测试：`pnpm run test:notion` 包括 ZIP 导出、图片和媒体插入、无操作同步、局部正文替换、单文件更新、文件过期以及强制重建时跨次 SHA-256 去重。测试使用完全模拟的 Notion API，不覆盖用户真实的 Notion 页面。
