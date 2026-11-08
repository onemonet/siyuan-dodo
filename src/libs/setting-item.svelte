<script lang="ts">
  import { createEventDispatcher } from "svelte";
  export let type: string; // Setting Type
  export let title: string; // Displayint Setting Title
  export let description: string; // Displaying Setting Text
  export let showDescription: boolean = true;
  export let settingKey: string;
  export let configItemId: string = "";
  export let settingValue: any;
  export let height: string;

  //Optional
  export let placeholder: string = ""; // Use it if type is input
  export let preview:
    | { label?: string; value: string | ((value: any) => string) }
    | undefined = undefined;
  export let options: { [key: string | number]: string } = {}; // Use it if type is select
  export let slider: {
    min: number;
    max: number;
    step: number;
  } = { min: 0, max: 100, step: 1 }; // Use it if type is slider

  const dispatch = createEventDispatcher();

  function clicked() {
    dispatch("click", { key: settingKey, value: settingValue });
  }

  function changed() {
    dispatch("changed", { key: settingKey, value: settingValue });
  }

  $: previewText = preview
    ? typeof preview.value === "function"
      ? preview.value(settingValue)
      : preview.value
    : "";
  $: previewLabel = preview?.label ?? "预览";
</script>

{#if type === "textarea"}
  <label class="fn__flex-column b3-label config-item" data-config-item-id={configItemId || settingKey}>
    <div class="config-item__main">
      <div class="config-name">{@html title}</div>
      {#if showDescription && description}
        <div class="b3-label__text">
          {@html description}
        </div>
      {/if}
    </div>
    <textarea
      style="height: {height ? height : '300px'};"
      class="b3-text-field"
      id={settingKey}
      {placeholder}
      bind:value={settingValue}
      on:change={changed}
    />
  </label>
{/if}
{#if type !== "textarea"}
  <label class="fn__flex b3-label config-item" data-config-item-id={configItemId || settingKey}>
    <div class="fn__flex-1 config-item__main">
      <div class="config-name">{@html title}</div>
      {#if showDescription && description}
        <div class="b3-label__text">
          {@html description}
        </div>
      {/if}
    </div>
    <span class="fn__space" />
    <!-- <slot /> -->
    {#if type === "checkbox"}
      <!-- Checkbox -->
      <input
        class="b3-switch fn__flex-center"
        id={settingKey}
        type="checkbox"
        bind:checked={settingValue}
        on:change={changed}
      />
    {:else if type === "textinput"}
      <!-- Text Input -->
      <div class="dodo-setting-input-stack">
        <input
          class="b3-text-field fn__size200"
          id={settingKey}
          {placeholder}
          bind:value={settingValue}
          on:change={changed}
        />
        {#if previewText}
          <div class="dodo-setting-preview">
            {previewLabel}: {previewText}
          </div>
        {/if}
      </div>
    {:else if type === "color"}
      <div class="dodo-setting-color">
        <input
          class="dodo-setting-color__picker"
          id={settingKey}
          type="color"
          bind:value={settingValue}
          on:change={changed}
          aria-label={title}
        />
        <code class="dodo-setting-color__value">{settingValue}</code>
      </div>
    {:else if type === "number"}
      <input
        class="b3-text-field fn__size200"
        id={settingKey}
        type="number"
        bind:value={settingValue}
        on:change={changed}
      />
    {:else if type === "button"}
      <!-- Button Input -->
      <button
        class="b3-button b3-button--outline fn__size200"
        id={settingKey}
        on:click={clicked}
      >
        {settingValue}
      </button>
    {:else if type === "select"}
      <!-- Dropdown select -->
      <select
        class="b3-select fn__size200"
        id={settingKey}
        bind:value={settingValue}
        on:change={changed}
      >
        {#each Object.entries(options) as [value, text]}
          <option {value}>{text}</option>
        {/each}
      </select>
    {:else if type == "slider"}
      <!-- Slider -->
      <div class="b3-tooltips b3-tooltips__n" aria-label={settingValue}>
        <input
          class="b3-slider fn__size200"
          id={settingKey}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          type="range"
          bind:value={settingValue}
          on:change={changed}
        />
      </div>
    {:else if type == "detail"}
      <div class="b3-tooltips b3-tooltips__n" aria-label={settingValue}>
        <!-- {description} -->
      </div>
    {/if}
  </label>
{/if}

<style lang="scss">
  /* b3-label, b3-label__text, config-item, b3-switch, b3-select,
     b3-text-field, b3-button, b3-slider and their focus/hover states are
     owned entirely by SiYuan's shipped CSS and the user's active theme. */
  /* API application links are injected through {@html title}; :global is
     necessary because Svelte does not scope markup created by {@html}. */
  .config-name :global(a.dodo-setting-api-link) {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    white-space: nowrap;
    margin-left: 8px;
    padding: 1px 8px;
    min-height: 20px;
    box-sizing: border-box;
    border: 1px solid var(--b3-theme-primary);
    border-radius: 999px;
    background: transparent;
    color: var(--b3-theme-primary);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    text-decoration: none;
    cursor: pointer;
  }
  .config-name :global(a.dodo-setting-api-link:hover) {
    background: var(--b3-theme-primary-lightest);
  }
  .config-name :global(a.dodo-setting-api-link:focus-visible) {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 2px;
  }
  .dodo-setting-input-stack {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    flex: none;
  }
  .dodo-setting-preview {
    color: var(--b3-theme-on-surface);
    font-size: 0.875em;
    max-width: min(360px, 42vw);
    overflow-wrap: anywhere;
  }
  .dodo-setting-color {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  /* SiYuan has no dedicated color value picker in settings. */
  .dodo-setting-color__picker {
    width: 38px;
    height: 30px;
    padding: 2px;
    border: 1px solid var(--b3-border-color);
    border-radius: var(--b3-border-radius);
    background: transparent;
    cursor: pointer;
  }
  .dodo-setting-color__value {
    min-width: 70px;
    color: var(--b3-theme-on-surface);
  }
  .fn__flex-column.b3-label textarea.b3-text-field {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
</style>
