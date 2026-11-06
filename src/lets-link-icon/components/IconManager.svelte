<script lang="ts">
  import { onDestroy } from "svelte";
  import IconButton from "@/components/IconButton.svelte";
  import X from "lucide-svelte/icons/x";
  import { showMessage } from "siyuan";
  import type { LinkIconCleanupHandler } from "../icon-manager-cleanup";
  import type { CustomIconRecord } from "../custom-icon";
  import {
    mergeCustomIconRecords,
    normalizeLinkIconHref,
  } from "../icon-records";

  export let icons: CustomIconRecord[] = [];
  export let onSave: (
    icons: CustomIconRecord[],
    deleteList: string[],
  ) => Promise<CustomIconRecord[] | void> = async () => [];
  export let onUpload: (
    file: File,
    href: string,
  ) => Promise<string | null> = async () => null;
  export let onCleanUnused: LinkIconCleanupHandler = async (currentIcons) => ({
    icons: currentIcons,
    removedCount: 0,
  });

  let keyword = "";
  let deleteList: string[] = [];
  let saving = false;
  let cleaning = false;
  let cleanProgress = "";

  let uploadHref = "";
  let uploadFile: File | null = null;
  let uploadPreviewUrl = "";
  let uploading = false;
  let fileInput: HTMLInputElement;

  $: normalizedKeyword = keyword.trim().toLowerCase();
  $: filteredIcons = icons.filter((icon) =>
    normalizedKeyword
      ? icon.href.toLowerCase().includes(normalizedKeyword)
      : true,
  );
  $: trimmedUploadHref = uploadHref.trim();
  $: normalizedUploadHref = normalizeLinkIconHref(uploadHref);
  $: uploadHintMessage = trimmedUploadHref
    ? normalizedUploadHref
      ? `将保存为规则：${normalizedUploadHref}`
      : "无法识别该规则，请输入域名、URL 或通配符规则"
    : "";

  function revokeUploadPreviewUrl() {
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      uploadPreviewUrl = "";
    }
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    revokeUploadPreviewUrl();
    uploadFile = input.files?.[0] ?? null;
    if (uploadFile) {
      uploadPreviewUrl = URL.createObjectURL(uploadFile);
      if (!uploadHref) {
        uploadHref = uploadFile.name.replace(/\.[^.]+$/, "");
      }
    } else {
      uploadPreviewUrl = "";
    }
  }

  function handleIconLoadError(event: Event) {
    const imageElement = event.currentTarget as HTMLImageElement | null;
    if (imageElement) {
      imageElement.style.opacity = "0.2";
    }
  }

  async function handleUpload() {
    if (!uploadFile || !normalizedUploadHref) {
      showMessage("请填写有效域名规则并选择图标文件");
      return;
    }

    const hasDuplicateRule = icons.some(
      (icon) => icon.href === normalizedUploadHref,
    );
    if (hasDuplicateRule) {
      showMessage(`该规则已存在：${normalizedUploadHref}`);
      return;
    }

    uploading = true;
    try {
      const iconUrl = await onUpload(uploadFile, normalizedUploadHref);
      if (!iconUrl) {
        showMessage("上传失败，请重试");
        return;
      }

      const mergeResult = mergeCustomIconRecords([
        ...icons,
        { href: normalizedUploadHref, iconUrl },
      ]);
      icons = mergeResult.icons;
      uploadHref = "";
      uploadFile = null;
      revokeUploadPreviewUrl();
      if (fileInput) {
        fileInput.value = "";
      }
      showMessage("图标添加成功，点击「保存更改」生效");
    } finally {
      uploading = false;
    }
  }

  function deleteIcon(href: string) {
    const icon = icons.find((item) => item.href === href);
    if (icon) {
      deleteList = [...deleteList, icon.iconUrl];
    }
    icons = icons.filter((item) => item.href !== href);
  }

  async function handleSave() {
    saving = true;
    try {
      const mergeResult = mergeCustomIconRecords(icons);
      const mergedCount = mergeResult.removedIcons.length;
      const savedIcons = await onSave(mergeResult.icons, deleteList);
      icons = Array.isArray(savedIcons) ? savedIcons : mergeResult.icons;
      deleteList = [];
      const successMessage =
        mergedCount > 0
          ? `保存成功，已合并 ${mergedCount} 条重复规则`
          : "保存成功";
      showMessage(successMessage);
    } finally {
      saving = false;
    }
  }

  async function handleCleanUnused() {
    cleaning = true;
    cleanProgress = "正在检查...";

    try {
      const cleanupResult = await onCleanUnused(icons, (progress) => {
        cleanProgress = `正在检查第 ${progress.checked} / ${progress.total} 个，已清理 ${progress.removedCount} 个`;
      });
      const removedCount = cleanupResult?.removedCount ?? 0;
      icons = cleanupResult?.icons ?? icons;

      const savedIcons = await onSave(icons, []);
      icons = Array.isArray(savedIcons) ? savedIcons : icons;
      showMessage(`已清理 ${removedCount} 个未引用图标，并同步移除记录`);
    } catch {
      showMessage("清理失败，请稍后重试", 3000, "error");
    } finally {
      cleaning = false;
      cleanProgress = "";
    }
  }

  onDestroy(() => {
    revokeUploadPreviewUrl();
  });
