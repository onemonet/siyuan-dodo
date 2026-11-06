<script lang="ts">
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;
</script>

<div class="metric-row" data-widget-type={widget.id}>
  <div><strong>—</strong><span>睡眠</span></div>
  <div><strong>—</strong><span>运动</span></div>
  <div><strong>—</strong><span>心情</span></div>
</div>
<div class="widget-note">等待生活数据模块接入</div>
