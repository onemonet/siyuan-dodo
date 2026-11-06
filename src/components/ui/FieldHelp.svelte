<script lang="ts">
  import { onDestroy } from "svelte";

  /** Short explanatory label displayed outside scroll-clipped settings panels. */
  export let description: string;

  let button: HTMLButtonElement;
  let tooltip: HTMLDivElement | null = null;

  function placeTooltip(): void {
    if (!tooltip || !button) return;
    const anchor = button.getBoundingClientRect();
    if (anchor.bottom < 0 || anchor.top > window.innerHeight ||
        anchor.right < 0 || anchor.left > window.innerWidth) {
      hideTooltip();
      return;
    }
    tooltip.textContent = description;
    const bounds = tooltip.getBoundingClientRect();
    const margin = 8;
    const gap = 7;
    const centered = anchor.left + anchor.width / 2 - bounds.width / 2;
    const left = Math.max(margin, Math.min(centered, window.innerWidth - bounds.width - margin));
    const above = anchor.top - bounds.height - gap;
    const below = anchor.bottom + gap;
    const top = above >= margin ? above :
      below + bounds.height <= window.innerHeight - margin ? below :
      Math.max(margin, Math.min(above, window.innerHeight - bounds.height - margin));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.visibility = "visible";
  }

  function showTooltip(): void {
    if (tooltip) { placeTooltip(); return; }
    tooltip = document.createElement("div");
    tooltip.className = "dodo-field-help-popover";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = description;
    tooltip.style.visibility = "hidden";
    // This must be a direct body child. The SiYuan dialog and timeline panel
    // both have overflow clipping which clips CSS pseudo-element tooltips.
    document.body.appendChild(tooltip);
    window.addEventListener("scroll", placeTooltip, true);
    window.addEventListener("resize", placeTooltip);
    placeTooltip();
  }

  function hideTooltip(): void {
    window.removeEventListener("scroll", placeTooltip, true);
    window.removeEventListener("resize", placeTooltip);
    tooltip?.remove();
    tooltip = null;
  }

  onDestroy(hideTooltip);
</script>

<button bind:this={button} type="button" class="dodo-field-help"
  aria-label={description}
  on:mouseenter={showTooltip} on:mouseleave={hideTooltip}
  on:focus={showTooltip} on:blur={hideTooltip}
  on:keydown={(event) => { if (event.key === "Escape") hideTooltip(); }}>
  <svg aria-hidden="true"><use href="#iconInfo"/></svg>
</button>

<style>
  .dodo-field-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    flex: 0 0 16px;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    line-height: 0;
    padding: 0;
    margin: 0;
    border: 0;
    border-radius: 50%;
    color: var(--b3-theme-on-surface-light);
    background: transparent;
    cursor: help;
    vertical-align: middle;
  }
  .dodo-field-help svg {
    display: block;
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
  }
  .dodo-field-help:hover, .dodo-field-help:focus-visible {
    color: var(--b3-theme-primary);
  }
  .dodo-field-help:focus-visible {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 1px;
  }
  :global(.dodo-field-help-popover) {
    position: fixed;
    z-index: 1000001;
    box-sizing: border-box;
    width: max-content;
    max-width: min(320px, calc(100vw - 16px));
    padding: 5px 9px;
    border-radius: var(--b3-border-radius, 6px);
    color: var(--b3-tooltips-color, #fff);
    background: var(--b3-tooltips-background, #202124);
    box-shadow: var(--b3-tooltips-shadow, 0 2px 8px #0003);
    font-family: var(--b3-font-family, sans-serif);
    font-size: 12px;
    font-weight: normal;
    line-height: 1.5;
    white-space: normal;
    overflow-wrap: anywhere;
    pointer-events: none;
    text-align: left;
  }
</style>
