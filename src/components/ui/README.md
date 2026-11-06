# Dodo 公共 UI（Svelte 4）

使用 [`bits-ui@0.22.0`](https://svelte-4.shadcn-svelte.com/docs/components/dropdown-menu) 提供已维护的交互语义，Dodo 负责在 `src/components/ui` 提供可复用、带思源主题变量的封装。不安装 React，不升级 Svelte 5，也不强制引入 Tailwind。

## NestedSelectMenu

`NestedSelectMenu.svelte` 是通用的两级选项菜单，接受 `options: NestedSelectOption[]`，每项包含稳定 `value`、显示 `label`、可选 `type` 和 `children`。有 `children` 的项目由 Bits UI 的 `Sub`、`SubTrigger` 和 `SubContent` 呈现为右侧二级菜单；没有 `children` 的项目直接选择。通过 `on:select` 事件返回 `{ value, subValue? }`，不耦合图表业务逻辑。

`Root` 的 portal 避免被思源设置弹窗的 `overflow:hidden` 裁切；Bits UI 处理子菜单定位、键盘方向键/Enter/Escape、焦点恢复、悬停和窗口外点击关闭。样式复用 `--b3-*` 思源主题变量，使用公共 `dodo-ui-nested-*` 类，新增消费者不应自行复制菜单状态管理。

图表 Y 轴把数值字段设为有 `children` 的项目（值、总和、平均数等），多选字段设为直接项目（固定计数）。图表维持多个 Y 列共用一个聚合方式，当前任何数字子菜单的选择会更新共享 `y.agg`，字段绑定仍是 keyID。X 轴保持原生 `b3-select`。

## 二级菜单可见性与事件（修复 2026-10-18）

Bits UI 0.22 子菜单的 DOM 在父菜单容器之内。**父菜单不能设置 `overflow-y:auto`**：CSS 会将横轴计算为 `auto`，导致子菜单被裁切，表现为出现不正常的横向/纵向滚动条且右侧菜单无法展开。公共 `dodo-ui-nested-content` 必须 `overflow:visible`，仅无嵌套子项的 `dodo-ui-nested-sub` 可以独立滚动。

Bits UI `Menu.Item` 内部 `m-click` 事件会经过 `createDispatcher` 转发成**公开的 `click`** 事件。消费者应监听组件的 `on:click`，**不要监听 `on:m-click`**，否则能看到子菜单但选择值不会保存。

使用独立 Svelte 4 + Chrome (Playwright) 真实交互冒烟测试验证：数字列悬停展开、点击「总和」返回列 ID 与聚合值、多选直接计数、ArrowRight 展开、Escape 关闭，均通过。

## FieldMapping / FieldSelect（2026-10-18）

`FieldMapping.svelte` 为 Dodo 公共的整组字段映射 UI：`definitions: FieldMappingDefinition[]`（`key/label/required/acceptedTypes`）、`table: FieldTable`（`headers/columnIds/columnNames/fieldTypes`）、`mapping: Record<string,string|undefined>`，以及 `restrictTypes`、`disabled`。`on:change` 返回 `{ field, value }`。按 `acceptedTypes` 限定字段类型，在左侧显示名称及红色必填 `*`、右侧复用 `FieldSelect.svelte`。字段 keyID 仍是唯一存储依据，旧字段名仅在能唯一解析时作为已选显示；失效/类型不匹配的旧字段提示重新选择，不自动猜测。

`FieldSelect.svelte` 是可独立使用的 Bits UI 0.22 单级下拉，支持列类型原生 SVG 图标、自动选择、选中对勾、键盘焦点/Esc、体外 portal 和思源主题。公开属性：`options: FieldSelectOption[]`（`value/label/type`）、`value`、`invalidLabel`、`placeholder`、`ariaLabel`、`disabled`；`on:change` detail 是所选 keyID 或空字符串。菜单无二级子菜单，允许列表纵向滚动；与 `NestedSelectMenu` 带有子菜单的必须 `overflow:visible` 规则不同。

`av-column-icons.ts` 中 `siyuanAvIcon(type)` 映射严格遵循思源原生源码 `app/src/protyle/render/av/col.ts#getColIconByType`：例如 `block→#iconKey`、`date→#iconCalendar`、`number→#iconNumber`、`select→#iconListItem`、`mSelect→#iconList`、`mAsset→#iconImage`。直接引用宿主全局图标 sprite，不打包额外 SVG，颜色跟随思源主题。原生 `<select><option>` 不支持可靠的 SVG 图标，故使用 Bits UI 菜单。

当前已由数据库时间线与独立时间线共用这一套映射界面。图表/地图以后可逐步接入，不应复制一套新的组件。真实 Chrome 冒烟验证通过：日期下拉只列出符合类型的日期列，SVG `#iconCalendar`、主键 `#iconKey`、必填星号、选择后返回稳定 keyID、Esc 关闭菜单。

## 字段映射统一和「单选」实心图标修复（2026-10-18）

SiYuan `app/src/protyle/render/av/col.ts#getColIconByType("select")` 使用 `#iconListItem`。该 SVG **仅有实心 path，没有描边**，因此原版 `FieldSelect.svelte` 的统一 `fill:none` 导致单选图标不可见。修复在 `av-column-icons.ts#siyuanAvIconIsSolid` 标识实心类型，并为 `FieldSelect` 的已选列/列表列项与 `NestedSelectMenu` 原生图标提供兼容的填充 CSS。图表历史 `:global(svg *) {fill:none!important}` 已明确排除原生 AV 图标。Chrome 使用真实 SiYuan `iconListItem` symbol 实测：`fill=rgb(34,34,34)`、`stroke=none`，显示图标并可返回稳定 keyID。

字段映射消费者现在包括：独立时间线 + 数据库时间线（`FieldMapping`）；独立地图块 + 数据库地图视图（`FieldMapping`，坐标只允许 location、图片只允许 mAsset）；图表 X 轴、分组（`FieldSelect`），Y 轴和多 Y 数值列保留复合的 `NestedSelectMenu`（数字列带聚合子菜单、mSelect 即时计数），菜单选项统一显示 SiYuan AV 原生列类型图标。普通排序、颜色、显示范围、非数据库文件/图库/SQL 选项不是数据库列映射，无需强行加列类型图标。

## 字段自动初始化规则（2026-10-18）

字段绑定没有「自动」菜单项。数据库视图第一次启用、独立块首次获得数据库来源时，后台按字段允许的类型取第一列（时间线标题优先原生主键 `block`，图表主 Y 优先数字 `number`，其次多选 `mSelect`），**立即写入实际 keyID**。各个未命中字段写空字符串作为明确「不使用」，必填字段显示「请选择字段」且不可选择空。无论之后源列改名、排序、新增或删除，正常读取只用 keyID；丢失的 keyID 保留为失效绑定提示，不按同名/类型重绑。仅旧配置迁移时，可对唯一无歧义的列名转成 ID 并保存一次；不成功保留原值供用户手动处理。仅用户明确更换源数据库时重新初始化。

`FieldMapping.svelte` 的必填状态控制 `FieldSelect.allowEmpty`，可选下拉的空项显示「不使用」。图表的 Y 轴聚合菜单另行保留其原有业务行为。

## 选择「不使用」后必须立即更新（2026-10-18）

`FieldMapping.svelte` 不得只在 `selectedValue(field)` 这样的内部函数里间接读取 `mapping`，否则 Svelte 4 模板不会追踪该 prop 变化：用户选择「不使用」时 `on:change` 已返回 `""`，父组件也会保存空值，但下拉框仍错误显示旧列。现在模板显式传入 `mapping?.[field.key] || ""`、`table`、`restrictTypes`，让选中值、原字段失效提示与类型过滤在更新时重新计算。

真实 Chrome 冒烟实测了「已绑定封面 → 不使用 → 重新绑定封面 → 不使用」的完整往返、空字符串 `on:change` 事件和 JS console，全部通过。数据库原生视图保存后还需使用原有的保存按钮；独立地图/图表/时间线维持各自现有的保存流程。

## 字段名旁的信息 Tooltip（2026-10-18）

`FieldHelp.svelte` 提供 `#iconInfo` 信息按钮，保留思源主题颜色变量，但**不使用** `b3-tooltips` 伪元素显示提示：设置弹窗及字段映射位于 `overflow: auto` 容器内，伪元素会被裁切。现在提示浮层追加到 `document.body`，以 `position: fixed` 显示；左右视口边缘自动收边，顶部空间不足时翻到下方。键盘焦点同样可以触发，滚动/窗口缩放自动重新定位，失焦/鼠标移出/组件卸载会移除浮层并解除监听。标签文字、16px 信息图标统一以 flex 的中线对齐。`FieldMapping.svelte` 读取字段定义的可选 `description`，在左侧字段名后显示按钮，右侧下拉和 `change` 事件不变。时间线全部十个字段、地图坐标/图片两个字段提供了简洁描述。时间线来源/外观设置也复用该组件。字段说明只是前端展示，不参与 keyID、列类型、保存或渲染逻辑。
