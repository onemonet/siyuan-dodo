<script lang="ts">
  import LayoutDashboard from "lucide-svelte/icons/layout-dashboard";
  import Plus from "lucide-svelte/icons/plus";
  import Settings2 from "lucide-svelte/icons/settings-2";
  import Zap from "lucide-svelte/icons/zap";
  import type { HomeWidget } from "../config";

  export let widget: HomeWidget;
</script>

<div class="tool-grid" data-widget-type={widget.id}>
  <span><Zap size={14} /> 快捷输入</span>
  <span><LayoutDashboard size={14} /> SQL 块</span>
  <span><Settings2 size={14} /> 自定义块</span>
  <span><Plus size={14} /> 更多工具</span>
</div>
