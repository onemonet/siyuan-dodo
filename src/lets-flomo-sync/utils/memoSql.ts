import {
  MAX_MEMO_LIMIT,
  MAX_STATS_LIMIT,
  MEMO_ATTR,
  MEMO_ATTR_LIKE,
  buildContentKeywordConditions,
  buildDateConditions,
  buildReviewRangeCondition,
  buildTagConditions,
  clampLimit,
  normalizeKeywordTerms,
} from "./sqlFilters";
import {
  SQL_LIKE_ESCAPE_CLAUSE,
  scanSqlStatement,
  sqlLikeContains,
} from "../../security-utils";
import type { MemoFilter, ReviewTimeRange } from "./sqlTypes";

const CUSTOM_SQL_KEYWORD_FIELD = "B.content";
const CUSTOM_SQL_KEYWORD_REGEX = /B\.content\s+LIKE\s+'%([^']+)%'/i;
const CUSTOM_SQL_LIMIT_REGEX = /\sLIMIT\s+\d+\s*;?\s*$/i;
const CUSTOM_SQL_STATEMENT_END_REGEX = /;+\s*$/;
const CUSTOM_SQL_WRITE_KEYWORD_REGEX =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM|ATTACH|DETACH|PRAGMA)\b/i;

export function validateReadonlyMemoSQL(statement: string): string | null {
  const rawStatement = statement.trim();
  const normalizedStatement = trimSQLStatement(statement);
  if (!normalizedStatement) {
    return null;
  }

  const scanResult = scanSqlStatement(rawStatement);
  const sqlCode = scanResult.code.trim();

  if (!/^(SELECT|WITH)\b/i.test(sqlCode)) {
    return "自定义 SQL 只允许 SELECT/WITH 查询";
  }

  if (scanResult.hasUnclosedToken) {
    return "自定义 SQL 存在未闭合的字符串、标识符或注释";
  }

  if (scanResult.hasComment) {
    return "自定义 SQL 不允许包含注释";
  }

  if (scanResult.hasMultipleStatements) {
    return "自定义 SQL 只允许单条查询语句";
  }

  if (CUSTOM_SQL_WRITE_KEYWORD_REGEX.test(sqlCode)) {
    return "自定义 SQL 不允许包含写入或结构变更语句";
  }

  return null;
}

function buildCustomKeywordConditions(keywords: string[]): string {
  return keywords
    .map((keyword) => `${CUSTOM_SQL_KEYWORD_FIELD} LIKE ${sqlLikeContains(keyword)} ${SQL_LIKE_ESCAPE_CLAUSE}`)
    .join(" AND ");
}

function expandCustomSQLKeywords(statement: string): string {
  const match = statement.match(CUSTOM_SQL_KEYWORD_REGEX);
  if (!match) {
    return statement;
  }

  const keywords = normalizeKeywordTerms(match[1]);
  if (keywords.length <= 1) {
    return statement;
  }

  return statement.replace(
    CUSTOM_SQL_KEYWORD_REGEX,
    buildCustomKeywordConditions(keywords),
  );
}

function trimSQLStatement(statement: string): string {
  return statement.trim().replace(CUSTOM_SQL_STATEMENT_END_REGEX, "");
}

function appendLimitToSQL(statement: string, limit: number): string {
  const normalizedStatement = trimSQLStatement(statement);
  const normalizedLimit = clampLimit(limit, MAX_MEMO_LIMIT);
  const statementWithoutLimit = normalizedStatement.replace(CUSTOM_SQL_LIMIT_REGEX, "");
  return `${statementWithoutLimit}\nLIMIT ${normalizedLimit}`;
}

export function buildCustomMemoSQL(statement: string, limit: number): string {
  const normalizedStatement = trimSQLStatement(statement);
  if (!normalizedStatement) {
    return "";
  }

  const validationError = validateReadonlyMemoSQL(normalizedStatement);
  if (validationError) {
    return "";
  }

  const statementWithExpandedKeywords = expandCustomSQLKeywords(normalizedStatement);
  return appendLimitToSQL(statementWithExpandedKeywords, limit);
}

export function buildMemoSQL(filter: MemoFilter): string {
  const order = filter.orderBy === "asc" ? "ASC" : "DESC";
  const limit = clampLimit(filter.limit, MAX_MEMO_LIMIT);
  const conditions = [
    ...buildDateConditions(filter),
    ...buildContentKeywordConditions(filter),
    ...buildTagConditions(filter),
  ];

  return `SELECT DISTINCT B.*
FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name LIKE '${MEMO_ATTR_LIKE}'
${conditions.join("\n")}
ORDER BY A.value ${order}
LIMIT ${limit}`;
}

export function buildTagListSQL(filter: MemoFilter): string {
  const tagFilter = buildTagStatFilter(filter);
  const conditions = [
    ...buildDateConditions(tagFilter),
    ...buildContentKeywordConditions(tagFilter),
  ];

  return `SELECT B.tag
FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name LIKE '${MEMO_ATTR_LIKE}'
  AND B.tag != ''
  AND B.tag IS NOT NULL
${conditions.join("\n")}
ORDER BY A.value DESC
LIMIT ${MAX_STATS_LIMIT}`;
}

export function buildDailyReviewSQL(count: number, timeRange: ReviewTimeRange): string {
  const reviewCount = clampLimit(count, MAX_MEMO_LIMIT);
  const rangeCondition = buildReviewRangeCondition(timeRange);

  return `SELECT DISTINCT B.*
FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name = '${MEMO_ATTR}'
${rangeCondition ? `  ${rangeCondition}\n` : ""}ORDER BY RANDOM()
LIMIT ${reviewCount}`;
}

function buildTagStatFilter(filter: MemoFilter): MemoFilter {
  return {
    ...filter,
    tagMode: "all",
    tags: undefined,
  };
}
