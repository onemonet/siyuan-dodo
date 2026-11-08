<script lang="ts">
  /** Shared SiYuan-native settings row. Reuse slots for complex field controls. */
  export let label: string = "";
  export let description: string = "";
  export let stacked = false;
</script>

<div class="dodo-native-setting-row" class:stacked>
  <div class="dodo-native-setting-row__heading">
    <slot name="label"><span class="dodo-native-setting-row__label">{label}</span></slot>
    {#if description}
      <div class="dodo-native-setting-row__description">{description}</div>
    {/if}
  </div>
  <div class="dodo-native-setting-row__control"><slot /></div>
</div>

<style>
  .dodo-native-setting-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    padding: 9px 0;
    border-bottom: 1px solid var(--b3-theme-outline-variant, var(--b3-border-color));
    background: transparent;
    color: var(--b3-theme-on-background);
    font-size: 13px;
    line-height: 1.5;
  }
  .dodo-native-setting-row:last-child { border-bottom: 0; }
  .dodo-native-setting-row__heading {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--b3-theme-on-background);
  }
  .dodo-native-setting-row__label { font-weight: 500; }
  .dodo-native-setting-row__description {
    margin-top: 4px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.6;
  }
  .dodo-native-setting-row__control {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .dodo-native-setting-row.stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .dodo-native-setting-row.stacked .dodo-native-setting-row__control {
    justify-content: stretch;
    width: 100%;
  }
  @media (max-width: 460px) {
    .dodo-native-setting-row { gap: 10px; }
    .dodo-native-setting-row__heading { min-width: 95px; }
  }
</style>