# Dodo Custom View — Before-Save Review

For new HTML and especially second-pass edits, verify the following. Do not claim browser screenshot testing if only code was reviewed.

**Correctness**
- Target `appId` and `expectedVersion` match the most recent `get_source`; a page edit should not create a new app.
- Resolve the current database through `current` first. For an existing custom app, do not create another; for a normal table, call `create` only for an explicit creation request. Reject ambiguous split-pane targets instead of guessing.
- Every referenced field is grounded in `schema.fields` by stable `keyID`; missing fields have an honest fallback.
- Dynamic data from `dodoDB.createPaginator().next()` drives cards, filters and charts. The **sole batch size** comes from the current SiYuan native AV `getSchema().pageSize` ('条目数'); no hardcoded `pageSize:100` in HTML. For '全部' the plugin chunks 100 at a time; don't construct huge DOM in one render. The pager automatically deduplicates IDs and discards stale in-flight refresh results; the page handles `stale` and `hasMore`, with only one initialization path.
- Custom HTML inherits a Dodo-provided thin neutral scrollbar (about 6px in Chromium, including nested scroll containers). Do not duplicate a thick custom scrollbar or inadvertently cause both the iframe page and an inner pane to scroll vertically. User-defined CSS can override the plugin's low-specificity default where needed.
- Asset-column images use the real row's `mAsset` entry directly: `<img src="assets/cover.png?style=thumb" loading="lazy">` for cards/galleries and the exact same assets path **without `style=thumb`** for lightbox/zoom/full-size preview. Use `URL.searchParams` to add/remove `style` rather than breaking existing query parameters. Only fetch full-resolution images on demand; let the browser cache and handle missing images. No Base64 or `getAssetPreview`.
- If the HTML includes a create form, submit is handled with `preventDefault()` and a pending/disabled guard; `createRecord` must include the title plus only currently supported editable fields. Check the view's explicit write authorization before promising that submission works.
- For ECharts, use `window.echarts` (auto-provided by Dodo when referenced) without manual imports, network requests or CDN scripts. Verify a fixed-height chart container, `chart.resize()` on size changes, correct field IDs and a visible failure state when the built-in library is absent.
- Database writes use supported SDK types and explicit user permission; read-only screens do not call write APIs.
- Record clicks use `dodoDB.openRecord(row.id)` or the supported `siyuan://blocks/<bound-id>` format.
- Unrestricted same-origin HTML can call `fetch`, access `window.parent`, and use SiYuan kernel APIs; **review all code/dependencies as fully trusted**. Prefer Dodo SDK for valid scoped database operations. The Dodo write toggle only gates SDK writes, not direct API calls.

**Usability**
- Loading, empty, error and long-text cases render coherently.
- Navigation, sort/filter/search, edit actions and reset controls actually work; they have keyboard focus and helpful labels.
- Complex inputs do not accidentally save on each keystroke; failures are visible and retry is safe.
- Important data is not shown only by color, tiny font or truncated tooltips.

**Design**
- Visual identity reflects the current user's request and dataset rather than an automatic copied template.
- Alignment, typography, contrast, spacing and density are deliberate at the actual iframe width.
- Responsive layout works from narrow pane to full-width content; no horizontal overflow or clipped controls.
- Reduced-motion preferences, hover/focus affordances and basic accessibility are respected.

**Safe delivery**
- Review the complete HTML before `save_source`, including existing behavior that must survive.
- Do not submit experimental versions repeatedly when a single coherent change suffices.
- Save with `expectedVersion`; if it conflicts, re-read source and merge rather than clobbering it.
- If the outcome has not been verified in a browser, say so. A successful save does not itself guarantee a pixel-perfect result.
