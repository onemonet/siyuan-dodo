# 自定义块 (lets-custom-block)

## 简介

自定义块插件是思源笔记的一个子插件，提供**通用功能块系统**。通过自定义属性 `custom-dodo-block` 标记块类型，实现各种增强功能。

## 已支持的功能

### Math 计算器

| 特性 | 说明 |
|------|------|
| 触发方式 | 斜杠菜单 `/计算器` 或手动设置属性 `custom-dodo-block="math"` |
| 适用块类型 | 段落块 (NodeParagraph) |
| 结果显示 | CSS 伪元素 `::after` 在表达式右侧显示 `= 结果` |

### 图表块 (chart)

在表格块 / 数据库块旁插入独立图表块（思源原生 echarts 代码块 + 来源属性），数据与视图分离；⚙ 悬浮设置面板支持图表类型 / X 轴 / Y 轴 / 风格色卡，来源变更自动刷新，斜杠指令 `/dodo图表` 快捷创建。详见 [chart/README.md](chart/README.md)。

### 地图块 (map)

斜杠菜单 `/dodo地图` 或 `/地图块` 创建独立地图块；也可右键数据库块 →「插入地图块」。来源块后一行使用斜杠时自动绑定来源，其余位置可先创建空地图。

悬停地图块点 ⚙，设置**来源块 ID**与**字段映射**。坐标字段**只允许选择原生位置（location）类型列**，读取该列的 `longitude`、`latitude`（WGS84）；空值、仅地点名或越界坐标会跳过。图片字段**只允许选择资源（mAsset）类型列**，只呈现有效的图片资源；未映射、非图片资源或空资源时显示主键文字。**地图标题固定取数据库主键（block）列**，无需标题映射（旧版标题映射自动忽略）。点击地点可查看该行内容。「刷新」重新读取字段列表，清空来源 ID 可解绑。

地图块右上角的 **「添加地点」** 在设置按钮左侧，点击后变为 **「关闭」** 并进入标记模式。此时底图鼠标光标切换为十字准星（+），左下角只显示「标记模式」；仍可照常拖动和缩放底图，单击非现有标记的地图位置会调用高德 Web 服务逆地理编码：优先取 100 米内的 POI 名称，否则取完整地址；失败时不创建条目。成功则在地图绑定的数据库中创建**独立（未绑定文档）条目**，将名称同时写入主键与已映射原生位置（location）字段的 `name`，并写入 WGS84 `longitude`、`latitude`；新增后退出标记模式、刷新地图并打开思源原生数据库条目详情页。刷新只更新标记，**不再自动缩小/移动视角**；每张地图将中心点和缩放级别缓存在当前会话中，返回原地图页签或重建 iframe 时恢复之前视角。需要在地图全局设置中配置支持 Web 服务逆地理编码的高德 Key；高德瓦片和 JS API 的 GCJ-02 坐标会先逆转为 WGS84 再写入思源。再次点击关闭按钮可取消后续标记（已提交创建的请求不能撤销）。

**单点右键菜单**：右键点击地图的一个地点标记可以选择「矫正位置」或「删除」。矫正后鼠标变为十字准星，可拖动、缩放，再点击地图新位置，将原生位置列的 WGS84 经度、纬度更新到该条目；不会修改主键、地点名称或绑定文档。按 `Esc` 可取消矫正。删除前有确认弹窗，通过思源 `/api/av/removeAttributeViewBlocks` 移除数据库行和其位置单元格（包括经纬度）；对绑定文档的行仅解除数据库关联，**不会删除原文档**。多点聚合标记不提供直接右键操作，以免误删其他条目。

地图点（文字或图片）底部有倒三角，尖端指向所用地点的精确坐标；聚合点以其代表点的真实坐标为锚点。**单点悬浮**显示最多 20 字的主键标题，点击在思源新页签中打开：已绑定文档的记录进入 `value.block.id` 指向的真实文档；未绑定文档的独立记录进入思源原生 `siyuan-database-row` 数据库条目详情页（需提供数据库 avID、载体块 ID、itemID、主键 valueID 和笔记本 ID），不创建新文档。**聚合点悬浮不显示任何预览**，只有点击聚合点时才显示一行一个的可点击主键标题，单行最多 20 字；可视区域最多 8 行，其余条目在悬浮层内滚动，各行打开各自的文档或数据库详情。数据库条目 ID `row.id` / `value.blockID` 不等于实际绑定文档 ID，不能直接传给 `openTab({doc:{id}})`。

