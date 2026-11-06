---
name: dodo-custom-view
description: Design and build distinctive, polished, functional SiYuan Dodo HTML database views using native Agent tools and dodoDB. Includes frontend visual direction, theme tokens and optional component-based HTML bundling for dashboards, galleries, kanban, forms, editors and workbenches.
---

# Dodo Custom View · Agent Development Skill

Use this Skill when the user asks to create, style, debug, or modify a **Dodo AI 自定义数据库视图**. The view is a self-contained HTML micro-app backed by a native SiYuan attribute-view (AV) database. This combines the design discipline of [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design), the appropriate-complexity engineering of [web-artifacts-builder](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder), and the theme-token approach of [theme-factory](https://github.com/anthropics/skills/tree/main/skills/theme-factory), **adapted to Dodo rather than requiring those Skills or their scripts to be installed**. User direction and real data always take priority over any stock style.

## Fast workflow

Native SiYuan Agent capabilities use the prefix `dodo-database.custom.`. Discover their callable names in the host capability catalog. There is no need to load a generic Skill before using these tools; `read_me` exposes this document when needed.

1. **Identify the target automatically.** Call `dodo-database.custom.current` **first** with no arguments. It locates the active or most recently focused SiYuan database, including a tab hidden by switching to Agent. It returns native `blockId`, `avID`, `viewId`, schema, initial records, and—if this is already a custom HTML view—`appId`, the **full HTML source**, and the current `version`. **Never ask the user to retype IDs or the database name when this works.** If multiple candidates are ambiguous, ask the user to click the intended database and retry; do not guess.
2. **Create a SEPARATE view, never convert the user's existing view.** For any current view with `mode !== "custom"` (native table or a Dodo map/chart/timeline/gantt/calendar overlay), use `dodo-database.custom.create({blockId,viewId,avID})` with the three IDs returned by `current` **only when the user requests creation**. It adds a NEW native SiYuan table tab with a distinct `viewId`, attaches a NEW Dodo HTML app, and returns its `appId`, source HTML and version. **Do not change the source view type/configuration.** If `current.mode === "custom"` and the user wants to modify THIS view, **edit the existing appId without calling create**. To modify a different existing custom view, explicitly identify it with `list`/its `appId`; never silently overwrite another view. If `current` already returned sufficient data, do not redundantly call `schema` or `get_source`.
3. **Understand the data.** Use the schema and representative records supplied by `current`. Call `records` only for additional pages or details; use stable field `keyID` values, not mutable Chinese column labels. Preserve `appId` and the latest `version` on existing HTML.
4. **Design in two quick passes before writing HTML.** Establish the real audience, core task and characteristic content from the AV schema/rows. Sketch one subject-specific hierarchy and decide on a compact system: 4–6 named color tokens, headline/body typography, spacing/density and layout for the **actual iframe width**. Review your plan: if the same hero, palette, all-caps label, purple gradient or identical rounded cards could fit any unrelated database, revise it. Follow the user's explicit visual choices; for an incremental fix, preserve the existing design. Read `reference({topic:"design"})` for the full visual-critique method. If the user requests a theme or consistency across sections, use `reference({topic:"themes"})` for optional palettes and CSS tokens—not a compulsory preset or questionnaire.
5. **Choose appropriate implementation complexity and deliver one complete HTML source.** A simple gallery/form/dashboard should use plain HTML, CSS and JS; a complex multi-panel workbench may benefit from React/TypeScript, stateful components or Tailwind/shadcn **only when an actual build environment is available**. In that case bundle/inject the compiled code into **one saved HTML document**, not a directory of assets or an assumed `scripts/init-artifact.sh` command. `reference({topic:"builder"})` explains the optional workflow. The iframe has **no sandbox or injected CSP** and shares SiYuan's origin: review all code as trusted before saving. **Use `dodoDB.createPaginator()` for paged data—SiYuan's current native AV `pageSize` (「条目数」) is the only batch-size setting; never hardcode `pageSize:100` or implement a second custom pager.** The plugin coalesces requests, deduplicates by row ID and invalidates stale refreshes; use `pager.next()` on scroll/button. For `mAsset` images use `?style=thumb` for grids/cards and the original assets path for full-size preview; never Base64. For charts, Dodo auto-loads built-in ECharts when detected (or use `<meta name="dodo-echarts" content="enabled">`). Read `reference({topic:"runtime"})` for exact behavior.
6. **Critique and validate both appearance and behavior.** Real records must drive everything. Check visual hierarchy, Chinese/English typography, contrast, narrow pane responsiveness, keyboard focus, reduced motion and purposeful interface wording. Verify filters, pagination, image previews, chart sizes, input validation, loading/empty/error/success states and SDK permissions. Initialize database data exactly once; on refresh **replace or deduplicate by `row.id`**, never append the same page twice. Use browser screenshots when a browser is actually available; never claim visual testing otherwise. Read `reference({topic:"checklist"})` for the review.
7. **Save once when ready.** Call `save_source({appId,expectedVersion,html})` using the `version` returned by the most recent `current`, `create` or `get_source`. A successful save automatically snapshots the prior HTML and refreshes the view. If a version conflict occurs, re-read and merge: never overwrite blindly. Do not repeatedly save throwaway variants.
8. **Iterate without regressing.** For a change request, inspect existing HTML and keep unrelated behavior, field bindings, selectors and user-chosen aesthetics. Review changes before the next save; `versions` and `restore` exist for recovery. Restore only on explicit request.

### Runtime SDK (page code)

```js
const db = window.dodoDB;
const { fields, name, viewId, pageSize: nativePageSize } = await db.getSchema();
const pager = db.createPaginator(); // one shared pager per custom HTML view
const { records, total, hasMore, batchSize } = await pager.next();
// When the user scrolls/presses "加载更多", use await pager.next().
// It returns the whole deduplicated records snapshot and newly added rows.
// "全部" (102400) is internally read in bounded chunks of 100; lazy-render.
const primaryField = fields.find(field => field.type === 'block');
const numberField = fields.find(field => field.type === 'number');
// row: { id, blockId, valueId,
//   values: { [fieldKeyId]: typedValue },
//   displayValues: { [fieldKeyId]: readableString },
//   valueDetails: { [fieldKeyId]: optionalTypedMetadata } }
await db.openRecord(records[0].id);
const imageField = fields.find(field => field.type === 'mAsset');
const image = records[0]?.values[imageField?.id]?.[0];
if (image) {
  const original = new URL(image.path, document.baseURI);
  original.searchParams.delete('style');
  const thumb = new URL(original);
  thumb.searchParams.set('style', 'thumb');
  const cover = document.querySelector('img.cover');
  cover.src = thumb.href; // card thumbnail
  cover.addEventListener('click', () => {
    // Load full quality only when asked; use a real lightbox in the final UI.
    window.open(original.href, '_blank', 'noopener,noreferrer');
  });
}
// Only if the user has enabled database writes for this view:
await db.updateCell({ recordId: records[0].id, fieldId: "field-key-id", value: "new text" });
// The title/primary block field is required. This is also supported in an
// HTML <form> submit handler (event.preventDefault() + submit lock).
if (primaryField && numberField) {
  await db.createRecord({ [primaryField.id]: "新条目", [numberField.id]: 12 });
}
```

`getSchema`, `listRecords`, `openRecord`, `updateCell`, and `createRecord` are asynchronous; `createPaginator()` returns a shared synchronous pager whose `next()` is async. `getSchema().pageSize` is the saved native AV setting; `batchSize` is the actual safe fetch size. Legacy `listRecords({page,pageSize})` ignores custom `pageSize`: the native setting is authoritative. Asset images use ordinary URLs. Use `values` for calculations, `displayValues` for readable UI/filter labels and `valueDetails` for complex metadata. Initialize exactly once (`if(window.dodoDB) start(); else addEventListener('dodoDBReady',start,{once:true})`). The pager automatically resets on `dodoDBRefresh`; reload the UI from `pager.next()` after this event. See `reference({topic:"runtime"})`.

**Image quality choice:** `?style=thumb` returns a server-generated smaller image, **not** the original. It is recommended for previews/cards because it is faster; original `assets/...` (no `style=thumb`) preserves source resolution for enlargement. In a measured SiYuan example, a 2048×2048 PNG (2.81 MiB) was returned as 520×520 (258 KiB) with `style=thumb`; dimensions vary by asset. Never assume thumbnails are sufficient for full-resolution preview. Use the actual `mAsset` path from records, not a sample filename.

**HTML create forms are supported.** Use a normal `<form>` with a JavaScript `submit` handler that calls `event.preventDefault()`, validates input, disables the submit button during the request and invokes `dodoDB.createRecord(values)`. Use **stable field IDs**. A nonempty primary/title field is required. The SDK accepts only text, finite number and checkbox fields besides the title. The Dodo SDK write switch is off by default, but **unsandboxed HTML can bypass that switch using direct same-origin APIs**. Only execute trusted HTML. Do not retry an ambiguous/partial create; see `reference({topic:"runtime"})`.

**Charts:** SiYuan's installed ECharts is available as `window.echarts` in HTML that uses it—no import or script tag is necessary. Initialize with `echarts.init(element)`. Get real chart data using `dodoDB.getSchema()` and `listRecords()`, aggregate by stable field IDs, then pass an ECharts `option` to `chart.setOption()`. Check `window.echarts` and show an error if the host asset is missing; use a defined-height chart container, a `ResizeObserver`, and `chart.resize()`. Style charts using the selected page tokens, with readable axes and empty/partial-data states. See `reference({topic:"runtime"})` for a complete example.

### Non-negotiable technical constraints

- **Storage:** saved user HTML lives at `/data/storage/petal/siyuan-dodo/custom-views/<appId>/index.html`, *not* inside the plugin's installation directory. Keep the `appId` unchanged when editing.
- **Security:** the view runs inside a **normal unrestricted same-origin `iframe srcdoc`**. Dodo does not set iframe `sandbox` or inject a CSP. HTML can load local assets, JS/CSS, fetch resources, access `window.parent` and invoke SiYuan kernel APIs. This is trusted code running with host privileges; carefully review every Agent-generated script and third-party dependency. The `allowWrites` switch only protects the `dodoDB` SDK, **not direct same-origin kernel requests**.
- **Real database:** never substitute invented rows, numbers, analytics, or images for actual AV data. Explain missing fields and degrade gracefully.
- **Read/write:** SDK write permission is **off by default**. The SDK currently supports text, number and checkbox cell updates; other field types should remain read-only through this SDK. Because the page is not sandboxed, **direct host API calls are technically possible even when SDK writes are off**. Prefer the validated SDK and never claim that its setting confines all page code.
- **Links:** `dodoDB.openRecord(row.id)` is preferred; `siyuan://blocks/<blockId>` links to records in the current view are intercepted by the plugin. Do not assume the AV item ID is the same as a bound document block ID.
- **Versioning:** HTML changes replace the whole source and create historical snapshots. The plugin automatically prunes unpinned snapshots beyond the configured retention (default 20), while pinned versions survive. Do not automatically delete an App: the App manager checks database references and uses a reversible trash first.
- **Rendering:** adapt to the **available iframe width**, not the whole SiYuan desktop. Make active, hover, focus, empty and error states usable.

## Optional design guidance — progressive disclosure

### No-build UI components in SiYuan Agent

For new dropdowns, forms, dialogs and toolbars, prefer the bundled **Basecoat** controls. Read `reference({topic:"basecoat"})` before writing their markup. When the user chooses Web Awesome or needs its custom elements, read `reference({topic:"web-awesome"})`. Preserve an existing page's component library when editing. Use one library per page by default.

Both references provide fixed local CSS/JS URLs under `/plugins/siyuan-dodo/vendor/custom-view/`; the HTML runs directly in SiYuan with no Node, React, Tailwind compiler, CDN or separate project. Include only the chosen library's resources in the HTML. Layout remains ordinary CSS and records still come from `dodoDB`. These libraries are available resources, not automatically injected globals; the Skill supplies instructions, not an executable runtime.

For higher-quality HTML, request just the relevant reference:

- `reference({topic:"design"})` — frontend-design-inspired visual direction, layout, typography, copywriting and self-critique.
- `reference({topic:"themes"})` — theme-factory-inspired optional palettes, custom CSS tokens, theme switching and contextual selection.
- `reference({topic:"builder"})` — web-artifacts-builder-inspired complexity decision, components, optional React/Tailwind/shadcn build and single-HTML delivery.
- `reference({topic:"basecoat"})` — default no-build HTML controls, local resource URLs, styled Select and native dialog examples.
- `reference({topic:"web-awesome"})` — optional no-build Web Components, local autoloader, readiness, events and dialog examples.
- `reference({topic:"examples"})` — targeted patterns drawn from [Anthropic's HTML effectiveness gallery](https://github.com/anthropics/html-effectiveness), **not** mandated visual templates.
- `reference({topic:"runtime"})` — supported SDK, field types, direct image URLs, forms and unrestricted-page security.
- `reference({topic:"checklist"})` — implementation and pre-save quality review.

The references belong to `skills/dodo-custom-view/references/`; obtain their content via the `dodo-database.custom.reference` Agent capability if the host does not provide file reading.

**Design freedom rule:** references teach layout *principles*, interaction *patterns*, theme *systems*, and implementation *techniques*. Do not copy a reference's palette, typography, spacing tokens, brand or card shell unless the user explicitly wants it. If the user names a style, honor it. If not, select a reasonable direction without requiring a separate theme choice. Good output should fit the data and the user's taste, not look like every other generated dashboard.
