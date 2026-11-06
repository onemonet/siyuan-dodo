<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { HomeWidget } from "../config";
  import type { WidgetConfigChange } from "./types";

  export let widget: HomeWidget;

  const dispatch = createEventDispatcher<{
    configchange: WidgetConfigChange;
  }>();

  function handleInput(
    event: Event,
    field: WidgetConfigChange["field"],
  ): void {
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    dispatch("configchange", { field, value: target.value });
  }
</script>

<div class="sticky-note-editor">
  <input
    class="sticky-note-title"
    type="text"
    aria-label="便签标题"
    placeholder="标题（可选）"
    value={widget.config?.title ?? ""}
    on:mousedown|stopPropagation
    on:input={(event) => handleInput(event, "title")}
  />
  <textarea
    class="sticky-note-content"
    aria-label="便签内容"
    placeholder="写下要记住的内容……"
    value={widget.config?.content ?? ""}
    on:mousedown|stopPropagation
    on:input={(event) => handleInput(event, "content")}
  ></textarea>
  <div class="sticky-note-meta">
    <span>自动保存</span>
    <span>{(widget.config?.content ?? "").length} 字</span>
  </div>
</div>
