# Dodo 数据库：AI 自定义 HTML 视图（首版）

## 打开方式

1. 在思源中打开数据库的**原生表格视图**，点击 Dodo「自定义视图」选择「AI 自定义」。
2. 插件自动为该原生 viewID 创建一份 HTML 微应用，显示当前视图的数据卡片。
3. 点击视图顶部、Dodo 自定义视图按钮右侧的**设置**打开 HTML 编辑器。可编辑源码、导入或导出 HTML、调整高度、查看历史版本、恢复旧版本。
4. 在**思源 Agent** 中调用 `dodo-database.custom.list` 获取已打开的 `appId`；再调用 `schema`、`records`、`get_source` 获取数据及源码；调用 `save_source`（提供 `expectedVersion`）写入完整 HTML，并自动刷新视图。修改前的 HTML 会自动备份。

现在优先调用 `dodo-database.custom.current`，无需用户重复指定数据库 ID。它自动定位最近激活的数据库，返回字段、样本记录及已有 HTML/版本。若仍是原生表格，可经 Agent 写入权限确认后调用 `dodo-database.custom.create({blockId,viewId,avID})`，创建/恢复该视图的自定义 HTML；如已是自定义视图则直接二次编辑。

## 内置 Agent Skill

插件内置 `skills/dodo-custom-view/SKILL.md`，并提供四份可选参考：
`references/runtime.md`、`design.md`、`examples.md`、`checklist.md`。
Skill 只要求数据正确性、交互可靠性和合理的设计质量；**不固定配色、字体或布局风格**。
`examples.md` 引用 [Anthropic HTML Effectiveness](https://github.com/anthropics/html-effectiveness)
中的相应设计/交互示例，强调学习方法，不直接复制页面。

当思源 Agent 无法自动发现插件的 `skills/` 目录时，仍可调用：

- `dodo-database.custom.read_me`：读取核心 `dodo-custom-view` Skill。
- `dodo-database.custom.reference({topic:"runtime"|"design"|"examples"|"checklist"})`：只取需要的参考。

上述入口属于只读 Agent 能力；不会写入当前用户 HTML。Skill 的物理目录位于
插件安装包中，而自定义页面仍单独保存于 `data/storage/petal/siyuan-dodo/`。

## 存储方式

```text
/data/storage/petal/siyuan-dodo/
├─ custom-views/
│  ├─ preferences.json       全局历史快照数量上限（默认20）
│  └─ app-<UUID>/
│     ├─ index.html          用户/Agent 编写的源代码
│     ├─ manifest.json       版本号、修改时间和被固定的历史版本
│     └─ versions/           最近N份未固定历史 + 固定版本
└─ custom-view-trash/
   └─ app-<UUID>/            用户手动回收但尚未彻底删除的应用
```

- **不会**将 HTML 写入 `data/plugins/siyuan-dodo`：插件覆盖、重装不应删掉数据。
- 原生数据库块属性 `custom-dodo-views` 按真实 `viewID` 保存 `{mode:"custom",configs:{custom:{appId,height,allowWrites}}}`。
- 切回表格或其他模式不删除 HTML；重新启用时使用原 `appId`。
- **通过思源原生菜单删除某个数据库视图时**，Dodo 监听 AV 视图标签变化，
  通过 `/api/av/getAttributeView` 核实视图是否真正不存在（再次核对后才提交），
  自动从该数据库块的 `custom-dodo-views.views` 移除对应 `viewID` 配置。
  该同步只清理失效的视图配置，不删除 HTML App 或历史快照；原生视图
  暂时隐藏、切换 Dodo 展示类型、UI 重新渲染都不会当成删除。
  插件启动时和打开数据库后也会检查已有失效配置。已关闭笔记本中的
  数据库块需在重新打开后同步，不会在后台擅自改写它们。
- 跨设备同步、云备份及导出后的附件路径兼容性必须通过对应思源环境验证，不能仅凭该目录名称保证。

## HTML 运行时接口

页面内部通过异步 `window.dodoDB`（注入于 HTML 的 `<head>`）调用：

```js
const schema = await dodoDB.getSchema();
// {avID,blockId,viewId,name,fields:[{id,name,type,icon?}],
//  pageSize,batchSize,all}
// pageSize 是思源当前原生视图保存的「条目数」；HTML 无第二份配置。

const pager = dodoDB.createPaginator();
const page = await pager.next();
// {page,pageSize,batchSize,total,hasMore,all,stale,added,
//  records:[{id,blockId,valueId,values:{[fieldId]:typedValue}}]}
// 后续滚动触底或点击「加载更多」只调用 pager.next()；
// 每页自动遵循思源条目数，并自动按 row.id 去重。

await dodoDB.openRecord(recordId);
// 当前数据库资源列的图片直接由浏览器加载，无需 Base64：
const path = row.values[assetField.id][0].path;
imageElement.src = path + (path.includes('?') ? '&style=thumb' : '?style=thumb');
await dodoDB.updateCell({recordId,fieldId,value:"新文本"});
await dodoDB.createRecord({[primaryKeyId]:"新记录",[numberKeyId]:20});
```

支持直接使用 `<a href="siyuan://blocks/20250714172221-ixpdk5g">打开笔记</a>`。
运行时自动拦截该链接，并用 `openRecord` SDK 在思源原生标签页中打开。
目标必须是当前数据库视图的 itemID 或绑定文档 blockId，非法或无关目标将拒绝打开。

### 历史版本自动管理与 App 回收

- 默认每个 App 保留 **20** 份最近的未固定 HTML 快照（不含当前 `index.html`）。
  可在「数据库视图 → AI 自定义视图 → App 与版本管理」设为 5、10、20、50、100 份。
- 每次实际修改 HTML 成功保存后自动清理超过上限的旧快照；固定的历史版本不参加自动清理。
  HTML 编辑器的「固定所选版本 / 取消固定」可保护关键版本。调整上限后，
  「应用并清理超额版本」会立即处理已有应用。
- 「App 管理」直接内嵌在 **Dodo 设置 → 数据库视图 → AI 自定义视图** 下方，
  不再单独创建管理弹窗。App 列表显示 ID、当前版本、历史份数、容量及
  使用/保留引用；每个关联数据库块的名称都可以点击，通过思源原生标签页
  打开并定位。一个 App 关联多个数据库时逐个列出；路径悬浮显示，
  对关闭笔记本或无法获取名称的块会保留 ID 作为回退。
- 数据库视图的 AI 自定义/地图/图表/甘特/日历/时间线设置分组**直接展开**，
  在同一个页面纵向滚动，不用折叠面板；即使某个分组暂时没有选项也保留标题。
  **数据库视图模块总开关和各个视图功能开关均继续保留。**
- 即使切回表格，`custom-dodo-views` 中保存的 App ID 仍是有效的**保留关联**，
  不会误判为孤立。如果确认今后不复用，需先明确点击「解除保留关联」。
- 管理器先扫描思源 SQL `attributes` 表中全部可索引的 `custom-dodo-views`，
  再直接核对已打开的数据库块属性。引用扫描失败时禁止清理；回收操作前会再次扫描。
  索引可能不包括关闭的笔记本，关闭笔记本中的引用仍需用户检查。
- 无引用 App 只能**人工确认移入回收站**，不会自动删除 App。
  `custom-view-trash` 中的 App 可以恢复；只有再次输入明确确认词后才永久清理回收站，
  真正释放占用空间。App 清理不会修改原生数据库记录。

- 字段应使用固定 `keyID`，不要只依赖可改名的列标题。
- **分页唯一配置来自原生视图的「条目数」**：菜单选择 5/10/25/50/100/全部，
  保存在当前 AV `viewID` 的 `pageSize` 中。Dodo 通过
  `renderAttributeView` 读取其保存值，不再采用 HTML 传入的
  `listRecords({page,pageSize})` 中的 `pageSize`；旧参数会忽略。
- `getSchema()` 返回 `pageSize`（原生设置）、`batchSize`（实际批次）
  和 `all`。原生「全部」对应 102400，插件内部按每次 100 条读取，
  避免一次读取和渲染海量内容。实际每次批量还受当前 `viewID` 过滤/排序约束。
- **推荐 `dodoDB.createPaginator()`**：单 iframe 共用一个分页器，
  `next()` 自动续页、合并并按 ID 去重，合并并发调用；刷新事件
  `dodoDBRefresh` 会使旧请求过期并重置分页，返回 `stale:true`
  的结果不能渲染。页面只实现滚动触底/按钮和卡片绘制，不应再
  自行设计批次大小、页码计数器或独立的数据缓存。
- Dodo 新建 HTML 默认模板已经使用统一分页器 + 滚动触底加载和「加载更多」
  按钮。**不自动修改用户已有 HTML**：已有 HTML 仍能调用 `listRecords`，
  但如果其中假定 `pageSize:100` 一定有效，需让 Agent 重新生成分页逻辑。
- 文本、数字、复选框字段可以写入；其他字段类型保持只读，避免无声数据损坏。
- 写入权限**按视图默认关闭**，需在自定义视图设置中主动启用并确认。创建、改单元格会进入 Dodo 的同数据库写入协调器，写后通知其他视图重新读取。
- 页面可监听 `dodoDBReady` 与 `dodoDBRefresh` 事件重新加载数据；首屏脚本也可直接检查 `window.dodoDB`。

### 数据库资源图片直接加载

- `mAsset` 资源字段返回 `{name,path,type}`。页面直接使用资源路径：
  `<img src="assets/image-20261104203605-wyajmzs.png?style=thumb" loading="lazy">`。
  HTML 的 `<base href="/">` 保证相对路径始终指向思源服务根目录。
- 不再使用 Base64、不再调用 `getAssetPreview`，也不保留受控图片 Bridge。
  图片由浏览器按普通 HTTP URL 加载、使用缩略图与缓存。
- 新建 AI HTML 默认卡片模板遇到资源列会显示封面，采用原生
  `loading="lazy"`。用户可删除旧 HTML 并重新生成；
  插件更新不会自动修改已有用户自定义 HTML。

### 自定义 HTML 的滚动条

- 自定义 HTML 内容位于独立的 iframe 中，滚动条属于 iframe 文档自身或
  文档内部的 `overflow:auto` 滚动容器，思源宿主样式不会自动进入 iframe。
- Dodo 会在 `srcdoc` 页面的 `head` 前部注入默认滚动条 CSS：
  Chromium 约 6px、圆角半透明灰色滑块、透明轨道、隐藏滚动箭头；
  非 WebKit 浏览器使用 `scrollbar-width: thin`。规则覆盖 HTML 和
  嵌套滚动容器，并采用低优先级的 `:where(*)` 选择器，用户自己的 CSS
  可以覆盖。
- 不修改用户保存的 `index.html`、App 历史快照或思源外层滚动条；
  仅在自定义视图渲染时生效。Agent Skill 默认遵循插件的细滚动条样式，
  避免在 HTML 内重复生成粗滚动条或双层垂直滚动。

### 切换原生数据库视图后的 HTML 挂载与恢复

- Dodo 宿主观察器除节点增删外，还监听思源原生 `av__header` 的
  `data-current-view-id` 变化，以及 `layout-tab-bar .item` 的
  `item--focus` class 变化。原生视图仅更新选中属性而未重建 DOM 时
  也会立即重新扫描、挂载自定义 HTML，不需切换文档才能出现。
- iframe 的 `srcdoc` 加载完毕后，若已经有 `window.dodoDB`，
  不再因为 load 事件额外调用一次页面刷新。若视图切换或 native AV
  DOM 重建导致 iframe 导航丢失运行时，即便 `appId` 与 HTML 版本号
  仍相同，插件也会重新注入已保存的 HTML，而不是向空白页面发送刷新。
- HTML 内容初始化反复失败时停止无限重试并显示明确错误，不隐藏
  原始的内核读取失败；该修复仅改变容器生命周期，不改用户保存的
  HTML、历史版本、分页逻辑或数据库记录。
- Agent 工具 `dodo-database.custom.read_me`、`reference({topic:"runtime"})`
  及 `save_source` 的描述中均包含原图/缩略图选择规则：卡片、图库、
  搜索结果优先使用 `?style=thumb`，点击放大、灯箱预览及下载使用
  无 `style=thumb` 的原始资源 URL，按需加载原图；通过
  `URL.searchParams` 增删参数，避免已有查询参数时拼接出错误 URL。
  实测一张 2048×2048 的 PNG 原图为 2.81 MiB，缩略版本 520×520、
  258 KiB，具体尺寸随文件变化。两种链接均不会修改原始文件。

### HTML 表单新增数据库条目

- 通过普通 `<form>` 输入字段，监听 `submit`：
  调用 `event.preventDefault()`，将当前表单字段映射到稳定的
  `field.id`，再调用 `dodoDB.createRecord(values)` 即可增加条目。
  现有实现必须有非空主键标题（block 字段）；其余允许写入文本、
  有限数字和复选框，单选、多选、日期、资源等尚不支持写入。
- `dodoDB` SDK 默认不允许写入；需要用户在 HTML 编辑器主动勾选
  **允许 HTML 修改当前数据库**。若没有授权，SDK 会直接拒绝创建，
  **但无沙箱的 HTML 仍可能直接调用同源思源接口，绕过 SDK 开关**。
  表单要在提交期间禁用按钮，防止重复创建；发生部分字段写入失败时，
  不能直接重试，以免创建重复的数据库条目。
- 自定义 HTML 目前不设置 iframe `sandbox`，也不注入 CSP。
  原生表单可以发 POST，但建议监听 `submit` 并
  `preventDefault()`，使用 Dodo SDK 的字段验证与写后通知。
  **只运行经过审查的可信 HTML**。

### AI 自定义 HTML 中使用思源 ECharts

- AI 自定义 HTML 中可直接调用 `window.echarts.init(element)`、
  `chart.setOption(option)` 等 ECharts API，不必重复打包图表库。
  Dodo 检测到 `echarts.init` / `window.echarts` 等调用时，自动在用户脚本之前
  加载思源内置的 `/stage/protyle/js/echarts/echarts.min.js`。
- 使用间接别名的页面可在 HTML 的 `head` 放置
  `<meta name="dodo-echarts" content="enabled">` 显式声明；普通 HTML
  页面不会加载较大的 ECharts 脚本。
- 图表数据推荐继续通过 `window.dodoDB` 的字段 ID/记录分页获取。
  由于 iframe 不再注入 CSP，其他外部脚本及请求在浏览器允许的范围内也能执行，
  需要用户审查其来源与权限。
- 页面自行检查 `window.echarts` 的加载结果，设置图表容器高度，并使用
  `ResizeObserver` 调用 `chart.resize()`；动态更新应复用 chart 实例，
  避免每次筛选或刷新都重复创建图表。

### Agent HTML 设计 Skill（设计方法 + 主题 + 复杂构建）

- `dodo-database.custom.read_me` 内融合了
  [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)、
  [web-artifacts-builder](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder)、
  [theme-factory](https://github.com/anthropics/skills/tree/main/skills/theme-factory)
  的适用方法，保持 Dodo 数据库读取/写入、版本控制和单 HTML 交付约束。
  原 Skill 均为 Apache-2.0，Dodo 使用适配过的设计原则，不直接复制其脚本/模板。
- 设计两步法：先从实际 AV 字段/记录推导用户目标，规划视觉层级、
  4–6 个颜色令牌、字体与嵌入容器排版；再批判是否泛化成所有数据库
  都一样的卡片/渐变布局。用户明确指定风格或已有 HTML 设计必须优先遵守。
- Agent 工具 `dodo-database.custom.reference({topic:"design"})` 提供
  视觉设计、自我检查与界面文案指南；
  `reference({topic:"themes"})` 提供 10 组可选主题色及 CSS 语义令牌、
  主题统一和 ECharts 色彩使用；**不会强制询问主题或固定套模板**。
- `reference({topic:"builder"})` 根据交互复杂度在原生 HTML/JS 与
  React + TypeScript + Tailwind/shadcn 之间选择；只有当前环境确实提供
  Node/构建工具时才走复杂构建路线，最终保存的仍是**单份完整 HTML**，
  不依赖另一个开发服务器和未打包 JS/CSS。
- 构建参考还包含避免重复初始化数据库数据、异步刷新竞态、
  `row.id` 去重与真实分页统计，防止同一批数据被重复追加。
  继续保留 iframe 无沙箱的可信代码风险说明。

### 无需构建的 UI 组件

插件随包提供 Basecoat 1.1.0 和 Web Awesome 3.14.0 的浏览器发行资源，
位于 `/plugins/siyuan-dodo/vendor/custom-view/`。Agent 直接生成引用本地 CSS/JS
的 HTML，不需要 Node、React、Tailwind 编译器或额外项目，也不依赖 CDN。
资源不会默认注入所有页面；每个页面按需引用所选组件库。

- 默认使用 Basecoat：`dodo-database.custom.reference({topic:"basecoat"})`，
  提供本地资源路径、自定义 Select、弹窗和表单说明。
- 可选 Web Awesome：`reference({topic:"web-awesome"})`，
  提供 `wa-*` 标签、自动加载器、就绪等待与当前版本的事件说明。
- 每页默认使用一套组件库；已有页面保留原选型。页面布局和数据获取仍使用
  普通 CSS 与现有 `dodoDB`，Skill 负责说明，组件 CSS/JS 负责运行。
- Web Awesome 提供免费组件；额外命名图标可能访问外部服务，离线页面使用
  内联 SVG 或本地图标。内置系统图标无需联网。

两套参考中的完整 HTML 示例由
`python scripts/test-database-custom-ui-browser.py` 在实际 `iframe.srcdoc`
中验证；测试仅使用本地静态资源，不读写思源笔记。

### 字段兼容性

读取覆盖原生主键和 17 种属性字段：文本、数字、单选、多选、日期、资源、
复选框、链接、邮箱、电话、位置、模板、关联、汇总、行号、创建时间、更新时间。
每条记录包含 `values`（强类型值）、`displayValues`（显示文本）、
`valueDetails`（单选颜色、关联标题、汇总子项等详情）；复杂字段保留
原生必要结构，不强行转换为无意义的单个字符串。
资源列图片直接用 `assets/...` URL 显示；其它类型附件可以由用户自己编写可信 HTML 进行展示。
`dodoDB` SDK 的写入类型仍限制为文本、数字、复选框，但同源 HTML 代码并不受 SDK 权限开关隔离。

Plugin Skill 不能只放在 `data/plugins/siyuan-dodo/skills/`：
插件加载时将调用与 Excalidraw 相同的 `SiYuanSkillRuntime.registerPluginSkill`，
把 `dodo-custom-view` 安装到思源 Agent 真正的发现目录
`data/storage/ai/agent/skills/dodo-custom-view/`。

## 安全边界与限制

- HTML 作为**无沙箱**的同源 `iframe.srcdoc` 加载，不设置 `sandbox` 属性，也不额外注入 CSP。
  页面可以访问宿主 DOM、同源资源、`fetch` 和思源内核接口。
- Dodo Bridge 仍验证来自哪个 iframe、哪个 AV 和 SDK 写入权限，但
  **这只约束 `dodoDB` 调用，不能限制页面自行访问思源 API**。
- Agent 自动生成的 HTML、第三方脚本和外部资源在保存运行前必须经过用户审核；
  不能将“SDK 写入权限已关闭”理解为 HTML 的实际只读隔离。
- `dodoDB` 暂不支持数据库结构编辑及关联/附件等复杂字段写入；可信 HTML
  是否直接使用内核其他接口，需要用户自行评估。
- 未实现自动截图质量评估；Agent 的 HTML 保存成功并不代表视觉布局没有瑕疵。

## 验证

```powershell
node scripts/test-database-custom-view.mjs
node scripts/test-database-native-view-reconcile.mjs
node scripts/test-database-custom-lifecycle.mjs
node scripts/test-database-custom-data.mjs
node scripts/test-database-custom-all-field-types.mjs
node scripts/test-dodo-custom-view-skill.mjs
python scripts/test-database-custom-browser.py
node scripts/test-database-view-core.mjs
node scripts/test-visual-view-registry.mjs
node scripts/test-native-database-views.mjs
pnpm exec vite build --config vite.config.ts
```

浏览器隔离测试使用内存模拟数据，不修改真实思源数据库。实际 SiYuan 的新增、写入、载入和云同步必须在用户数据库副本中验证。

如思源 Agent Skill 列表未刷新，重新加载插件或 Agent；仅复制
`data/plugins/siyuan-dodo/skills/` 不会被 Agent 识别。
开发环境可显式运行 `node scripts/register-dodo-custom-view-skill.mjs`
验证/修复 Skill 在真实 Agent 目录中的安装（仅限本机用户授权的思源工作空间，
并尊重已有 Skill 的管理者清单）。
正式插件加载时则始终使用
`createSiYuanSkillRuntime(...).registerPluginSkill("skills/dodo-custom-view")`。
该运行库在插件版本相同时不会重复覆盖用户自定义过的 Skill 文件；
后续发布修改 Skill 内容时需要同步升级插件版本号。
