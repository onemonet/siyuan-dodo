# 资源图标文件

这个目录包含预览页面使用的文件类型图标。

## 文件列表

| 文件 | 用途 |
|------|------|
| excel.svg | Excel 文件图标（.xlsx, .xls） |
| word.svg | Word 文件图标（.docx, .doc） |
| powerpoint.svg | PowerPoint 文件图标（.pptx, .ppt） |
| pdf.svg | PDF 文件图标（.pdf） |
| file.svg | 通用文件图标（默认） |
| download.svg | 下载图标 |

## 使用方式

在预览页面中通过绝对路径引用：

```javascript
// Constants.js
export const FILE_ICONS = {
  xlsx: "/plugins/siyuan-dodo/asset/excel.svg",
  xls: "/plugins/siyuan-dodo/asset/excel.svg",
  // ...
};
```

```html
<!-- index.html -->
<img src="/plugins/siyuan-dodo/asset/excel.svg" alt="Excel">
```

## 注意事项

1. **路径格式**：必须使用绝对路径 `/plugins/siyuan-dodo/asset/xxx.svg`
2. **插件名称**：路径中的插件名称必须与 `plugin.json` 中的 `name` 字段一致
3. **构建配置**：`vite.config.ts` 已配置自动复制此目录到输出目录

## 构建配置

在 `vite.config.ts` 中配置：

```typescript
viteStaticCopy({
  targets: [
    {
      src: "./public/**",
      dest: "./",
    },
  ],
})
```

这样在构建时会自动将 `public/asset` 目录复制到输出目录的 `asset` 文件夹。
