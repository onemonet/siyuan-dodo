<script lang="ts">
  export let label: string;
  export let title: string = label;
  export let active = false;
  export let disabled = false;
  export let type: "button" | "submit" | "reset" = "button";
  export let variant: "toolbar" | "ghost" | "danger" | "overlay" = "toolbar";
  export let size: "sm" | "md" | "lg" = "md";
  export let className = "";
</script>

<button
  {type}
  {title}
  {disabled}
  aria-label={label}
  aria-pressed={active ? "true" : undefined}
  class={`dodo-icon-button dodo-icon-button--${variant} dodo-icon-button--${size} ${className}`}
  class:active
  on:click
>
  <slot />
</button>

<style>
  .dodo-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--b3-theme-on-surface);
    background: transparent;
    cursor: pointer;
    line-height: 1;
    transition:
      border-color 120ms ease,
      color 120ms ease,
      background 120ms ease,
      opacity 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .dodo-icon-button--sm {
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }

  .dodo-icon-button--md {
    width: 40px;
    height: 40px;
  }

  .dodo-icon-button--lg {
    width: 44px;
    height: 44px;
    border-radius: 999px;
  }

  .dodo-icon-button--toolbar {
    border-color: color-mix(in srgb, var(--b3-border-color) 92%, transparent);
    background: color-mix(in srgb, var(--b3-theme-surface) 88%, transparent);
    backdrop-filter: blur(8px);
  }

  .dodo-icon-button--ghost {
    border: none;
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
  }

  .dodo-icon-button--danger {
    border: none;
    background: transparent;
    color: var(--b3-theme-error, #d95c5c);
  }

  .dodo-icon-button--overlay {
    border: none;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-background) 72%, transparent);
    color: var(--b3-theme-on-background);
    backdrop-filter: blur(8px);
  }

  .dodo-icon-button:hover:not(:disabled),
  .dodo-icon-button:focus-visible:not(:disabled) {
    opacity: 1;
    transform: translateY(-1px);
  }

  .dodo-icon-button--ghost:hover:not(:disabled),
  .dodo-icon-button--ghost:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
  }

  .dodo-icon-button--danger:hover:not(:disabled),
  .dodo-icon-button--danger:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--b3-theme-error, #d95c5c) 12%, transparent);
  }

  .dodo-icon-button.active {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 70%, transparent);
    background: color-mix(
      in srgb,
      var(--b3-theme-primary) 14%,
      var(--b3-theme-background)
    );
    color: var(--b3-theme-primary);
    box-shadow: 0 8px 18px
      color-mix(in srgb, var(--b3-theme-primary) 16%, transparent);
  }

  .dodo-icon-button:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--b3-theme-primary) 28%, transparent);
    outline-offset: 2px;
  }

  .dodo-icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
    box-shadow: none;
  }

  .dodo-icon-button :global(svg) {
    width: 20px;
    height: 20px;
  }

  .dodo-icon-button--sm :global(svg) {
    width: 15px;
    height: 15px;
  }

  .dodo-icon-button--lg :global(svg) {
    width: 22px;
    height: 22px;
  }
</style>
