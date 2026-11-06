import {
  MAX_STATS_LIMIT,
  MEMO_ATTR,
  normalizeYear,
} from "./sqlFilters";

const MEMO_DAY_SELECT = `CASE
      WHEN length(A.value) = 14
        THEN substr(A.value, 1, 4) || '-'
             || substr(A.value, 5, 2) || '-'
             || substr(A.value, 7, 2)
      ELSE substr(B.created, 1, 4) || '-'
           || substr(B.created, 5, 2) || '-'
           || substr(B.created, 7, 2)
    END`;

export function buildHeatmapSQL(): string {
  return `SELECT day, COUNT(*) AS cnt FROM (
  SELECT
    ${MEMO_DAY_SELECT} AS day
  FROM blocks AS B
  JOIN attributes AS A ON B.id = A.block_id
  WHERE A.name = '${MEMO_ATTR}'
)
GROUP BY day
ORDER BY day ASC
LIMIT ${MAX_STATS_LIMIT}`;
}

export function buildYearHeatmapSQL(year: number): string {
  const normalizedYear = normalizeYear(year);

  return `SELECT day, COUNT(*) AS cnt FROM (
  SELECT
    ${MEMO_DAY_SELECT} AS day
  FROM blocks AS B
  JOIN attributes AS A ON B.id = A.block_id
  WHERE A.name = '${MEMO_ATTR}'
    AND substr(A.value, 1, 4) = '${normalizedYear}'
)
GROUP BY day
ORDER BY day ASC
LIMIT ${MAX_STATS_LIMIT}`;
}

export function buildMonthlyStatsSQL(): string {
  return `SELECT month, COUNT(*) AS cnt FROM (
  SELECT
    CASE
      WHEN length(A.value) >= 6
        THEN substr(A.value, 1, 4) || '-' || substr(A.value, 5, 2)
      ELSE substr(B.created, 1, 4) || '-' || substr(B.created, 5, 2)
    END AS month
  FROM blocks AS B
  JOIN attributes AS A ON B.id = A.block_id
  WHERE A.name = '${MEMO_ATTR}'
)
GROUP BY month
ORDER BY month ASC
LIMIT ${MAX_STATS_LIMIT}`;
}

export function buildTimeDistributionSQL(): string {
  return `SELECT CAST(substr(A.value, 9, 2) AS INTEGER) AS hour, COUNT(*) AS cnt
FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name = '${MEMO_ATTR}'
  AND length(A.value) >= 10
GROUP BY hour
ORDER BY hour ASC
LIMIT ${MAX_STATS_LIMIT}`;
}
