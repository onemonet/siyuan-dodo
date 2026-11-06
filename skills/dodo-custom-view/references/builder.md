# Dodo Custom View — Complex HTML Application Building

Adapted from [Anthropic's web-artifacts-builder Skill](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) (Apache-2.0): borrow the **component architecture, build discipline and single-file delivery**, not the original Claude artifact execution environment. Dodo saves **one HTML string** into the user's selected SiYuan AV custom view.

## Select the simplest stack that meets the request

In the SiYuan Agent, polished controls need no build: use `reference({topic:"basecoat"})` for ordinary HTML (default), or `reference({topic:"web-awesome"})` for `wa-*` components. Both ship as local browser-ready CSS/JS with Dodo. Use ordinary CSS for page layout; React/Tailwind/shadcn compilation below is optional only when an actual external build environment is already available and requested.

| Scope | Recommended implementation | Why |
| --- | --- | --- |
| Simple cards, gallery, KPI chart, search, form | One HTML document, internal CSS + plain JS + `dodoDB` | Smallest output, easiest to debug and edit in SiYuan |
| Several related panels, filters, sort, modal detail and inline editor | One HTML with functions/modules, semantic components, small explicit state model | Avoids build dependencies while keeping refreshes predictable |
| Complex workbench with many components, interdependent state, nested dialogs/routes | Optional React + TypeScript + Vite; Tailwind/shadcn/ui if the **real build tools** are available | Component boundaries and state can justify the extra bundle weight |

**Do not invent a build tool.** The Dodo Agent capabilities `current/create/get_source/save_source` accept complete HTML; they do **not** provide a Node command runner, the upstream `scripts/init-artifact.sh`, its preinstalled React/shadcn dependencies, or the upstream `scripts/bundle-artifact.sh`. If the Agent cannot actually run a local build, generate one fully functional plain HTML source. A user must not be required to clone another repository just to edit a simple view.

## Data/interaction architecture (every stack)

1. Read `dodo-database.custom.current` **before** designing. Map stable `schema.fields[].id` to UI controls, distinguish read-only field types, and check whether the view already has an `appId`. Preserve that app's HTML/version when editing.
2. Separate concerns even in one file: `readSchema()`, `render()`, `wireEvents()`, `handleWrite()`. **The plugin owns pagination:** call `dodoDB.createPaginator()` rather than creating another page counter, page-size setting or independent row cache.
3. Never synthesize rows, KPIs, totals or chart values. The **only** per-batch setting is the current native AV view's `pageSize` (「条目数」), returned by `getSchema()` and respected by `pager.next()`. Do not assume the first batch represents the whole database, and surface partial totals honestly. In the native 「全部」 mode, Dodo loads chunks of 100 internally, not 102400 at once.
4. **Initialize once.** Some pages do both `dodoDBReady` and `if(window.dodoDB) load()`, accidentally loading/adding the same page twice. Use the `if/else` below. The pager is shared inside the iframe and deduplicates by `row.id` automatically.
5. Dodo's pager shares concurrent `next()` calls and invalidates stale responses when `dodoDBRefresh` fires; the HTML still must ignore a `stale` result, handle re-rendering, and load another page only when the user scrolls/clicks. Do not blindly render old results after a reset.
6. Represent loading, empty, filtered-empty, error and saving states explicitly. Disable duplicate submit, validate real field types and show native write-permission errors.
7. Use `mAsset` URLs directly: thumbnail for cards, original for full-screen preview; use SiYuan's built-in ECharts for charts. Avoid inline Base64 assets and redundant chart libraries.
8. Since HTML runs without a sandbox on the SiYuan origin, **inspect all generated scripts and dependencies**. Favor bundled trusted local code over unreviewed external CDNs.

### One-time startup and race-safe refresh example

```html
<main id="records" aria-live="polite">加载中…</main>
<button id="more" type="button">加载更多</button>
<script>
let initialized = false;
let generation = 0, primaryID = '';
const pager = dodoDB.createPaginator();
const host = document.querySelector('#records');
const button = document.querySelector('#more');
async function loadMore() {
  const current = generation;
  button.disabled = true;
  try {
    const {records,total,hasMore,stale} = await pager.next();
    if (stale || current !== generation) return;
    host.replaceChildren(); // pager.records has deduplicated rows
    for (const row of records) {
      const node = document.createElement('article');
      node.textContent = row.displayValues[primaryID] || '未命名';
      host.append(node);
    }
    button.hidden = !hasMore;
    host.setAttribute('aria-label', '已加载 ' + records.length + ' / ' + total);
  } catch(error) {
    if (current === generation) host.textContent = '加载失败：' + error.message;
  } finally { if (current === generation) button.disabled = false; }
}
async function reloadRecords() {
  const current = ++generation;
  pager.reset();
  host.textContent = '加载中…';
  button.hidden = true;
  try {
    const schema = await dodoDB.getSchema();
    if (current !== generation) return;
    primaryID = schema.fields.find(field => field.type === 'block')?.id || '';
    await loadMore();
  } catch(error) {
    if (current === generation) host.textContent = '加载失败：' + error.message;
  }
}
function start() {
  if (initialized) return;
  initialized = true;
  button.addEventListener('click', loadMore);
  window.addEventListener('dodoDBRefresh', reloadRecords);
  void reloadRecords();
}
if (window.dodoDB) start();
else window.addEventListener('dodoDBReady', start, {once:true});
</script>
```

This example is a **pattern**, not a ready-made dataset layout. The sole data batch size is SiYuan's own view setting. Do not change it from the HTML or pass `pageSize` to `listRecords`; only the native menu owns that preference. If the first request is already in flight, a later `dodoDBRefresh` supersedes it; never show a doubled 21→42 count from duplicate initialization. For a gallery, prefer lazy-load/append and incremental DOM virtualization rather than rebuilding many cards as the dataset grows.

## Optional React / Tailwind / shadcn compilation

Only when an actual coding/build environment is connected and the component complexity warrants it:

1. Build a temporary project outside the SiYuan data directory with React + TypeScript and a bundler such as Vite/Parcel. Use Tailwind and shadcn/ui only if available and their bundle size is justified.
2. Mount the application into a single root in the HTML; keep the data adapter based on `window.dodoDB` rather than inventing custom HTTP endpoints. Let React state own records and query state. Do not call kernel APIs from arbitrary UI components.
3. Build one deliverable HTML: inline compiled JavaScript/CSS and local application icons or safe SVG. **No localhost development server**, unresolved `/src/main.tsx` references, `node_modules` imports, dependency on externally generated JS/CSS chunks, or `file://` links in saved source. React dependencies must be inlined/bundled; Dodo is not itself a React runtime.
4. Keep SiYuan-hosted `assets/...` images **as URL references** so the browser can use `?style=thumb` and its normal cache. No Base64 embedding for the entire database gallery.
5. For ECharts, use the already installed SiYuan bundle. Since compilation/minification can hide an `echarts.init` string from Dodo's detection, include `<meta name="dodo-echarts" content="enabled">` in the final HTML when the UI needs it.
6. Inspect the final compiled HTML for executable third-party scripts and unexpected network endpoints. Dodo's HTML iframe is same-origin with the SiYuan application and **not isolated**.
7. Test the **compiled HTML, not just the development server**: narrow iframe (~400px) and wide (~1000px), real AV sample fields, interactions, data refresh, keyboard, non-English fonts and absence of console/network errors.
8. After build/validation, call `dodo-database.custom.save_source({appId,expectedVersion,html})` with the **entire HTML string**. Keep version optimistic concurrency and don't overwrite another edit. Do not modify the user's App files directly.

The upstream React/Tailwind/Parcel bootstrap scripts are specific to Claude's artifact build workflow and **are not installed in Dodo**. Never instruct the SiYuan Agent to call them unless the current environment actually provides them.

## Design and QA rules still apply

Component libraries do **not** automatically make a page distinctive. First decide a subject-specific layout and semantic tokens (`reference({topic:"design"})`, `reference({topic:"themes"})`); then build. Avoid a generic SaaS-card kit, excessive centered panels, automatic purple gradients and unnecessary dependencies. Test saving/creating through the SDK with explicit user permission; the SDK write toggle cannot protect against arbitrary same-origin scripts.
