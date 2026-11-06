<script lang="ts">
  import { onMount } from "svelte";
  import { mountCustomAppManager } from "./app-manager";

  let container: HTMLDivElement;
  onMount(() => mountCustomAppManager(container));
</script>

<!-- Mounting only when 数据库视图 is selected prevents querying every App
     while the user is viewing unrelated plugin settings. -->
<div class="dodo-custom-app-inline" bind:this={container}></div>

<style>
  .dodo-custom-app-inline {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
</style>