支持数据库当前视图，空数据库仍能选择字段。来源在当前文档中变更时自动刷新，重新打开文档也会读取最新内容；只更新地图显示，不重写块内容。使用随插件打包的 Leaflet 1.9.4，OpenStreetMap 底图需要联网。GCJ-02 / BD-09 坐标请先转换为 WGS84。

属性：`custom-dodo-block="map"`、`custom-dodo-map-source`（来源块 ID）、`custom-dodo-map-config`（包含 `fieldMapping.coordinate` / `image` 的 JSON；读取旧版 `coordinateColumn` / `imageColumn`，不再保存标题映射）。

### SQL块 (sql)

SQL块本体是思源原生查询嵌入块，使用 `custom-dodo-block="sql"` 标记，不绑定来源块 ID。斜杠菜单 `/dodoSQL` 或 `/SQL块` 可在当前块后插入 SQL块；右上角设置入口支持按内容关键词、块类型、自定义属性名（精确或前缀）、排序和数量可视化生成 SQL，并自动更新原生嵌入块。默认查询 `blocks` 表并排除 `query_embed`；启用自定义属性后联查 `attributes`，可按属性值排序。

### 时间线预览 (timeline)

在表格块 / 数据库块旁插入独立时间线预览块（iframe + 来源块 ID 属性，基于 timeline3）：右键来源块 → 「插入时间线预览块」，或在来源块后一行输入 `/dodo时间线`；悬停时间线块点 ⚙ 打开悬浮设置面板（来源块绑定 / 折叠源块 / 外观 / 字段映射），来源变更约 1 秒内自动重新加载（内容未变化时不会产生写入）。表格来源支持 8 个字段：标题、开始时间（必需）、结束时间、说明、分组、显示日期、媒体、背景颜色；数据库来源按当前视图字段映射（date 字段带结束值时自动生成时间段事件）。表头自动识别规则与各列格式详见 [timeline/README.md](timeline/README.md)。

### 相册块 (gallery)

将普通块直接替换为独立相册 iframe，使用 Muuri 渲染响应式网格。相册不保存原块备份，也不绑定来源块；图片按顺序保存在 `custom-data-assets-backup-0`、`custom-data-assets-backup-1` 等属性中，布局保存在 `custom-dodo-gallery-config` JSON 属性中。相册支持空状态，编辑态可上传图片、添加图片链接和删除图片；本地 `assets/...` 路径按未转义中文保存。旧文件块图册可通过块菜单迁移为新相册块。

### 文件块 (file)

将普通块替换为文件块 iframe，允许先创建空块，再在 iframe 或设置面板中上传、拖入或粘贴一个受支持文件。块使用 `custom-dodo-block="file"` 标记，文件路径保存为 `custom-data-assets-backup-0`；不保存原块备份，也不提供原块还原。右上角设置入口和块菜单支持复制 Markdown，用户可手动粘贴回普通块。文件块的 iframe 资源桥接由自定义块内置运行时提供。

---

## 计算能力

### 一、数学计算

基于 Math.js 引擎，支持以下运算：

#### 1. 基础运算
| 示例 | 结果 |
|------|------|
| `1 + 2` | 3 |
| `10 / 3` | 3.333333 |
| `2 ^ 10` | 1024 |

#### 2. 数学函数
| 函数 | 示例 | 说明 |
|------|------|------|
| `sqrt(x)` | `sqrt(16)` → 4 | 平方根 |
| `pow(x, y)` | `pow(2, 8)` → 256 | 幂运算 |
| `sin/cos/tan` | `sin(pi/2)` → 1 | 三角函数 |
| `asin/acos/atan` | `asin(1)` → 1.570796 | 反三角函数 |
| `sinh/cosh/tanh` | `sinh(1)` → 1.175201 | 双曲函数 |
| `ln(x)` | `ln(e)` → 1 | 自然对数 |
| `log10(x)` | `log10(100)` → 2 | 常用对数 |
| `log(x, base)` | `log(8, 2)` → 3 | 任意底对数 |
| `exp(x)` | `exp(1)` → 2.718282 | 指数函数 |
| `abs(x)` | `abs(-5)` → 5 | 绝对值 |
| `floor/ceil/round` | `floor(3.7)` → 3 | 取整 |
| `cbrt(x)` | `cbrt(27)` → 3 | 立方根 |
| `sign(x)` | `sign(-5)` → -1 | 符号函数 |
| `factorial(n)` | `factorial(5)` → 120 | 阶乘 |
| `gcd(a, b)` | `gcd(12, 8)` → 4 | 最大公约数 |
| `lcm(a, b)` | `lcm(12, 8)` → 24 | 最小公倍数 |
| `random()` | `random()` → 0.123... | 随机数 |

