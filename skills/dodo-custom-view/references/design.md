# Dodo Custom View — Intentional Frontend Design

Adapted from [Anthropic's frontend-design Skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (Apache-2.0), for **real SiYuan AV data and embedded HTML views**, not copied as a mandatory brand template.

The goal is a visually **intentional, legible and useful** application that feels appropriate to its underlying data. Do not adopt a particular brand language unless requested. User instructions and existing app styles override inspiration.

## Two-pass creative process (before producing source HTML)

**Pass A — Ground the concept.** Use `dodo-database.custom.current` to inspect the actual field types, 1–20 real records, what users need to find/edit, the density of information and the likely viewport width. State a short design rationale internally or in a compact response if useful:

- **Character:** A movie collection might lead with posters and genres; a finance ledger with currency alignment and comparisons; a bug tracker with status and next actions. Do not produce the same hero/statistics cards for all three.
- **Signature moment:** Choose *one* memorable visual feature that demonstrates the product's purpose (image composition, informative data comparison, a clear editing interaction). Keep the rest quieter. Avoid a decorative hero when the main task is row editing.
- **Palette:** Choose 4–6 named, role-specific hex tokens (`--page`, `--surface`, `--ink`, `--muted`, `--accent`, `--border`). Select them from the brief, not from whichever demo was shown last. If the user asks for a consistent theme, consult `reference({topic:"themes"})`.
- **Type:** Choose a headline and body strategy (one family or two with clearly distinct jobs), sizes and weights, CJK fallbacks, line lengths for long text and right-aligned numbers. Prefer a usable local fallback over a missing web font.
- **Layout:** Decide main content alignment and density, then sketch a one-line or ASCII arrangement, e.g. `[filters] / [large image | metadata | action]` or `[search + status tabs] / [dense rows]`. Plan the narrow SiYuan iframe, not only desktop.

**Pass B — Critique before building.** Imagine another unrelated database using the same draft. If it still looks natural without any changes, it is probably generic. Revise a specific decision (structure, typography or visual focal point), then write the implementation. If the user explicitly asked for the generic style, do not substitute a personal preference.

## Choose a distinct direction

Start by reading the data and inferring what the user needs to accomplish:

- **Image-rich library:** image/cover hierarchy, compact metadata, easy sorting and quick detail navigation.
- **Operations/workbench:** keyboard-accessible filters, dense but legible tables, status grouping, actionable row details.
- **Insights/dashboard:** a small number of evidence-backed KPIs, explanations and readable visualizations; never fake analytics.
- **Editorial collection:** meaningful typography, generous whitespace and narrative hierarchy; not necessarily a grid of cards.
- **Mobile/narrow iframe:** stacked or scrollable views, reachable controls, no clipped dialogs.

Style may be editorial, cinematic, playful, technical, monochrome, retro, minimal, maximal, or any other concept the user asks for. Choose a rationale, not a stock preset. If modifying an existing page, preserve its design identity unless the user asks for a redesign.

## Practical design principles

1. **Information hierarchy.** Put the primary task first. Distinguish page title, summary, controls, record title, key facts, and secondary metadata. Hide less useful fields behind progressive disclosure rather than placing everything on the card.
2. **Typography.** Make typography carry the design identity: use a deliberate size/weight/spacing scale and avoid turning all labels into tracked all-caps. Keep prose lines comfortably below ~80 characters when space allows. Use `system-ui, "PingFang SC", "Microsoft YaHei", sans-serif` or a deliberate locally available alternative with CJK fallback. The iframe is **unsandboxed**, so web fonts are possible, but treat each remote dependency as a separate trust, privacy and offline-reliability choice; do not require it by default. Verify Chinese, English, numbers and long titles.
3. **Spacing, alignment and density.** Use consistent but flexible spacing, responsive grids and meaningful grouping. Dense data interfaces can be excellent—do not force oversized cards, massive hero headers or excessive whitespace.
4. **Color and contrast.** Select colors based on the product's purpose and user preferences, not on the example repo. Maintain enough foreground/background contrast, distinguish interactive states, and avoid color as the sole status indicator.
5. **Interaction.** Controls must work on real data. Give buttons clear labels, visible focus states, loading/empty/error feedback, disabled states, and confirmations for destructive operations. Hover is optional; keyboard and touch should still work.
6. **Responsive behavior.** Use `clamp()`, `minmax()`, flexible layouts, sensible breakpoints, and `min-width:0`. Test typical view widths from a narrow embedded pane to a wide content column.
   **Scrollbar styling:** Dodo now injects a low-specificity, SiYuan-like default into custom HTML: a narrow scrollbar (about 6px in Chromium), rounded neutral thumb, transparent track and no arrow buttons; the rule also covers nested scrolling elements. Let the plugin own this default. Do not add thick browser-style scrollbars, and do not accidentally create double vertical scrollbars by giving both `body` and an inner `height:100vh; overflow:auto` container independent scroll positions. A page can deliberately override the defaults through its own later CSS when its layout requires it.
7. **Motion and graphics.** Use motion chiefly to clarify an action (expand, save, filter, switch); one purposeful transition works better than staggered entrance animations on every card. Honor `prefers-reduced-motion`. Inline SVG, Canvas and SiYuan ECharts are useful, but avoid expensive animation loops inside a database view.
8. **Data integrity.** All counts, chart scales, percentages and classifications must derive from actual fields. Show honest partial-data states when paginating or when fields are absent.

## Anti-homogeneity and writing checks

Ask: Would this same HTML look equally appropriate for a movie library, finance ledger and bug tracker? If yes, reconsider the visual concept and structure. Avoid recurring defaults such as warm cream and clay accents, dark black with acid neon, a broadsheet of unnecessary dividers, an accent italic word in a headline, repeated all-caps eyebrow labels, generic purple gradients, the same grey-shadow card grid and equal-sized rounded cards **unless specifically suitable**.

Make decorative labels, dividers, numbering and borders carry information. Use 01/02/03 only for genuinely sequential content. Avoid ending every button with `→`, fake metrics or vague marketing copy. Write for the person using the view: `保存更改`, `新增项目`, `重新加载` instead of `执行` or `提交`. Match the same action name in the resulting success/error message.

**Empty/failure states are part of the interface**, not decorative afterthoughts: distinguish no database records, no filter matches, pagination still loading, missing resource image, permission-denied writes and partial aggregation. Give a user action to recover.

**Final critique:** Remove one unnecessary decorative feature. Check keyboard focus, pointer/touch affordances, usable hit targets, meaningful alternate text, color contrast, `prefers-reduced-motion`, nested scroll behavior, long Chinese titles and real-data performance. If browser screenshots are available, inspect a narrow and a wide iframe; otherwise do not claim visual review happened.

Do not add a fake visual polish layer while leaving the work incomplete. A meaningful filter, real navigation and readable content make a better design than decorative gradients around broken controls.