</script>

<div class="lim">
  <div class="lim__upload">
    <div class="lim__upload-row">
      <input
        class="b3-text-field lim__href-input"
        placeholder="域名或规则（如 github.com、*.feishu.cn）"
        bind:value={uploadHref}
      />
      <label class="b3-button b3-button--outline lim__file-btn">
        选择图标
        <input
          type="file"
          accept="image/*,.ico,.svg"
          class="lim__file-input"
          bind:this={fileInput}
          on:change={onFileChange}
        />
      </label>
      <button
        class="b3-button"
        disabled={!uploadFile || !trimmedUploadHref || uploading}
        on:click={handleUpload}
      >
        {uploading ? "上传中..." : "添加"}
      </button>
    </div>
    {#if uploadHintMessage}
      <div class:lim__hint--error={!normalizedUploadHref} class="lim__hint">
        {uploadHintMessage}
      </div>
    {/if}
    {#if uploadPreviewUrl}
      <div class="lim__preview">
        <img src={uploadPreviewUrl} alt="图标预览" />
        <span>{uploadFile?.name}</span>
      </div>
    {/if}
  </div>

  <div class="lim__toolbar">
    <input
      bind:value={keyword}
      class="b3-text-field lim__search"
      placeholder="搜索域名或规则"
    />
    <span class="ft__smaller">共 {filteredIcons.length} 条规则</span>
  </div>

  <div class="lim__list">
    {#if filteredIcons.length === 0}
      <div class="lim__empty">暂无自定义图标规则</div>
    {:else}
      {#each filteredIcons as icon (icon.href)}
        <div class="lim__item">
          <img
            src={icon.iconUrl.startsWith("http") ? icon.iconUrl : icon.iconUrl}
            alt={icon.href}
            class="lim__icon"
            on:error={handleIconLoadError}
          />
          <div class="lim__meta">
            <div class="lim__href">{icon.href}</div>
            <div class="lim__url">{icon.iconUrl}</div>
          </div>
          <IconButton
            label="删除"
            variant="danger"
            size="sm"
            on:click={() => deleteIcon(icon.href)}
          >
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>
      {/each}
    {/if}
  </div>

  <div class="lim__actions">
    <button
      class="b3-button b3-button--outline"
      disabled={cleaning}
      on:click={handleCleanUnused}
    >
      {cleaning ? cleanProgress : "清除未使用"}
    </button>
    <button class="b3-button" disabled={saving} on:click={handleSave}>
      {saving ? "保存中..." : "保存更改"}
    </button>
  </div>
</div>

<style>
  .lim {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    padding: 12px;
    box-sizing: border-box;
  }

  .lim__upload {
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lim__upload-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .lim__href-input {
    flex: 1;
    min-width: 0;
  }

  .lim__file-btn {
    cursor: pointer;
    white-space: nowrap;
    position: relative;
  }

  .lim__file-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
  }

  .lim__hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
  }

  .lim__hint--error {
    color: var(--b3-theme-error);
  }

  .lim__preview {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
  }

  .lim__preview img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  .lim__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 13px;
    box-sizing: border-box;
  }

  .lim__search {
    flex: 1;
    min-width: 0;
  }

  .lim__toolbar :global(.ft__smaller) {
    flex: none;
    white-space: nowrap;
  }

  .lim__list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .lim__empty {
    color: var(--b3-theme-on-surface-light);
    font-size: 13px;
    text-align: center;
    padding: 24px 0;
  }

  .lim__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
  }

  .lim__icon {
    width: 22px;
    height: 22px;
    object-fit: contain;
    flex: none;
    border-radius: 3px;
  }

  .lim__meta {
    flex: 1;
    min-width: 0;
  }

  .lim__href {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lim__url {
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lim__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  }
</style>
