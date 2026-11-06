# Excalidraw 通过思源 6806 在浏览器打开

Excalidraw 不再运行独立的 4177 Node/LAN 服务。浏览器入口直接复用思源内嵌编辑器与同一份 `assets/excalidraw-image-*.svg|png` 文件。

## 打开方法

1. 启动思源并启用 Dodo 工具箱的 Excalidraw 模块。
2. 在文档的 Excalidraw 图片右键菜单选择「在浏览器中打开 Excalidraw」，或在已打开的 Excalidraw 画板主菜单选择「在浏览器中打开」。
3. 访问类似以下链接：

```text
http://127.0.0.1:6806/plugins/siyuan-dodo/excalidraw/app/?imageURL=assets%2Fexcalidraw-image-xxxx.svg&lang=zh-CN&enableAutoSave=true
```

链接中的 `imageURL` 必须指向真实存在的思源 Excalidraw 附件。打开后直接读写思源附件；浏览器独立窗口、思源内嵌窗口共用文件，**不提供实时协作或冲突自动合并**。不要同时编辑同一画板；先保存并关闭一端，再打开另一端。

## 授权与设置

- 直接访问 6806 时，由思源负责身份验证；如出现「访问授权」，需在浏览器完成思源的授权。不能绕过授权。
- 思源服务必须运行。通过局域网 IP 打开时，思源网络访问设置及授权也需要正确配置；不要为了画板向公网暴露 6806，因为该端口包含完整思源服务和 API。
- 画板使用思源已有的附件保存与素材库 API，不会另起 HTTP 进程或额外端口。
- 工具栏和交互增强复用同一个 React 组件。浏览器初次打开读取现有插件偏好，但浏览器对工具栏的修改只写入本浏览器的 `localStorage`，不会覆盖正在运行的思源插件配置。

## 验证

`node scripts/test-excalidraw-browser-port.mjs` 检查链接、安全路径和浏览器模式偏好。再运行 `pnpm exec vite build --config vite.excalidraw.config.ts` 确认只构建共用编辑器与嵌入组件。
