import {
  SQL_LIKE_ESCAPE_CLAUSE,
  sqlLikeContains,
} from "../security-utils";
import type { CustomIconRecord } from "./custom-icon";
import { normalizeManagedIconUrl } from "./icon-records";

const BLOCK_USAGE_FIELDS = ["content", "markdown", "fcontent", "ial"] as const;
const IP_ADDRESS_REGEX = "[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}";
const CLEANUP_STEP_DELAY_MS = 10;

export interface LinkIconUsageQueryResponse {
  code?: number;
  data?: unknown;
}

export interface LinkIconCleanupProgress {
  checked: number;
  total: number;
  removedCount: number;
  currentHref: string;
}

export interface LinkIconCleanupResult {
  icons: CustomIconRecord[];
  removedCount: number;
}

export type LinkIconUsageQuery = (
  stmt: string,
) => Promise<LinkIconUsageQueryResponse>;

export type LinkIconFileDelete = (iconUrl: string) => Promise<void>;

export type LinkIconCleanupHandler = (
  icons: CustomIconRecord[],
  onProgress: (progress: LinkIconCleanupProgress) => void,
) => Promise<LinkIconCleanupResult | void>;

export interface LinkIconCleanupLogger {
  debug(message: string, payload?: unknown): void;
}

export interface CleanUnusedLinkIconsOptions {
  icons: CustomIconRecord[];
  queryUsage: LinkIconUsageQuery;
  deleteIconFile: LinkIconFileDelete;
  onProgress?: (progress: LinkIconCleanupProgress) => void;
  logger?: LinkIconCleanupLogger;
  stepDelayMs?: number;
}

function buildFieldLikeCondition(field: string, value: string): string {
  return `${field} LIKE ${sqlLikeContains(value)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
}

function buildFieldRegexpCondition(field: string, pattern: string): string {
  return `${field} REGEXP '${pattern}'`;
}

function buildBlockUsageSql(conditions: string[]): string {
  return `SELECT id FROM blocks WHERE (${conditions.join(" OR ")}) LIMIT 1`;
}

function buildBlockUsageLikeSql(values: string[]): string {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  return buildBlockUsageSql(
    uniqueValues.flatMap((value) =>
      BLOCK_USAGE_FIELDS.map((field) => buildFieldLikeCondition(field, value)),
    ),
  );
}

function buildBlockUsageRegexpSql(pattern: string): string {
  return buildBlockUsageSql(
    BLOCK_USAGE_FIELDS.map((field) => buildFieldRegexpCondition(field, pattern)),
  );
}

function hasUsageRows(response: LinkIconUsageQueryResponse): boolean {
  return response.code === 0 && Array.isArray(response.data) && response.data.length > 0;
}

function getErrorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function buildLinkIconUsageSql(href: string): string {
  if (href === "*.*.*.*" || href === "*.*.*") {
    return buildBlockUsageRegexpSql(IP_ADDRESS_REGEX);
  }

  if (href.startsWith("*.")) {
    const baseDomain = href.replace(/^\*\./, "");
    return buildBlockUsageLikeSql([baseDomain, `.${baseDomain}`]);
  }

  return buildBlockUsageLikeSql([href]);
}

export async function cleanUnusedLinkIcons(
  options: CleanUnusedLinkIconsOptions,
): Promise<LinkIconCleanupResult> {
  const {
    icons,
    queryUsage,
    deleteIconFile,
    onProgress,
    logger,
    stepDelayMs = CLEANUP_STEP_DELAY_MS,
  } = options;
  const nextIcons = [...icons];
  const total = icons.length;
  const removeIndexes: number[] = [];

  for (let index = icons.length - 1; index >= 0; index -= 1) {
    const icon = icons[index];
    onProgress?.({
      checked: total - index,
      total,
      removedCount: removeIndexes.length,
      currentHref: icon.href,
    });

    let shouldRemove = false;
    try {
      const response = await queryUsage(buildLinkIconUsageSql(icon.href));
      shouldRemove = !hasUsageRows(response);
    } catch (error) {
      logger?.debug("检查图标引用失败，已保留该规则", {
        href: icon.href,
        reason: getErrorReason(error),
      });
      shouldRemove = false;
    }

    if (shouldRemove) {
      removeIndexes.push(index);
    }

    await sleep(stepDelayMs);
  }

  if (total > 0 && removeIndexes.length === total) {
    logger?.debug("清理未使用图标已跳过，因为所有规则都被判定为未引用", {
      total,
    });
    return {
      icons: nextIcons,
      removedCount: 0,
    };
  }

  for (const index of removeIndexes) {
    const icon = icons[index];
    const managedIconUrl = normalizeManagedIconUrl(icon.iconUrl);
    if (managedIconUrl) {
      try {
        await deleteIconFile(managedIconUrl);
      } catch (error) {
        logger?.debug("删除未使用图标文件失败", {
          href: icon.href,
          iconUrl: managedIconUrl,
          reason: getErrorReason(error),
        });
      }
    }

    nextIcons.splice(index, 1);
  }

  return {
    icons: nextIcons,
    removedCount: removeIndexes.length,
  };
}