#### 3. 常量
`pi`, `e`, `phi`, `NaN`, `Infinity`

#### 4. 科学计数法
`1.23e5` → 123000

#### 5. 单位换算
支持长度、质量、时间、速度、力、能量、功率、温度、角度等物理单位的自动换算：

| 示例 | 结果 |
|------|------|
| `100 km to mile` | 62.137119 mile |
| `9.81 m/s^2 * 100 kg * 40 m` | 39.24 kJ |
| `100 degC to degF` | 212 degF |

---

### 二、日期计算

日期计算器优先于数学计算器执行，专门处理日期相关表达式。

#### 1. 相对日期

| 关键字 | 含义 |
|--------|------|
| `今天` / `today` | 当天 |
| `明天` | +1 天 |
| `昨天` | -1 天 |
| `后天` | +2 天 |
| `前天` | -2 天 |
| `大后天` | +3 天 |
| `大前天` | -3 天 |

#### 2. 日期加减

格式：`"YYYY-MM-DD" + N 单位` 或 `"YYYY-MM-DD" - N 单位`

| 示例 | 结果 |
|------|------|
| `"2024-01-01" + 7 days` | 2024-01-08 |
| `"2024-12-31" - 7 days` | 2024-12-24 |
| `"2024-01-01" + 1 months` | 2024-02-01 |
| `"2024-01-01" + 1 years` | 2025-01-01 |
| `"2024-01-01" + 2 weeks` | 2024-01-15 |
| `"2024-01-01" + 12 hours` | 2024-01-01 |

**支持单位**：`days`、`hours`、`minutes`、`weeks`、`months`、`years`

#### 3. 日期差值

格式：`"YYYY-MM-DD" 到 目标日期`（也可用 `至`、`~`、`to`）

| 示例 | 结果 |
|------|------|
| `"2024-01-01" 到 今天` | X年X个月X天（共X天） |
| `"2024-01-01" 到 明天` | X年X个月X天（共X天） |
| `"2020-01-01" 到 "2024-06-15"` | 4年5个月14天（共1627天） |

#### 4. 中文单位

中文单位会自动转换为英文单位，以下写法等效：

| 中文 | 英文 |
|------|------|
| `天` | `days` |
| `小时` | `hours` |
| `分钟` | `minutes` |
| `周` | `weeks` |
| `月` | `months` |
| `年` | `years` |

---

## 架构

```
lets-custom-block/
├── index.ts                  # CustomBlockPlugin - 主入口
├── plugin.ts                 # 插件元数据与设置
├── types.ts                  # 接口定义 (BlockquoteRule, BlockquoteHandler)
├── constants.ts              # 常量配置
├── chart/                    # 图表块（数据、生成、设置面板）
│   ├── README.md             # 图表块文档
│   ├── chart-block-service.ts   # 图表块服务：创建/刷新/设置
│   ├── echarts-generator.ts  # 表格数据 -> ECharts option
│   ├── table-parser.ts       # 表格 kramdown 解析
│   ├── data-validator.ts     # 数据校验
│   ├── chart-types.ts        # 图表类型配置
│   ├── types.ts              # 图表配置 schema
│   ├── ChartSettingsPanel.svelte # 设置面板
│   └── chart-settings-dialog.ts  # 设置悬浮窗
├── sql/                      # SQL块（原生查询嵌入块与可视化设置）
│   ├── sql-block-service.ts
│   ├── SqlSettingsPanel.svelte
│   └── sql-settings-dialog.ts
├── timeline/                 # 时间线预览（表格 -> 时间线 iframe）
│   ├── services/             # 转换 / 配置 / 渲染 / 模板等服务（field-mapping.ts 为字段定义权威出处）
│   ├── ui/                   # 时间线设置面板（TimelineSettingsPanel.svelte + 悬浮窗）
│   ├── iframe/               # iframe 运行时（timeline3 库 + 多语言）
│   ├── README.md             # 支持字段表 / 识别规则 / 格式说明
│   └── types.ts              # 时间线配置 schema
├── gallery/                  # 相册块（图片属性 -> Muuri iframe）
│   ├── iframe/                # 相册运行时与样式
│   ├── services/              # 相册转换、属性读写与旧块迁移
│   └── types.ts               # 相册配置 schema
├── core/
│   └── BlockquoteManager.ts  # 块管理器：注册、识别、分发
├── handlers/
│   └── MathParagraphHandler.ts  # Math 计算器处理器
├── calculators/
│   ├── index.ts              # 模块导出
│   ├── ICalculator.ts        # 计算器接口
│   ├── CalculatorFactory.ts  # 责任链工厂
│   └── MathCalculator.ts     # Math.js 表达式计算
├── utils/
│   ├── dom-helpers.ts        # DOM 工具函数
│   ├── mathjs-loader.ts      # Math.js 加载器
│   └── DateCalculator.ts     # 日期计算器
└── styles/
    └── blockquote.css        # Math 样式
```

