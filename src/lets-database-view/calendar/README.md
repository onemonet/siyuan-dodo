# FullCalendar — 思源数据库日历视图

- FullCalendar 7.1.3 / temporal-polyfill：通过 esbuild 打包 JS/CSS 至 `preview/calendar`，无运行时 CDN 依赖。随插件产物分发 FullCalendar MIT 授权。
- 在原生数据库顶部“选择展示方式”中选择“日历”；同一 viewID 切换表格、地图、图表、时间线、甘特、日历，配置存储仍为 `custom-dodo-views`，不复制任务数据。
- 右侧下拉菜单可切换月、周、日、日程列表，旁有前后导航及“今天”；日期显示遵循思源原生本地时区。
- 日历设置支持主键或文本标题、开始日期、可选结束日期、选项颜色和默认视图。日期范围由原生数据库保存；没有日期的条目不显示。
- 点击事件通过现有 `openMapItem` 打开对应原生块或数据库条目。拖拽和拉伸事件经 iframe postMessage、视图 ID / revision 验证后由宿主调用公共 `core/schedule-write.ts` 的 `saveScheduleChange` 写回；数据变更后从内核重新读取，出错回滚 UI。日历的日期模型、字段解析与设置直接使用公共 schedule 模块，不依赖甘特视图。
- 全天任务与精确到分钟的日程分别处理：思源日期范围的末日为包含式，FullCalendar 的结束为不包含式；跨类型拖动禁止自动将全天变为有时间，或反之。
- 采用 iframe 独立样式及稳定的 AV 兄弟节点宿主，避免思源更新单元格时重建 iframe。内容高度通过 ResizeObserver 适应。
- 测试：`pnpm test:calendar`（时间语义、字段绑定、导航 ID、存储配置、离线资源）；`node scripts/test-native-database-views.mjs` 和 `node scripts/test-database-view-feature-settings.mjs`（全视图与功能开关）。

说明：尚需在真实思源 GUI 中手动确认交互观感和实际数据库拖放写入；自动测试使用模拟 AV 数据，不写用户真实笔记。


## 创建日程（Notion Calendar 风格）

月、周、日视图拖动框选日期或时间范围，会在对应网格保留临时日程块，
并显示小型名称输入框；点击空白日期或时间槽不会新建日程。
点击“创建”或按 Ctrl+Enter 经 dodoCalendarCreate 消息交给宿主，
由 /api/av/appendAttributeViewDetachedBlocksWithValues 一次性向原生
思源数据库写入主键标题和映射的日期列；失败显示原因并保留草稿。
“更多选项”提供可手动调整全天、开始、结束的完整表单。
全天日程 FullCalendar 的 end 是排他日期，写入 SiYuan 要减一天；
有时分的日期使用本地时间戳并保留分钟精度。

单元及 Chromium 回归：
node scripts/test-database-calendar-create.mjs、
python scripts/test-database-calendar-stability.py。

## 中文输入法

日历新建的普通 Enter 永远不会触发保存（包括浏览器的隐式 form submit）。
按 Enter 确认中文输入法候选词时由输入法自行处理，不拦截默认确认行为。
点击「创建」或按 Ctrl+Enter 才能向思源原生数据库写入。
新建栏完全不使用 HTML form 元素，仅使用按钮的 click 事件或 Ctrl+Enter 保存。
任何普通 Enter 都不被 preventDefault（允许不同输入法正常确认候选词），
但键盘事件不会传播到 FullCalendar 的全局快捷键处理器。
