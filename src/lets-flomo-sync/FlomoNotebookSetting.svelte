<script lang="ts">
  import { onMount } from "svelte";
  import { lsNotebooks } from "../api";
  import SettingItem from "../libs/setting-item.svelte";
  import {
    buildFlomoNotebookChoices,
    pendingFlomoNotebookChoices,
  } from "./flomo-notebook-choices";
  import type { FlomoNotebookChoice } from "./flomo-notebook-choices";

  export let settingValue: unknown = "";
  export let configItemId = "Flomo 同步.dailnoteNotebook";

  let notebooks: FlomoNotebookChoice[] | null = null;
  let loadState: "loading" | "ready" | "error" = "loading";
  $: selectedId = String(settingValue ?? "");
  $: choices = loadState === "ready" && notebooks
    ? buildFlomoNotebookChoices(notebooks, selectedId)
    : pendingFlomoNotebookChoices(selectedId, loadState === "error" ? "error" : "loading");

  onMount(() => {
    let active = true;
    void lsNotebooks()
      .then((result) => {
        if (!active) return;
        if (!result || !Array.isArray(result.notebooks)) {
          throw new Error("思源未返回笔记本列表");
        }
        notebooks = result.notebooks;
        loadState = "ready";
      })
      .catch(() => {
        if (active) loadState = "error";
      });
    return () => { active = false; };
  });
</script>

<SettingItem
  type="select"
  title="DailyNote 笔记本"
  description={choices.notice}
  settingKey="dailnoteNotebook"
  {configItemId}
  settingValue={selectedId}
  options={choices.options}
  on:changed
/>