<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import Copy from "lucide-svelte/icons/copy";
  import Link2 from "lucide-svelte/icons/link-2";
  import Upload from "lucide-svelte/icons/upload";

  import { getBlockAttrs, upload } from "../../api";
  import { FileBlockService } from "./file-block-service";

  export let fileBlockId: string;

  let loading = true;
  let errorMsg = "";
  let asset = "";
  let linkInput = "";
  let dragOver = false;
  let saving = false;
  let fileInput: HTMLInputElement;

  onMount(() => {
    void loadContext();
  });

  async function loadContext() {
    try {
      const attrs = await getBlockAttrs(fileBlockId);
      asset = FileBlockService.readStoredAsset(attrs) || "";
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  function markdown(): string {
    return asset ? FileBlockService.buildMarkdown(asset) : "";
  }

  function selectedFiles(event: Event): File[] {
    return Array.from((event.currentTarget as HTMLInputElement).files || []);
  }

  function validFile(file: File): boolean {
    return FileBlockService.isSupportedFilePath(file.name);
  }

  async function saveAsset(nextAsset: string, message: string) {
    if (saving) {
      return false;
    }

    saving = true;
    try {
      const result = await FileBlockService.updateAsset(fileBlockId, nextAsset);
      if (!result.success || !result.asset) {
        showMessage(result.message || "更新文件失败");
        return false;
      }

      asset = result.asset;
      showMessage(message);
      return true;
    } finally {
      saving = false;
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || saving) {
      return;
    }
    if (files.length > 1) {
      showMessage("文件块只支持添加一个文件");
      return;
    }

    const file = files[0];
    if (!validFile(file)) {
      showMessage("当前文件格式暂不支持预览");
      return;
    }

    const wasEmpty = !asset;
    saving = true;
    try {
      const result = await upload("/assets/", [file]);
      const uploaded = result?.succMap?.[file.name];
      const normalized = FileBlockService.normalizeAssetPath(uploaded);
      if (!normalized) {
        throw new Error("文件上传失败");
      }

      const updateResult = await FileBlockService.updateAsset(fileBlockId, normalized);
      if (!updateResult.success || !updateResult.asset) {
        throw new Error(updateResult.message || "保存文件失败");
      }
      asset = updateResult.asset;
      showMessage(wasEmpty ? "已添加文件" : "已更新文件");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      saving = false;
      if (fileInput) {
        fileInput.value = "";
      }
    }
  }

  async function addLink() {
    const extracted = FileBlockService.extractAssetPathsFromText(linkInput);
    if (!extracted.length) {
      showMessage("请输入有效的思源文件路径或文件链接");
      return;
    }
    if (extracted.length > 1) {
      showMessage("文件块只支持添加一个文件");
      return;
    }

    if (await saveAsset(extracted[0], asset ? "已更新文件" : "已添加文件")) {
      linkInput = "";
    }
  }

  function handleLinkPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || !/[\r\n]/.test(text)) {
      return;
    }
    event.preventDefault();
    linkInput = text.replace(/\s*\r?\n\s*/g, " ").trim();
  }

  async function copyMarkdown() {
    const value = markdown();
    if (!value) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        if (!document.execCommand("copy")) {
          throw new Error("剪贴板不可用");
        }
        textarea.remove();
      }
      showMessage("已复制 Markdown");
    } catch (error) {
      showMessage(error instanceof Error ? `复制失败：${error.message}` : "复制 Markdown 失败");
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    void uploadFiles(Array.from(event.dataTransfer?.files || []));
  }
</script>

<div class="dodo-file-settings-panel">
  {#if loading}
    <div class="dodo-file-settings-state">加载中…</div>
  {:else if errorMsg}
    <div class="dodo-file-settings-state is-error">{errorMsg}</div>
  {:else}
    <div
      class="dodo-file-dropzone"
      class:is-dragover={dragOver}
      role="region"
      aria-label="拖入文件上传区域"
      on:dragover|preventDefault={() => (dragOver = true)}
      on:dragleave={() => (dragOver = false)}
      on:drop={handleDrop}
    >
      <Upload size={19} strokeWidth={1.8} />
      <span>{asset ? "拖入文件替换当前文件，或" : "拖入文件，或"}</span>
      <button class="text-button" type="button" disabled={saving} on:click={() => fileInput?.click()}>
        选择文件
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".docx,.epub,.glb,.gltf,.pptx,.txt,.xls,.xlsx"
        hidden
        on:change={(event) => uploadFiles(selectedFiles(event))}
      />
    </div>

    <form class="link-form" on:submit|preventDefault={addLink}>
      <Link2 size={16} strokeWidth={1.8} />
      <input
        bind:value={linkInput}
        disabled={saving}
        placeholder="粘贴文件链接或思源块内容"
        on:paste={handleLinkPaste}
      />
      <button class="text-button" type="submit" disabled={saving || !linkInput.trim()}>添加</button>
    </form>

    {#if asset}
      <div class="dodo-file-settings-path" title={asset}>{asset}</div>
      <button class="dodo-file-settings-copy" type="button" disabled={saving} on:click={copyMarkdown}>
        <Copy size={15} strokeWidth={1.8} />
        <span>复制 Markdown</span>
      </button>
    {:else}
      <div class="dodo-file-settings-state is-empty">当前块没有可用文件，可以上传或粘贴文件链接。</div>
    {/if}
  {/if}
</div>

<style>
  .dodo-file-settings-panel {
    display: flex;
    min-height: 210px;
    max-height: 100%;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding: 14px;
    color: var(--b3-theme-on-surface);
  }

  .dodo-file-settings-panel :global(svg) {
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  .dodo-file-settings-panel :global(svg *) {
    fill: none !important;
    stroke: inherit !important;
    stroke-linecap: inherit !important;
    stroke-linejoin: inherit !important;
  }

  .dodo-file-settings-state {
    display: grid;
    min-height: 120px;
    place-items: center;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .dodo-file-settings-state.is-error {
    color: var(--b3-theme-error);
  }

  .dodo-file-settings-state.is-empty {
    min-height: 70px;
    font-size: 12px;
    line-height: 1.6;
  }

  .dodo-file-dropzone {
    display: flex;
    min-height: 54px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border: 1px dashed var(--b3-border-color);
    border-radius: 6px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    transition: border-color 120ms ease, background-color 120ms ease;
  }

  .dodo-file-dropzone.is-dragover {
    border-color: var(--b3-theme-primary);
    background: var(--b3-theme-primary-lightest, rgba(53, 117, 240, 0.1));
  }

  .text-button {
    padding: 3px 7px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--b3-theme-primary);
    cursor: pointer;
    font: inherit;
  }

  .text-button:hover {
    background: var(--b3-list-hover, rgba(0, 0, 0, 0.05));
  }

  .link-form {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .link-form input {
    min-width: 0;
    height: 28px;
    flex: 1;
    box-sizing: border-box;
    padding: 0 7px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }

  .dodo-file-settings-path {
    overflow: hidden;
    padding: 8px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dodo-file-settings-copy {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font: inherit;
  }

  .dodo-file-settings-copy:hover {
    background: var(--b3-theme-surface-lighter);
  }
</style>
