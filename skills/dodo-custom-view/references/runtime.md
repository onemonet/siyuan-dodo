# Dodo Custom View — Runtime & Data Contract

## Agent tools vs browser SDK

The **host Agent** starts with `dodo-database.custom.current`, which automatically finds the focused/last-interacted native table (even if it is temporarily hidden behind the Agent tab). It returns `avID`, `blockId`, `viewId`, the active mode, typed schema, the **native view's `pageSize` (「条目数」)**, up to 20 sample rows, and for an already-custom view, `appId`, complete `html`, `version` and `allowWrites`. The optional Agent `pageSize` argument limits only sample rows, **not** the native database's batch size. If creation is requested and the current mode is not `custom`, call `dodo-database.custom.create({blockId,viewId,avID})` using the returned source identities; its write effect requires host permission. This adds a separate native view (a new `viewId`) and HTML `appId`, preserving the original view. Work against the **new** IDs returned by create. If the active view is already `custom` and the request is to modify it, keep the existing `appId` and save a new HTML revision rather than creating a duplicate.

Other optional host tools: `list`, `schema`, `records`, `get_source`, `save_source`, `versions`, `restore`. Before changing existing HTML, keep `appId` plus `version`; `save_source` must include `expectedVersion` and a *complete* HTML string. If `current` is ambiguous, return to the intended SiYuan database and retry rather than guessing.

The **HTML page** can use `window.dodoDB` for convenient database operations.
It is **not sandboxed** and can also access SiYuan's same-origin host APIs;
use those broader privileges only in trusted reviewed code:

```js
const schema = await dodoDB.getSchema();
// {avID,blockId,viewId,name,fields, pageSize, batchSize, all}
// pageSize is current SiYuan native '条目数' (5/10/25/50/100/102400).
const pager = dodoDB.createPaginator(); // shared per iframe
const {records,total,page,pageSize,batchSize,hasMore,added} = await pager.next();
// Call pager.next() on a load-more click / near-bottom scroll.
// records: [{
//   id,blockId,valueId,
//   values:{[keyID]:typedValue},
//   displayValues:{[keyID]:readableText},
//   valueDetails:{[keyID]:extraTypedMetadata}
// }]
await dodoDB.openRecord(records[0].id);
// Asset images are ordinary browser URLs, no image SDK or Base64 needed:
const cover = document.querySelector('img.cover');
if (cover) cover.src = 'assets/cover.png?style=thumb';
await dodoDB.updateCell({recordId:records[0].id,fieldId:fieldId,value:"Changed"});
await dodoDB.createRecord({[primaryKeyId]:"New record",[numberKeyId]:5});
```

- The field's stable identity is `field.id` (SiYuan `keyID`), **not** its `name`. A rename should not break the page.
- `getSchema().pageSize` is **the native view's persisted setting**, not a custom HTML preference. `listRecords({page})` follows that view's current filter, sort, search and `pageSize`. Any `pageSize` passed by legacy HTML is **ignored**, not used as a second loading configuration. The result's `nativePageSize` is the saved setting; `pageSize` is the actual fetch size (at most 100), and `hasMore` indicates remaining records. An old page renderer that assumes its own pageSize was accepted may need to be regenerated.
- SiYuan's choices are **5, 10, 25, 50, 100, 全部**. The `全部` setting is stored as `102400`; Dodo **does not** request 102400 records in one response. It keeps that value as `nativePageSize` and transparently fetches pages of 100 as a memory/performance safeguard. Do not create tens of thousands of card DOM nodes at once: use incremental rendering, browser lazy-loading and virtualization if the page is very large.
- **Prefer `dodoDB.createPaginator()`** over manual `page++`, `push()`, `listRecords({page,pageSize})`, or independent caches. The same iframe gets the **same pager instance**; overlapping `next()` calls share one request, rows are deduplicated by `row.id`, and `pager.next()` yields `{records, added, total, page, pageSize, batchSize, all, hasMore, stale}`. `records` is the accumulated snapshot; `added` is only newly fetched unique rows, useful for appending DOM once. The pager automatically invalidates/reset on `dodoDBRefresh`; the HTML must re-render from the new `pager.next()` result. A stale response has `stale:true` and should not be rendered.
- A user-changed native `pageSize` is fetched again for each page; if it changes mid-request the SDK rejects inconsistent data rather than mixing page boundaries. The following `pager.next()` after a reset obtains the latest setting. The native view remains the only configuration source.
- `row.id` is the AV item ID. `row.blockId` is the linked content block ID, which may be empty for detached database rows. `row.valueId` is a separate AV value identity.
- The numeric `total` may depend on the current SiYuan AV payload; prefer checked values and actual loaded rows over speculative totals.

## Value types

