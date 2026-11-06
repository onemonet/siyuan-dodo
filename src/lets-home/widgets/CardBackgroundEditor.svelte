<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    HomeWidgetBackground,
    HomeWidgetBackgroundMode,
  } from "../config";
  import {
    DEFAULT_GRADIENT_BACKGROUND,
    DEFAULT_SOLID_BACKGROUND,
  } from "./shared/background";
  import {
    OPEN_COLOR_FAMILIES,
    OPEN_COLOR_NEUTRALS,
    WEB_GRADIENTS,
    type WebGradientPreset,
  } from "./shared/background-palettes";

  export let background: HomeWidgetBackground | undefined;

  const dispatch = createEventDispatcher<{
    change: HomeWidgetBackground;
  }>();

  const OPEN_COLOR_LABELS: Record<string, string> = {
    gray: "灰",
    red: "红",
    pink: "粉",
    grape: "葡萄紫",
    violet: "紫",
    indigo: "靛蓝",
    blue: "蓝",
    cyan: "青",
    teal: "青绿",
    green: "绿",
    lime: "青柠",
    yellow: "黄",
    orange: "橙",
  };

  const normalizeCssValue = (value: string | undefined): string =>
    value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";

  let gradientQuery = "";

  $: mode = background?.mode ?? "default";
  $: color = background?.color ?? DEFAULT_SOLID_BACKGROUND;
  $: gradient = background?.gradient ?? DEFAULT_GRADIENT_BACKGROUND;
  $: blendMode = background?.blendMode ?? "";
  $: nativeColor = /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : DEFAULT_SOLID_BACKGROUND;
  $: previewBackground =
    mode === "solid"
      ? color
      : mode === "gradient"
        ? gradient
        : "var(--home-surface)";
  $: previewBlendMode = mode === "gradient" ? blendMode : "";
  $: normalizedQuery = gradientQuery.trim().toLowerCase();
  $: filteredGradients = normalizedQuery
    ? WEB_GRADIENTS.filter((preset) =>
        `${preset.index} ${preset.name}`.toLowerCase().includes(normalizedQuery),
      )
    : WEB_GRADIENTS;
  $: selectedGradient = WEB_GRADIENTS.find(
    (preset) =>
      normalizeCssValue(preset.background) === normalizeCssValue(gradient) &&
      normalizeCssValue(preset.blendMode) === normalizeCssValue(blendMode),
  );

  function emitBackground(next: HomeWidgetBackground): void {
    dispatch("change", next);
  }

  function setMode(nextMode: HomeWidgetBackgroundMode): void {
    emitBackground({
      mode: nextMode,
      color,
      gradient,
      blendMode,
    });
  }

  function emitSolidColor(value: string): void {
    emitBackground({
      mode: "solid",
      color: value,
      gradient,
      blendMode,
    });
  }

  function handleColorInput(event: Event): void {
    emitSolidColor((event.currentTarget as HTMLInputElement).value);
  }

  function emitGradientPreset(preset: WebGradientPreset): void {
    emitBackground({
      mode: "gradient",
      color,
      gradient: preset.background,
      blendMode: "blendMode" in preset ? preset.blendMode : undefined,
    });
  }

  function handleGradientInput(event: Event): void {
    emitBackground({
      mode: "gradient",
      color,
      gradient: (event.currentTarget as HTMLTextAreaElement).value,
      blendMode: undefined,
    });
  }
</script>

