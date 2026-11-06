<script lang="ts">
  import Layers3 from "lucide-svelte/icons/layers-3";
  import {
    getHomeWidgetDefinition,
    type HomeWidget,
  } from "../config";

  export let widget: HomeWidget;

  $: definition = getHomeWidgetDefinition(widget.id);
</script>

<div class="widget-placeholder">
  <Layers3 size={20} />
  <strong>组件占位</strong>
  <span>{definition.description}</span>
</div>
