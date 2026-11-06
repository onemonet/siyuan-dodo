<script lang="ts">
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;
</script>

<div class="widget-main-copy" data-widget-type={widget.id}>
  <span class="empty-number">01</span>
  <div>
    <strong>留下一个值得回看的片段</strong>
    <span>后续接入今日笔记、速记入口和最近编辑的文档。</span>
  </div>
</div>
<div class="widget-footer-line"><span>笔记入口</span><span class="accent-line"></span><span>待接入</span></div>