The SDK returns **typed** `row.values[field.id]`, ready-to-display
`row.displayValues[field.id]` strings (useful for generic cards/filters),
and `row.valueDetails[field.id]` for colors, original time formatting,
relation titles, rollup entry types, and other metadata. The source is the
native SiYuan AV; use `field.id` rather than guessing a field name.

| Native AV field | `values[keyID]` | Additional metadata |
| --- | --- | --- |
| 主键 / `block` | string title | `row.id` is AV itemID, `row.blockId` is linked block |
| 文本 / `text` | string | — |
| 数字 / `number` | finite number or null | `number.isNotEmpty`, `formattedContent` |
| 单选 / `select` | string (also reads native `mSelect[0]`) | option content and color |
| 多选 / `mSelect` | string[] | full option objects and colors |
| 日期 / `date` | `{start:number,end:number\|null,allDay:boolean}` or null | native date object including `formattedContent` |
| 资源 / `mAsset` | `{name,path,type}[]` | native SiYuan asset paths suitable for image URLs |
| 复选框 / `checkbox` | boolean | — |
| 链接 / `url` | string | — |
| 邮箱 / `email` | string | — |
| 电话 / `phone` | string | — |
| 位置 / `location` | `{name,latitude,longitude,originalInput}` or null | full native location object |
| 模板 / `template` | string | — |
| 关联 / `relation` | linked block ID array | `{blockIDs,contents:[{type,blockId,value}]}`, including readable titles where supplied |
| 汇总 / `rollup` | typed array of computed values | `[{type,value}]`, preserves nested number/text/select/etc. |
| 行号 / `lineNumber` | number or null | — |
| 创建时间 / `created` | original native string, number or null | `formattedContent` when available |
| 更新时间 / `updated` | original native string, number or null | `formattedContent` when available |

For empty fields, do not mistake `0` for missing or `false` for null.
Selections/resources/relations/rollups may return empty arrays. Display-only
computed values and relations must **not** be edited with `updateCell`.
For dates, native numeric start/end values are millisecond timestamps; prefer
`displayValues` when a time format must match SiYuan's presentation.

**Images from resource fields:** `mAsset` yields `{name,path,type}[]` in
`row.values[fieldKeyID]`. Direct relative `assets/...` URLs work because
the page is same-origin, with `<base href="/">` injected before user scripts.
**Select image resolution by context**: `?style=thumb` asks SiYuan for a
smaller thumbnail, good for card covers, grids, search results, galleries and
list rows. Without the `style` query, the URL returns the original image
at full resolution for lightboxes, full-size viewing and downloads. The
original file on disk is *not changed*. For one real 2048×2048 PNG, the
thumbnail was 520×520 and 258 KiB versus 2.81 MiB original (about 91%
less data); the dimensions and savings vary for other files. Use the
browser's caching and native `loading="lazy"` for many images.

Handle paths that already contain query parameters and preserve unrelated
query values; do not concatenate another `?` to a URL that has one:

```js
function assetImageUrls(assetPath) {
  const original = new URL(assetPath, document.baseURI);
  original.searchParams.delete('style');
  const thumbnail = new URL(original);
  thumbnail.searchParams.set('style', 'thumb');
  return { thumbnail: thumbnail.href, original: original.href };
}

const { thumbnail, original } = assetImageUrls(
  'assets/image-20261104203605-wyajmzs.png'
);
// Show thumbnail in normal cards, original only after a user requests it:
coverImg.src = thumbnail;
coverImg.loading = 'lazy';
previewLink.href = original; // e.g. click to open original in a new tab
```

Example generating an image card from real database data:

```js
const field = schema.fields.find(f => f.type === 'mAsset');
for (const row of records) {
  const asset = row.values[field.id]?.find(a => /\.(png|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(a.path));
  if (!asset) continue;
  const image = document.createElement('img');
  image.alt = asset.name || '数据库封面';
  image.loading = 'lazy';
  const path = asset.path.replace(/^\//, '');
  image.src = path + (path.includes('style=') ? ''
    : path.includes('?') ? '&style=thumb' : '?style=thumb');
  container.append(image);
}
```

Example: `<img src="assets/image-20261104203605-wyajmzs.png?style=thumb" loading="lazy">`.
No dedicated image RPC, Base64 conversion, special CSP exception, or
image-size gate exists. A relative `assets/` URL resolves to SiYuan root.
Use `img.onerror` for missing files and real image metadata from the AV.
Do not inline large image strings into saved HTML. Video/PDF/other attachments
are separate presentation cases and should not be rendered as `<img>`.

Write support is currently limited:

