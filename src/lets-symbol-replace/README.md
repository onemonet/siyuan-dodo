# 符号自动替换

这个模块在思源正文编辑区监听输入，把光标前命中的触发文本替换为常用符号。默认规则：

```text
-> | →
-》 | →
```

## 文件分工

- `plugin.ts`: 插件元数据和设置页配置。
- `rules.ts`: 规则文本解析、去重、最长匹配。
- `index.ts`: 编辑区输入监听、光标上下文判断、Range 替换。

## 设置格式

设置页里的“规则”是一行一条：

```text
触发文本 | 替换文本
```

旧版使用 `=>` 或 Tab 的规则仍可解析，插件加载时会自动转换为 `|` 分隔并保存。

空行和 `#` 开头的行会忽略。重复触发文本只保留第一条。规则会按触发文本长度倒序匹配，所以 `-->` 会优先于 `->`。

## 运行流程

1. 插件加载时读取 `symbolReplace.rulesText` 和 `symbolReplace.skipCode`。
2. 监听 `input`、`compositionstart`、`compositionend`。
3. 输入法组合期间不处理，组合结束后再检查一次。
4. 只在 `.protyle-wysiwyg` 下的 `div[contenteditable='true']` 生效。
5. 默认跳过代码块、行内代码、`code`、`.hljs` 内部。
6. 每次输入只读取光标前最长触发文本长度，不扫描整篇文档。
7. 命中规则后选中触发文本，优先用 `document.execCommand("insertText")` 替换，以尽量保留编辑器撤销栈。

## 测试

规则解析测试在：

```text
tests/unit/symbol-replace-rules.test.ts
```

运行：

```bash
node scripts/test-symbol-replace.mjs
```

如果 PowerShell 拦截 `npm.ps1`，使用 `npm.cmd`。

## 扩展点

- 新增普通替换规则：直接改设置页规则文本。
- 新增默认规则：改 `DEFAULT_SYMBOL_REPLACE_RULES_TEXT`。
- 新增规则语法：优先改 `rules.ts`，并补 `symbol-replace-rules.test.ts`。
- 改编辑器生效范围：改 `EDITABLE_SELECTOR`、`CODE_SELECTOR` 或 `getEditableFromRange`。

跳过了正则规则和复杂规则编辑器。等纯文本规则不够用时再加。
