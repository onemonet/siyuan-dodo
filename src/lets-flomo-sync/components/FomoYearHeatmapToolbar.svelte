<script lang="ts">
  const TEXT = {
    title: "年度热力图",
    yearSuffix: "年",
  } as const;

  export let year: number;
</script>

<div class="toolbar">
  <div class="title-group">
    <span class="title">{TEXT.title}</span>
    <span class="meta">{year} {TEXT.yearSuffix}</span>
  </div>
</div>
