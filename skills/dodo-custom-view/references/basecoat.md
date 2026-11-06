# Basecoat: default no-build controls

Use for styled HTML buttons, inputs, custom selects, menus, popovers, tabs and toasts. Dodo ships Basecoat **1.1.0** (MIT). The following files are already installed with the plugin; write HTML directly and save it with `save_source`. No installation or build command is needed.

## Local resources

```html
<link rel="stylesheet" href="/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/basecoat.cdn.min.css">
<script defer src="/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/js/basecoat.min.js"></script>
<script defer src="/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/js/select.min.js"></script>
```

The first JS file is the runtime; load it once, before individual component scripts. Available individual scripts: `select`, `dropdown-menu`, `popover`, `tabs`, `toast` (all end in `.min.js`). For several interactive components, replace the individual scripts **and runtime** with `/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/js/all.min.js`. Choose either form, not both. CSS-only buttons/inputs and native `<dialog>` do not need Basecoat JS.

This is the precompiled standalone CSS. It includes component styles and a limited set of utilities, not every Tailwind utility. Write layout/size overrides in a normal `<style>` after the library CSS; do not load a Tailwind browser compiler. The stylesheet contains base styles, so check existing page typography when adding it. Keep the page's chosen visual direction. Basecoat uses semantic tokens such as `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--border` and `--ring`; override them after the library CSS to match the page. Add the `dark` class on the iframe's `<html>` for its dark palette when appropriate.

## Working Select and dialog example

This is an interaction example, not a database layout or invented records. The sorting values are page UI choices; bind them to the real records from `dodoDB`.

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/basecoat.cdn.min.css">
  <script defer src="/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/js/basecoat.min.js"></script>
  <script defer src="/plugins/siyuan-dodo/vendor/custom-view/basecoat/1.1.0/js/select.min.js"></script>
  <style>
    body { margin:0; padding:20px; font-family:system-ui,"Microsoft YaHei",sans-serif; }
    .toolbar { display:flex; align-items:end; flex-wrap:wrap; gap:12px; }
    #sort { width:180px; }
    #sort-label { display:block; margin-bottom:6px; }
    #sort > button { width:100%; }
    #details > div { max-width:min(420px,calc(100vw - 32px)); }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <label id="sort-label">排序</label>
      <div id="sort" class="select">
        <button type="button" id="sort-trigger" aria-labelledby="sort-label sort-value" aria-haspopup="listbox" aria-expanded="false" aria-controls="sort-list">
          <span id="sort-value">书名</span><span aria-hidden="true">⌄</span>
        </button>
        <div data-popover aria-hidden="true">
          <div role="listbox" id="sort-list" aria-labelledby="sort-label">
            <div role="option" data-value="title" aria-selected="true">书名</div>
            <div role="option" data-value="recent">最近阅读</div>
            <div role="option" data-value="rating">评分</div>
          </div>
        </div>
        <input type="hidden" name="sort" value="title">
      </div>
    </div>
    <button class="btn" data-variant="outline" id="open-details" type="button">查看说明</button>
  </div>
  <output id="selection" aria-live="polite">title</output>
  <dialog id="details" class="dialog" aria-labelledby="details-title">
    <div>
      <header><h2 id="details-title">排序说明</h2></header>
      <section><p>对已加载记录排序；未加载部分不计入本页统计。</p></section>
      <footer><button class="btn" type="button" id="close-details">关闭</button></footer>
    </div>
  </dialog>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const sort = document.querySelector('#sort');
      sort.addEventListener('change', event => {
        document.querySelector('#selection').textContent = event.detail.value;
        // Re-render real loaded records using this sort value.
      });
      const dialog = document.querySelector('#details');
      document.querySelector('#open-details').onclick = () => dialog.showModal();
      document.querySelector('#close-details').onclick = () => dialog.close();
    });
  </script>
</body>
</html>
```

Use the custom `div.select` structure to style the **expanded** menu. A native `<select class="select">` remains an OS/browser popup. Give each instance unique IDs and matching ARIA references. Basecoat initializes at DOMContentLoaded and observes dynamically added controls. After initialization, read `root.value`, set `root.value = 'rating'`, or listen to its bubbling `change` (`event.detail.value`). Register app behavior after DOMContentLoaded as above when using deferred scripts.

For forms, use normal `<form>`, `<label>`, `<input class="input">` and `<button class="btn" type="submit">`. In this pinned version, button variants use `class="btn" data-variant="outline"` (not `btn-outline`); dialog content belongs in one child `<div>` as above. Validate values, disable duplicate submits and call `dodoDB.createRecord`/`updateCell` with real keyIDs and supported field types. Rendering database text uses `textContent`; component markup must not interpolate untrusted cell HTML. Keep the existing managed paginator and refresh handling.

Reference: [installation](https://basecoatui.com/installation/), [Select markup/API](https://basecoatui.com/components/select/). Load only the relevant upstream component documentation when going beyond this example; retain the bundled local URLs and pinned version.
