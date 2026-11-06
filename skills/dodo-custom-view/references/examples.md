# Dodo Custom View — Optional HTML Effectiveness References

Reference source: [anthropics/html-effectiveness](https://github.com/anthropics/html-effectiveness), an MIT-licensed gallery of **standalone HTML examples**. The examples demonstrate design/interaction methods and contain fictional data. They are **not** a Dodo SDK library, are **not** required for every request, and should not be imported wholesale as the user's design language. Respect attribution and the upstream license if reusing substantial code.

Choose *one or two relevant examples* based on the current task; do not copy their shared palette, typography or brand:

| User need | Example | Reusable technique |
|---|---|---|
| Create a consistent yet flexible component vocabulary | [05-design-system.html](https://github.com/anthropics/html-effectiveness/blob/main/05-design-system.html) | Semantic design tokens, type scales, structured documentation |
| Compare card/table layouts and adjustable presentation | [06-component-variants.html](https://github.com/anthropics/html-effectiveness/blob/main/06-component-variants.html) | Variant controls, spacing and density tradeoffs |
| Test micro-interactions | [08-prototype-interaction.html](https://github.com/anthropics/html-effectiveness/blob/main/08-prototype-interaction.html) | Feedback, affordances, state transitions |
| Build an informative status / KPI view | [11-status-report.html](https://github.com/anthropics/html-effectiveness/blob/main/11-status-report.html) | Prioritization, summaries, evidence-based visual hierarchy |
| Show linked workflows | [13-flowchart-diagram.html](https://github.com/anthropics/html-effectiveness/blob/main/13-flowchart-diagram.html) | Native SVG structure and annotated relationships |
| Project or task triage workbench | [18-editor-triage-board.html](https://github.com/anthropics/html-effectiveness/blob/main/18-editor-triage-board.html) | Grouping, filtering, action feedback, drag-oriented layouts |
| Settings or feature management | [19-editor-feature-flags.html](https://github.com/anthropics/html-effectiveness/blob/main/19-editor-feature-flags.html) | Inline controls, readable state and consequences |
| Two-panel parameter editor | [20-editor-prompt-tuner.html](https://github.com/anthropics/html-effectiveness/blob/main/20-editor-prompt-tuner.html) | Form-to-preview relationship, iteration |

## Adapt rather than imitate

To use a pattern in a Dodo custom view:

1. Identify the **interaction idea** or **information hierarchy** that solves the user's problem.
2. Read the current AV schema and sample rows; replace fictional data with values returned by `dodoDB`.
3. Write a self-contained document for Dodo's unrestricted same-origin iframe. Review all included scripts as trusted SiYuan-host code. Avoid the example's brand-specific CSS variables and mock content unless the user explicitly wants a visual reproduction.
4. Choose an aesthetic based on user request and the content, independent of the reference's design tokens.
5. Check the embedded-width layout, SDK navigation, data states, performance and field fidelity before saving.

Inspiration does not guarantee implementation compatibility. A standalone HTML example may require hardcoded mock data, a development server, externally built bundles, non-Dodo application routing or APIs unavailable through `window.dodoDB`. Adapt its **interaction technique** to the current AV schema and Dodo's one-HTML-file delivery. The iframe is now unsandboxed and shares SiYuan's origin: external scripts and network code are possible, but are therefore **higher-trust decisions**, not dependencies to include merely for visual polish. For a stronger first-pass design, consult `reference({topic:"design"})`, optionally `themes` for token systems, and `builder` for complex components.
