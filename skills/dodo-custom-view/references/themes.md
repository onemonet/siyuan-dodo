# Dodo Custom View — Theme System, Not a Fixed Template

Adapted from [Anthropic's theme-factory Skill](https://github.com/anthropics/skills/tree/main/skills/theme-factory) and its theme reference files (Apache-2.0). This is a **design aid for HTML database apps**, not a slide-deck showcase, dependency, or mandatory set of brand styles.

## Choose a theme without blocking the user

1. **Honor an explicit user style first.** Existing custom HTML being edited retains its current palette, type, radii and spatial rhythm unless the user asks for a redesign.
2. Otherwise infer a suitable direction from the *real database* and audience: gallery, inventory, project workbench, accounting ledger, CRM, reference library, etc. Avoid guessing an industry's colors when the actual record content suggests something else.
3. Pick **one** optional preset below as a *starting vocabulary*, or invent a new semantic palette. Do **not** cycle through presets randomly or require the user to select a theme for every request. A named preset is an inspiration, not a promise to reproduce the upstream PDF.
4. Assign colors to **functional roles** (background, elevated surface, text, subdued text, action, warning, border), and adjust shades/contrast for actual foreground/background pairs. A four-color inspiration set is *not* a complete accessible UI theme.
5. Pick font families that work for Chinese and Latin, and test actual available fonts. Do not silently depend on external fonts or bundle font files into the HTML.
6. Apply tokens across header, controls, cards, dialogs, table states, and **ECharts** (axis labels/tooltips/series), not just the body background. Validate keyboard focus, selection, empty/error states and the narrow iframe width.

## Optional color families

The names and colors below come from the upstream `theme-factory/themes` directory. Use the combinations **only when relevant to the user's subject**; adjust contrast and component hierarchy rather than dropping all four colors into every UI.

| Direction | Four upstream inspiration colors | Example fit |
| --- | --- | --- |
| Ocean Depths | navy `#1a2332`, teal `#2d8b8b`, seafoam `#a8dadc`, pale `#f1faee` | professional, maritime, financial |
| Sunset Boulevard | orange `#e76f51`, coral `#f4a261`, amber `#e9c46a`, deep teal `#264653` | events, campaigns, lifestyle |
| Forest Canopy | deep green `#2d4a2b`, sage `#7d8471`, olive `#a4ac86`, ivory `#faf9f6` | nature, outdoors, sustainable products |
| Modern Minimalist | charcoal `#36454f`, slate `#708090`, light grey `#d3d3d3`, white `#ffffff` | technical tables, product collections |
| Golden Hour | mustard `#f4a900`, muted coral `#c1666b`, sand `#d4b896`, brown `#4a403a` | food, craft, hospitality |
| Arctic Frost | ice `#d4e4f7`, steel blue `#4a6fa5`, silver `#c0c0c0`, white `#fafafa` | precise, clean, analytical |
| Desert Rose | dusty pink `#d4a5a5`, clay `#b87d6d`, sand `#e8d5c4`, burgundy `#5d2e46` | boutique, interiors, personal collections |
| Tech Innovation | blue `#0066ff`, cyan `#00ffff`, charcoal `#1e1e1e`, white `#ffffff` | software, devices, maker tools |
| Botanical Garden | fern `#4a7c59`, marigold `#f9a620`, terracotta `#b7472a`, cream `#f5f3ed` | gardening, recipes, materials |
| Midnight Galaxy | purple `#2b1e3e`, indigo `#4a4e8f`, lavender `#a490c2`, pale `#e6e6fa` | cinema, games, creative archives |

**Never force a preset** when the user asks for a specific palette, dark mode, a SiYuan-native appearance, or an existing visual style. A utility-first inventory editor may be better served by restrained neutral surfaces and a single useful status accent.

## Turn the direction into reusable HTML/CSS tokens

Use one compact semantic layer that is easy to update. Example values below **illustrate the method**, not a default Dodo theme:

```css
:root {
  color-scheme: light;
  --page: #f7f8fa;          /* outer page */
  --surface: #ffffff;       /* cards, forms */
  --ink: #1f2933;           /* text */
  --muted: #596675;         /* secondary text */
  --accent: #2463a6;        /* calls to action */
  --border: #d8dfe7;        /* structural separation */
  --danger: #a32929;        /* validation/destructive actions */
  --focus: #2463a6;
  --radius-control: 7px;
  --radius-panel: 12px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 18px;
  --font-ui: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-display: var(--font-ui);
}
body { margin:0; background:var(--page); color:var(--ink); font-family:var(--font-ui); }
.panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-panel); }
.action { background:var(--accent); color:white; }
:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important; }
}
```

Map tokens into ECharts `option` and update on theme changes if a page supports light/dark modes; call `chart.setOption()` or recreate the ECharts theme appropriately. Avoid changing chart colors while leaving tooltips/axis text unreadable.

## Theme review

- Does the style express the database's purpose rather than advertising a generic AI dashboard?
- Do labels, numeric values and status chips stay readable in both color modes?
- Are there sufficient states for loading, empty, disabled, error, success and keyboard focus?
- Are color and typography consistent across forms, image cards, ECharts, dialogs and tabs?
- Does the layout still work when the SiYuan side panel becomes narrow?
- Are the actual `mAsset` images and AV data doing the visual storytelling rather than decorative stock placeholders?

Original inspiration: [theme-factory](https://github.com/anthropics/skills/tree/main/skills/theme-factory), [theme colors](https://github.com/anthropics/skills/tree/main/skills/theme-factory/themes). The reference is adapted for Dodo; the original slide showcase PDF is neither embedded nor required.
