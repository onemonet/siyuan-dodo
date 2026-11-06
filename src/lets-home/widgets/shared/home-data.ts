import { getFrontend, openMobileFileById, openTab } from "siyuan";
import { sql } from "../../../api";

export interface RecentDocumentItem {
  id: string;
  title: string;
  hpath: string;
  updated: string;
}

export interface HomeTaskItem {
  id: string;
  rootId: string;
  content: string;
  hpath: string;
  updated: string;
}

export interface HomeStatistics {
  documents: number;
  openTasks: number;
  updatedToday: number;
  totalBlocks: number;
}

function normalizeCount(rows: any[]): number {
  const value = rows?.[0]?.count ?? rows?.[0]?.COUNT ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTodayPrefix(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function loadRecentDocuments(limit = 8): Promise<RecentDocumentItem[]> {
  const safeLimit = Math.min(20, Math.max(1, Math.round(limit)));
  const rows = await sql(`
    SELECT id, content, hpath, updated
    FROM blocks
    WHERE type = 'd'
    ORDER BY updated DESC
    LIMIT ${safeLimit}
  `);

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    title: String(row.content || row.hpath?.split("/").pop() || "未命名文档"),
    hpath: String(row.hpath ?? ""),
    updated: String(row.updated ?? ""),
  }));
}

export async function loadOpenTasks(limit = 12): Promise<HomeTaskItem[]> {
  const safeLimit = Math.min(30, Math.max(1, Math.round(limit)));
  const rows = await sql(`
    SELECT id, root_id, content, hpath, updated
    FROM blocks
    WHERE type = 'i'
      AND markdown LIKE '%[ ]%'
    ORDER BY updated DESC
    LIMIT ${safeLimit}
  `);

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    rootId: String(row.root_id ?? row.id ?? ""),
    content: String(row.content || "未命名任务"),
    hpath: String(row.hpath ?? ""),
    updated: String(row.updated ?? ""),
  }));
}

export async function loadHomeStatistics(): Promise<HomeStatistics> {
  const today = getTodayPrefix();
  const [documents, tasks, updatedToday, totalBlocks] = await Promise.all([
    sql("SELECT COUNT(*) AS count FROM blocks WHERE type = 'd'"),
    sql("SELECT COUNT(*) AS count FROM blocks WHERE type = 'i' AND markdown LIKE '%[ ]%'"),
    sql(`SELECT COUNT(*) AS count FROM blocks WHERE type = 'd' AND updated LIKE '${today}%'`),
    sql("SELECT COUNT(*) AS count FROM blocks"),
  ]);

  return {
    documents: normalizeCount(documents),
    openTasks: normalizeCount(tasks),
    updatedToday: normalizeCount(updatedToday),
    totalBlocks: normalizeCount(totalBlocks),
  };
}

export function openSiyuanBlock(id: string): void {
  if (!id) {
    return;
  }

  const app = window.siyuan?.ws?.app || {};
  const frontend = getFrontend();
  if (frontend === "mobile" || frontend === "browser-mobile") {
    openMobileFileById(app, id);
    return;
  }

  openTab({ app, doc: { id } });
}

export function formatCompactDate(value: string): string {
  if (!/^\d{14}$/.test(value)) {
    return "";
  }

  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  return `${month}-${day} ${hour}:${minute}`;
}
