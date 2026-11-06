<script lang="ts">
  import BrainCircuit from "lucide-svelte/icons/brain-circuit";
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;
</script>

<div class="ai-prompt" data-widget-type={widget.id}><BrainCircuit size={18} /><span>今天想和 AI 一起完成什么？</span></div>
<div class="ai-chips"><span>整理</span><span>提炼</span><span>生成</span></div>