## 扩展方式

新增功能块只需：
1. 在 `handlers/` 创建新 Handler 实现 `BlockquoteHandler` 接口
2. 在 `BlockquoteManager.registerDefaultHandlers()` 注册
3. 在 `constants.ts` 添加对应常量
4. 在 `styles/blockquote.css` 添加样式

## 设置项

设置页按块类型分组为独立卡片。每种类型的"菜单名称与触发词"为多行文本，每行一个菜单项，格式：`名称; 触发词1 触发词2`（触发词不含 `/`，多个触发词用空格分隔；也支持全角分号；以 `#` 开头的行忽略）。修改立即生效。

| 设置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| math-enabled | checkbox | true | 启用计算块 |
| math-slash-entries | textarea | `计算块; dodo计算块 计算块` | 计算块的菜单项与触发词 |
| toggle-enabled | checkbox | true | 启用折叠块 |
| toggle-slash-entries | textarea | `折叠块; dodo折叠块 折叠块` | 折叠块的菜单项与触发词 |
| chart-enabled | checkbox | true | 启用图表块 |
| chart-slash-entries | textarea | `图表块; dodo图表 图表块` | 图表块的菜单项与触发词 |
| chart-auto-refresh | checkbox | true | 来源表格变更时自动刷新图表 |
| chart-default-type | textinput | bar-basic | 插入图表块时默认使用的图表类型 |
| map-enabled | checkbox | true | 启用地图块 |
| map-slash-entries | textarea | `地图块; dodo地图 地图块` | 地图块的菜单项与触发词 |
| map-auto-refresh | checkbox | true | 当前文档中的来源变更时刷新地图 |
| timeline-enabled | checkbox | true | 启用时间线预览 |
| timeline-slash-entries | textarea | `时间线; dodo时间线 时间线` | 时间线的菜单项与触发词 |
| timeline-auto-refresh | checkbox | true | 来源表格变更时自动刷新时间线 |
| timeline-default-height | number | 520 | 新建时间线预览的默认 iframe 高度 |
| timeline-default-start-position | textinput | first | 时间线默认开始位置（first / last） |
| gallery-enabled | checkbox | true | 启用相册块 |
| gallery-slash-entries | textarea | `相册块; dodo相册 相册块` | 相册块的菜单项与触发词 |
| file-slash-entries | textarea | `文件块; dodo文件 文件块` | 文件块的菜单项与触发词 |

## 数据库字段 ID 绑定（公共层）

地图块、图表块、时间线统一使用 `core/av-field-binding.ts`。数据库适配器 `timeline/services/av-data-adapter.ts` 输出 `columnIds`、`columnNames`（原始列名）以及去重后的 `headers`，三种视图共用 `fieldSelectOptions` 下拉选项（显示当前表头名、保存 AV `keyID`）、`resolveFieldBinding`（优先严格解析 ID）和 `migrateFieldMapping`（仅在名称能唯一匹配时迁移旧配置）。重名列不猜测，旧 ID 对应字段删除或改为不允许的类型时不自动重新绑定。重建同名列不会继承旧 ID；请在设置中手动重绑。

- 地图：坐标字段必须是 `location`，图片字段必须是 `mAsset`；读取、渲染、添加与编辑位置统一走 keyID。
- 图表：数据库来源的 X 轴与 Y 轴分组字段保存 keyID；Markdown 表格来源仍保存表头名称。空数据库也提供列映射选项。
- 时间线：数据库来源的标题、日期、说明等映射按 keyID；日期结束时间虚拟列使用 `${dateKeyID}:end`；Markdown 表格仍按表头名称。
- 旧设置：打开设置面板时，只对可唯一匹配的旧列名进行自动升级并保存。重名、已删除或类型不符的列必须重新选择。真实数据库改名、调整列顺序后绑定继续有效，字段在当前视图中隐藏时需恢复该列可见性。

回归：`pnpm run test:map` 包括源 AV 映射、字段类型、同名列、不误绑定同名新列、名称及顺序变化，以及时间线虚拟结束日期列。
