import { getBlockDOM, sql } from "../../api";
import {
  BlockDOMService,
  type BlockDOMQueryParams,
} from "./BlockDOMService";
import { HeatmapStatsService } from "./HeatmapStatsService";
import {
  MemoQueryService,
  type MemoQueryParams,
} from "./MemoQueryService";

const SIYUAN_BLOCK_URL_PREFIX = "siyuan://blocks/";
const SIYUAN_BLOCK_URL_SUFFIX = "?focus=1";

export function createDashboardDataBridge() {
  const memoQueryService = new MemoQueryService({ querySQL: sql });
  const blockDOMService = new BlockDOMService({ getBlockDOM });
  const heatmapStatsService = new HeatmapStatsService({ querySQL: sql });

  return {
    loadMemos: (params: MemoQueryParams) => memoQueryService.queryMemos(params),
    loadBlockDOM: (params: BlockDOMQueryParams) =>
      blockDOMService.loadBlockDOM(params),
    loadHeatmapDays: () => heatmapStatsService.queryHeatmapDays(),
    openMemo: openMemoInCurrentWindow,
  };
}

function openMemoInCurrentWindow(memoId: string): void {
  const normalizedMemoId = memoId.trim();
  if (!normalizedMemoId) {
    return;
  }

  const memoUrl = `${SIYUAN_BLOCK_URL_PREFIX}${normalizedMemoId}${SIYUAN_BLOCK_URL_SUFFIX}`;
  window.open(memoUrl, "_self");
}