- `updateCell` accepts `text` (string), `number` (finite number), `checkbox` (boolean).
- `createRecord` requires a nonempty block title, and supports validated values for those same editable types.
- The `dodoDB` SDK only allows writes if the user explicitly enables **允许 HTML 修改当前数据库**. **This is not a page-wide permission boundary:** an unrestricted same-origin HTML script can invoke host APIs directly even when SDK writes are disabled. Review source and dependencies before running.
- Use a visible success/error state when editing; do not silently pretend a database write succeeded.

### Forms that create native database records

HTML `<form>` submit handlers work normally in the **unsandboxed iframe**.
For controlled database operations, call `event.preventDefault()` and use
`dodoDB.createRecord(values)` rather than raw form POST. No injected CSP
prevents ordinary form submission or network calls; only trusted HTML should
be run. The SDK validates the target database, fields and user write setting.

```html
<form id="new-entry">
  <label>名称 <input name="title" required maxlength="300"></label>
  <label>备注 <input name="note" maxlength="10000"></label>
  <label>数量 <input name="count" type="number" step="any" required></label>
  <label><input name="done" type="checkbox"> 已完成</label>
  <button type="submit">添加条目</button>
  <output id="submit-result" role="status"></output>
</form>
<script>
async function initCreateForm() {
const fields = (await dodoDB.getSchema()).fields;
const primary = fields.find(f => f.type === 'block');
const note = fields.find(f => f.name === '备注' && f.type === 'text');
const count = fields.find(f => f.name === '数量' && f.type === 'number');
const done = fields.find(f => f.name === '已完成' && f.type === 'checkbox');
// Resolve and preserve real field IDs from getSchema; these example labels
// must be adapted to the actual database, not guessed.
const form = document.querySelector('#new-entry');
const button = form.querySelector('button');
let busy = false;
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  button.disabled = true;
  const status = document.querySelector('#submit-result');
  try {
    if (!primary || !note || !count || !done) throw Error('必要字段不存在');
    const data = new FormData(form);
    const n = Number(data.get('count'));
    if (!Number.isFinite(n)) throw Error('数量必须是有效数字');
    const result = await dodoDB.createRecord({
      [primary.id]: String(data.get('title') || '').trim(),
      [note.id]: String(data.get('note') || ''),
      [count.id]: n,
      [done.id]: data.has('done'),
    });
    status.textContent = '创建成功：' + result.recordId;
    form.reset();
    // Refresh the list after writing, or listen to dodoDBRefresh.
  } catch(error) {
    status.textContent = '创建失败：' + error.message;
  } finally { busy = false; button.disabled = false; }
});
}
initCreateForm().catch(error => {
  document.querySelector('#submit-result').textContent = '初始化失败：' + error.message;
});
</script>
```

`createRecord` requires the primary title. Other fields currently support
only text, number and checkbox. Select/multi-select, date, attachments,
relations and other computed fields are **not yet writable**. Permission to
modify the current database through the **SDK** must be explicitly enabled
in the Dodo HTML view settings. A missing SDK permission returns an error,
but does not prevent direct host API requests from unsandboxed scripts.
If the SDK says the record was created but later field updates
failed, **do not retry blindly**: the record already exists and a retry
would create a duplicate.

## ECharts — built into SiYuan (no CDN or npm)

Dodo's normal database chart view and AI custom HTML can use **the same**
SiYuan-installed ECharts bundle at
`/stage/protyle/js/echarts/echarts.min.js`.
An AI custom page **must not add its own external script tag**. The host
automatically loads that precise script **before your page scripts** when it
detects `echarts.init(...)`, `window.echarts`, or another direct ECharts API
reference. To explicitly opt in when using indirect variable aliases, add:

```html
<meta name="dodo-echarts" content="enabled">
```

Then simply use `window.echarts` (or `echarts`) from an ordinary inline
script. The chart engine is present before the page's own scripts run.
No `import`, `require`, CDN, `fetch` or `<script src>` is required.
Non-chart pages do **not** load the engine.

Example: **real, live database group totals** (replace field IDs with actual
`getSchema().fields[].id`; never hardcode labels or fake amounts):

