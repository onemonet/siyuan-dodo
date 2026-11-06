<script lang="ts">
  import { createEventDispatcher } from "svelte";

  const CONSTANTS = {
    resetLabel: "重置",
    applyLabel: "搜索",
    customSqlLabel: "自定义 SQL",
  } as const;

  export let showCustomSQL = false;

  const dispatch = createEventDispatcher<{
    togglesql: void;
    reset: void;
    apply: void;
  }>();
</script>

<div class="filter-actions-row">
  <button
    class="filter-button"
    type="button"
    on:click={() => dispatch("togglesql")}
  >
    {CONSTANTS.customSqlLabel}
  </button>
  <div class="filter-actions-spacer"></div>
  <button class="filter-button" type="button" on:click={() => dispatch("reset")}>
    {CONSTANTS.resetLabel}
  </button>
  <button
    class="filter-button filter-apply-button"
    class:active={showCustomSQL}
    type="button"
    on:click={() => dispatch("apply")}
  >
    {CONSTANTS.applyLabel}
  </button>
</div>
