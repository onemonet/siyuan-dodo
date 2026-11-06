<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { HomeWidget } from "../config";
  import { getWidgetComponent } from "./registry";
  import type { WidgetConfigChange } from "./types";

  export let widget: HomeWidget;

  const dispatch = createEventDispatcher<{
    configchange: WidgetConfigChange;
  }>();

  $: widgetComponent = getWidgetComponent(widget.id);

  function handleConfigChange(
    event: CustomEvent<WidgetConfigChange>,
  ): void {
    dispatch("configchange", event.detail);
  }
</script>

<svelte:component
  this={widgetComponent}
  {widget}
  on:configchange={handleConfigChange}
/>
