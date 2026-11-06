<script lang="ts">
  const TEXT = {
    title: "活动热力图",
    totalPrefix: "共",
    totalSuffix: "条记录",
  } as const;

  export let totalCount = 0;
</script>

<div class="heatmap-header">
  <span class="heatmap-title">{TEXT.title}</span>
  <span class="heatmap-total">
    {TEXT.totalPrefix} {totalCount} {TEXT.totalSuffix}
  </span>
</div>
