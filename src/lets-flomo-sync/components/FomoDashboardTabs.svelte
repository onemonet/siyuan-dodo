<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    DASHBOARD_TAB_OPTIONS,
    type DashboardTab,
  } from "../utils/dashboardTabs";

  export let activeTab: DashboardTab;
  export let isHiddenMobile = false;

  const dispatch = createEventDispatcher<{
    tabchange: { tab: DashboardTab };
  }>();
</script>

<div class="flomo-dashboard-tab-bar" class:hidden-mobile={isHiddenMobile}>
  {#each DASHBOARD_TAB_OPTIONS as tabOption}
    <button
      class:active={activeTab === tabOption.id}
      on:click={() => dispatch("tabchange", { tab: tabOption.id })}
    >
      {tabOption.label}
    </button>
  {/each}
</div>