<div class="card-background-editor">
  <div class="card-background-heading">
    <div>
      <strong>卡片背景</strong>
      <span>每个组件实例独立保存</span>
    </div>
    <span class="background-library-badge">
      {mode === "solid"
        ? "Open Color · 132"
        : mode === "gradient"
          ? "WebGradients · 180"
          : "跟随主题"}
    </span>
  </div>

  <div
    class="background-preview"
    style:background={previewBackground}
    style:background-blend-mode={previewBlendMode}
  >
    <span>{selectedGradient?.name ?? (mode === "default" ? "默认背景" : "实时预览")}</span>
  </div>

  <div class="background-mode-switch" role="group" aria-label="背景类型">
    <button
      type="button"
      class:active={mode === "default"}
      aria-pressed={mode === "default"}
      on:click={() => setMode("default")}
    >默认</button>
    <button
      type="button"
      class:active={mode === "solid"}
      aria-pressed={mode === "solid"}
      on:click={() => setMode("solid")}
    >单色</button>
    <button
      type="button"
      class:active={mode === "gradient"}
      aria-pressed={mode === "gradient"}
      on:click={() => setMode("gradient")}
    >渐变</button>
  </div>

  {#if mode === "default"}
    <div class="background-default-hint">
      使用当前主题的卡片背景。切换到单色或渐变后，只影响当前组件实例。
    </div>
  {:else if mode === "solid"}
    <section class="background-library-section">
      <div class="background-section-heading">
        <div>
          <strong>自定义颜色</strong>
          <span>支持任意 CSS 颜色值</span>
        </div>
      </div>
      <div class="background-color-control">
        <input
          class="background-native-color"
          type="color"
          aria-label="选择背景颜色"
          value={nativeColor}
          on:input={handleColorInput}
        />
        <input
          class="background-value-input"
          type="text"
          aria-label="背景颜色值"
          value={color}
          on:input={handleColorInput}
          placeholder="#ffffff / rgb(...) / var(...)"
        />
      </div>
    </section>

    <section class="background-library-section">
      <div class="background-section-heading">
        <div>
          <strong>Open Color</strong>
          <span>13 个色系 × 10 个色阶，另含黑白</span>
        </div>
        <a
          class="background-source-link"
          href="https://yeun.github.io/open-color/"
          target="_blank"
          rel="noreferrer"
        >官网</a>
      </div>

      <div class="open-color-neutrals">
        {#each OPEN_COLOR_NEUTRALS as item}
          <button
            class="open-color-neutral"
            class:selected={item.color.toLowerCase() === color.toLowerCase()}
            type="button"
            aria-label={`选择 ${item.id} ${item.color}`}
            aria-pressed={item.color.toLowerCase() === color.toLowerCase()}
            title={`${item.id} · ${item.color}`}
            on:click={() => emitSolidColor(item.color)}
          >
            <span style:background={item.color}></span>
            <small>{item.id}</small>
          </button>
        {/each}
      </div>

      <div class="open-color-palette">
        {#each OPEN_COLOR_FAMILIES as family}
          <div class="open-color-family">
            <div class="open-color-family-label">
              <strong>{OPEN_COLOR_LABELS[family.id] ?? family.id}</strong>
              <small>{family.id}</small>
            </div>
            <div class="open-color-shades">
              {#each family.colors as shade, shadeIndex}
                <button
                  class="background-swatch"
                  class:selected={shade.toLowerCase() === color.toLowerCase()}
                  type="button"
                  style:background={shade}
                  title={`${family.id}-${shadeIndex} · ${shade}`}
                  aria-label={`选择 ${family.id}-${shadeIndex} ${shade}`}
                  aria-pressed={shade.toLowerCase() === color.toLowerCase()}
                  on:click={() => emitSolidColor(shade)}
                ></button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {:else}
    <section class="background-library-section">
      <div class="background-section-heading">
        <div>
          <strong>WebGradients</strong>
          <span>官方 180 个 CSS 渐变预设</span>
        </div>
        <a
          class="background-source-link"
          href="https://webgradients.com/"
          target="_blank"
          rel="noreferrer"
        >官网</a>
      </div>

      <div class="background-gradient-toolbar">
        <input
          class="background-gradient-search"
          type="search"
          bind:value={gradientQuery}
          placeholder="搜索名称或编号，例如 042 / Sunny"
          aria-label="搜索 WebGradients"
        />
        <span>{filteredGradients.length} / {WEB_GRADIENTS.length}</span>
      </div>

      <div class="background-gradient-grid" aria-label="WebGradients 渐变列表">
        {#each filteredGradients as preset (preset.index)}
          <button
            class="background-gradient-option"
            class:selected={selectedGradient?.index === preset.index}
            type="button"
            style:background={preset.background}
            style:background-blend-mode={"blendMode" in preset ? preset.blendMode : ""}
            title={`${preset.index} · ${preset.name}`}
            aria-label={`选择渐变 ${preset.name}`}
            aria-pressed={selectedGradient?.index === preset.index}
            on:click={() => emitGradientPreset(preset)}
          >
            <span class="background-gradient-option-label">
              <strong>{preset.name}</strong>
              <small>#{preset.index}</small>
            </span>
          </button>
        {/each}
      </div>
    </section>

    <section class="background-library-section background-custom-gradient">
      <div class="background-section-heading">
        <div>
          <strong>自定义 CSS</strong>
          <span>编辑后会脱离 WebGradients 预设，可继续自由调整</span>
        </div>
      </div>
      <textarea
        class="background-gradient-input"
        aria-label="渐变 CSS"
        value={gradient}
        on:input={handleGradientInput}
        placeholder="linear-gradient(135deg, #26313d, #101820)"
      ></textarea>
    </section>
  {/if}
</div>
