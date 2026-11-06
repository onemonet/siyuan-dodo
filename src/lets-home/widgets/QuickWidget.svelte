<script lang="ts">
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;
</script>

<div class="link-stack" data-widget-type={widget.id}>
  <span><i></i>最近打开</span>
  <span><i></i>收藏文档</span>
  <span><i></i>Flomo 仪表盘</span>
</div>
