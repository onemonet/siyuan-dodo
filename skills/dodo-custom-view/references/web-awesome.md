# Web Awesome: optional no-build Web Components

Use when the user chooses Web Awesome, the page already uses `wa-*` elements, or these components fit the requested interaction. Dodo ships the free **3.14.0** browser distribution (MIT), including its module dependencies and themes. All paths below are local; no npm, React, compilation, CDN or separate project is needed.

## Local resources and readiness

```html
<link rel="stylesheet" href="/plugins/siyuan-dodo/vendor/custom-view/webawesome/3.14.0/styles/themes/default.css">
<script type="module" src="/plugins/siyuan-dodo/vendor/custom-view/webawesome/3.14.0/webawesome.loader.js"></script>
```

The autoloader loads the `wa-*` components used in this iframe, including dynamically inserted ones. The theme provides component tokens; page layout stays ordinary CSS. Set `lang="zh-CN"` on `<html>` for Chinese localization. Choose the iframe's `wa-light` or `wa-dark` class for an explicit palette. Customize through documented CSS properties and `::part(...)`, since the controls use Shadow DOM. Existing page CSS does not automatically style their internal buttons.

Module registration is asynchronous. Await `customElements.whenDefined(tag)` before setting custom properties or invoking methods; await `element.updateComplete` if its rendered DOM is needed. The pinned Select emits **`change`** and `input` (not `wa-change`); read `select.value`. The pinned Dialog opens with **`dialog.open = true`**, and a footer button can use `data-dialog="close"`. Use the pinned APIs rather than guessing from older Shoelace examples.

## Working Select and dialog example

```html
<!doctype html>
<html lang="zh-CN" class="wa-light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/plugins/siyuan-dodo/vendor/custom-view/webawesome/3.14.0/styles/themes/default.css">
  <script type="module" src="/plugins/siyuan-dodo/vendor/custom-view/webawesome/3.14.0/webawesome.loader.js"></script>
  <style>
    body { margin:0; padding:20px; font-family:system-ui,"Microsoft YaHei",sans-serif; }
    .toolbar { display:flex; align-items:end; flex-wrap:wrap; gap:12px; }
    #sort { width:180px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <wa-select id="sort" label="排序" value="title">
      <wa-option value="title">书名</wa-option>
      <wa-option value="recent">最近阅读</wa-option>
      <wa-option value="rating">评分</wa-option>
    </wa-select>
    <wa-button id="open-details" appearance="outlined">查看说明</wa-button>
  </div>
  <output id="selection" aria-live="polite">title</output>
  <wa-dialog id="details" label="排序说明">
    <p>对已加载记录排序；未加载部分不计入本页统计。</p>
    <wa-button slot="footer" id="close-details" data-dialog="close">关闭</wa-button>
  </wa-dialog>
  <script type="module">
    await Promise.all(['wa-select','wa-option','wa-button','wa-dialog'].map(tag => customElements.whenDefined(tag)));
    const sort = document.querySelector('#sort');
    sort.addEventListener('change', () => {
      document.querySelector('#selection').textContent = sort.value;
      // Re-render real loaded records using this sort value.
    });
    document.querySelector('#open-details').onclick = () => {
      document.querySelector('#details').open = true;
    };
  </script>
</body>
</html>
```

The example's options are UI choices, not sample database records. Feed actual page content through the existing `dodoDB` SDK/paginator. Keep loading, error, refresh and write feedback in the page; UI components do not manage AV data.

## Bundled scope

The local distribution includes free Button, Input, Select/Option, Dropdown/Dropdown Item, Dialog, Tooltip, Popover, Checkbox, Switch, Tabs (`wa-tab-group`/`wa-tab`/`wa-tab-panel`), and other free browser components. Pro-only components such as Combobox, Date Picker and Data Grid are not provided. Reuse SiYuan's ECharts for charts.

Component-internal system icons are embedded and work offline. For additional page icons prefer inline SVG; `<wa-icon name="...">` with the default library may fetch Font Awesome externally. A named icon is not guaranteed to be available offline. Use a trusted local SVG via `src` if you need `wa-icon`.

Prefer one component library per page. Keep existing user-selected styling and use plain CSS for layout; Basecoat's global styles are unnecessary for a Web Awesome page. Reuse actual field keyIDs and valid SDK writes. For dynamic record labels/options set `textContent` rather than interpolating cell values into HTML.

Reference: [installation](https://webawesome.com/docs/), [Select](https://webawesome.com/docs/components/select/), [Dialog](https://webawesome.com/docs/components/dialog/). For additional controls check documentation against the bundled **3.14.0** APIs and use the local loader above.