```html
<meta name="dodo-echarts" content="enabled">
<div id="sales-chart" style="width:100%;height:340px"></div>
<p id="chart-status" role="status"></p>
<script>
const el = document.getElementById('sales-chart');
const status = document.getElementById('chart-status');
const instance = window.echarts?.init(el);
const resize = instance ? new ResizeObserver(() => instance.resize()) : null;
resize?.observe(el);
async function renderChart() {
  if (!instance) { status.textContent = '当前思源 ECharts 资源不可用'; return; }
  try {
    const {fields} = await dodoDB.getSchema();
    const category = fields.find(f => f.name === '部门' && f.type === 'select');
    const measure = fields.find(f => f.name === '金额' && f.type === 'number');
    if (!category || !measure) throw Error('缺少部门单选列或金额数字列');
    // For whole-database totals, consume the native-size paginator until
    // complete. "全部" uses 100-record internal chunks, not one giant DOM.
    const pager=dodoDB.createPaginator();
    pager.reset();
    const sums = new Map();
    let total=0, count=0;
    while (pager.hasMore) {
      const batch=await pager.next();
      if (batch.stale) return; // a newer refresh superseded this chart load
      total=batch.total;
      for (const row of batch.added) {
        const group = row.values[category.id] || '未分组';
        const amount = row.values[measure.id];
        if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
        sums.set(group,(sums.get(group) || 0) + amount);
        count++;
      }
      status.textContent='正在统计 '+batch.records.length+' / '+total+' 条';
    }
    instance.setOption({
      tooltip:{trigger:'axis'},grid:{left:42,right:22,bottom:44,top:24},
      xAxis:{type:'category',data:[...sums.keys()]},
      yAxis:{type:'value'},
      series:[{type:'bar',data:[...sums.values()]}],
    },true);
    status.textContent='已统计 '+count+' 条有效数值记录（总计 '+total+' 条）';
  } catch(e) { status.textContent='图表读取失败：'+e.message; }
}
window.addEventListener('dodoDBRefresh',renderChart);
renderChart(); // dodoDB SDK is available before page scripts
</script>
```

Use **stable field IDs** from the schema for real applications; names above
are only an illustration of how to find a field, not a hardcoded source of
truth. Handle incomplete pagination and empty data. When rebuilding a chart,
reuse its instance with `setOption`; observe the container to resize it.
For single-page navigation/teardown, disconnect `ResizeObserver` and dispose
ECharts instances to avoid leaking listeners. If `window.echarts` is absent,
show an explicit error. Follow the user's design preferences for typography,
color and layout rather than imposing a chart palette.

The ECharts auto-loader is a convenience, not a sandbox exception. All scripts
in this page share SiYuan's origin and privileges; review their contents.

## Browser environment & navigation

The page runs as a **normal, unrestricted same-origin `iframe.srcdoc`**.
Dodo sets **no** `sandbox` attribute and injects **no** Content Security Policy.
Native `assets/...` images, browser fetch/XHR, scripts and CSS can load, and
scripts can access `window.parent` and SiYuan kernel APIs. The root
`<base href="/">` makes relative assets URLs work from any SiYuan location.
This is deliberately a **trusted HTML execution environment**: review all
Agent-generated scripts and third-party dependencies before saving/running.
`dodoDB` API checks still apply when the page chooses to use the SDK, but
the SDK write setting cannot prevent direct same-origin API calls.

Preferred record navigation: `await dodoDB.openRecord(row.id)`. An anchor of the form `<a href="siyuan://blocks/<valid-block-id>">…</a>` is intercepted and resolved through the same scoped native database opener. Validate that a link points at the current database's record; never construct links to arbitrary user blocks.

Initialize after the SDK is ready and refresh on new data:

```js
let started=false;
const pager = window.dodoDB.createPaginator();
async function load() {
  try {
    const data = await pager.next();
    if (!data.stale) renderRows(data.records); // replace old DOM, don't push twice
  } catch(error) { renderError(error); }
}
function start() {
  if (started) return;
  started=true;
  window.addEventListener("dodoDBRefresh", () => {
    pager.reset();
    void load();
  });
  void load();
}
if (window.dodoDB) start();
else window.addEventListener("dodoDBReady", start, {once:true});
```

Avoid duplicate event handlers and overlapping refreshes. Prefer creating DOM nodes and assigning `textContent` when displaying database content, rather than interpolating untrusted strings into `innerHTML`.

## Storage & history

User-generated HTML is under `/data/storage/petal/siyuan-dodo/custom-views/<appId>/` with `index.html`, `manifest.json` and `versions/`. Do not write to the plugin install folder or put the complete HTML in `custom-dodo-views` block attributes. Every changed save creates an old-version backup, subject to size limits (512 KiB per HTML). The plugin **automatically retains the newest 20 unpinned snapshots by default**, configurable to 5/10/20/50/100 in the App manager. Explicitly pinned snapshots are preserved. Changing/clearing history is controlled from the HTML editor and App manager; deleting an App is **never automatic**.

An App may remain referenced even when the native view is temporarily set back to table: `configs.custom.appId` is retained for later reactivation. The manager checks indexed workspace references and open AV blocks before letting a user manually move an unused App to `/data/storage/petal/siyuan-dodo/custom-view-trash/`. Trash apps can be restored and are deleted permanently only after a separate confirmation. SQL indexes may omit closed notebooks; agents must not claim a database App is unused solely because it is not visible, and should not perform app deletions unprompted.
