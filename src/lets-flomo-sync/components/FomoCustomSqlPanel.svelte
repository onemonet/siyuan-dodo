<script lang="ts">
  import { createEventDispatcher } from "svelte";

  const CONSTANTS = {
    customSqlPlaceholder: "留空时使用上方筛选条件生成 SQL",
    customSqlHint: "输入完整 SQL 即可覆盖可视筛选；清空后恢复默认筛选逻辑。",
  } as const;

  export let customSQLDraft = "";

  const dispatch = createEventDispatcher<{
    change: { sql: string };
  }>();

  function handleCustomSQLInput(event: Event): void {
    customSQLDraft = (event.currentTarget as HTMLTextAreaElement).value;
    dispatch("change", { sql: customSQLDraft });
  }
</script>

<div class="filter-custom-panel">
  <textarea
    class="filter-textarea"
    rows="6"
    value={customSQLDraft}
    placeholder={CONSTANTS.customSqlPlaceholder}
    on:input={handleCustomSQLInput}
  ></textarea>
  <div class="filter-custom-hint">{CONSTANTS.customSqlHint}</div>
</div>
