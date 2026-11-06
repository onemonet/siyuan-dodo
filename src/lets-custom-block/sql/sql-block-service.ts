import {
  SQL_LIKE_ESCAPE_CLAUSE,
  escapeSqlLikeValue,
  sqlLikeContains,
  sqlString,
} from "../../security-utils";
import {
  getBlockAttrs,
  getChildBlocks,
  insertBlock,
  setBlockAttrs,
  sql,
  updateBlock,
} from "../../api";
import { settings } from "../../settings";
import pluginMetadata from "../plugin";

export const SQL_BLOCK_ATTR = "custom-dodo-block";
export const SQL_BLOCK_TYPE = "sql";
export const SQL_CONFIG_ATTR = "custom-dodo-sql-config";
export const SQL_CONFIG_VERSION = 4;
export const SQL_MAX_FILTERS = 8;

export type SqlBlockType = "" | "d" | "h" | "p" | "l" | "i" | "c" | "m" | "t" | "b" | "s";
export type SqlSortField = "updated" | "created" | "content" | "attribute_value" | "random";
export type SqlSortOrder = "ASC" | "DESC";
export type SqlAttributeMatch = "exact" | "prefix";
export type SqlFilterField =
  | "content"
  | "type"
  | "created"
  | "updated"
  | "id"
  | "parent_id"
  | "root_id"
  | "attribute";
export type SqlFilterOperator =
  | "contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "before"
  | "after"
  | "last_days"
  | "is_empty"
  | "is_not_empty";

export interface SqlFilter {
  field: SqlFilterField;
  operator: SqlFilterOperator;
  value: string;
}

export interface SqlAttributeFilter {
  name: string;
  match: SqlAttributeMatch;
}

export interface SqlBlockConfig {
  version: typeof SQL_CONFIG_VERSION;
  filters: SqlFilter[];
  sortField: SqlSortField;
  sortOrder: SqlSortOrder;
  limit: number;
}

interface LegacySqlBlockConfig {
  keyword?: unknown;
  blockType?: unknown;
  attribute?: unknown;
}

type SqlConfigInput = Partial<SqlBlockConfig> & LegacySqlBlockConfig;

export interface SqlBlockOperationResult {
  success: boolean;
  message?: string;
  sqlBlockId?: string;
}

export const SQL_FILTER_FIELDS: ReadonlyArray<SqlFilterField> = [
  "content",
  "type",
  "created",
  "updated",
  "id",
  "parent_id",
  "root_id",
  "attribute",
];

export const SQL_FILTER_OPERATORS: Record<SqlFilterField, ReadonlyArray<SqlFilterOperator>> = {
  content: ["contains", "equals", "not_equals", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  type: ["equals", "not_equals", "is_empty", "is_not_empty"],
  created: ["equals", "before", "after", "last_days", "is_empty", "is_not_empty"],
  updated: ["equals", "before", "after", "last_days", "is_empty", "is_not_empty"],
  id: ["equals", "not_equals", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  parent_id: ["equals", "not_equals", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  root_id: ["equals", "not_equals", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  attribute: ["contains", "equals", "not_equals", "starts_with", "ends_with"],
};

const DEFAULT_CONFIG: SqlBlockConfig = {
  version: SQL_CONFIG_VERSION,
  filters: [],
  sortField: "updated",
  sortOrder: "DESC",
  limit: 20,
};

const BLOCK_TYPES = new Set<SqlBlockType>([
  "",
  "d",
  "h",
  "p",
  "l",
  "i",
  "c",
  "m",
  "t",
  "b",
  "s",
]);

const SORT_FIELDS = new Set<SqlSortField>(["updated", "created", "content", "attribute_value", "random"]);
const FILTER_FIELDS = new Set<SqlFilterField>(SQL_FILTER_FIELDS);

export class SqlBlockService {
  static isSqlBlock(blockElement: HTMLElement): boolean {
    return blockElement.getAttribute(SQL_BLOCK_ATTR) === SQL_BLOCK_TYPE;
  }

  static getDefaultConfig(): SqlBlockConfig {
    return {
      ...DEFAULT_CONFIG,
      filters: [],
    };
  }

  static parseConfig(raw: string | undefined): SqlBlockConfig {
    if (!raw) {
      return this.getDefaultConfig();
    }

    try {
      return this.normalizeConfig(JSON.parse(raw) as SqlConfigInput);
    } catch (_error) {
      return this.getDefaultConfig();
    }
  }

  static normalizeConfig(config: SqlConfigInput): SqlBlockConfig {
    const migratedAttributeFilters = this.migrateAttributeFilter(config.attribute);
    const sourceFilters = Array.isArray(config.filters)
      ? config.filters
      : this.migrateLegacyFilters(config);
    const filters = [...migratedAttributeFilters, ...sourceFilters]
      .map((filter) => this.normalizeFilter(filter))
      .filter((filter): filter is SqlFilter => filter !== null)
      .slice(0, SQL_MAX_FILTERS);
    const limit = Number(config.limit);

    return {
      version: SQL_CONFIG_VERSION,
      filters,
      sortField: SORT_FIELDS.has(config.sortField as SqlSortField)
        ? (config.sortField as SqlSortField)
        : DEFAULT_CONFIG.sortField,
      sortOrder: config.sortOrder === "ASC" ? "ASC" : DEFAULT_CONFIG.sortOrder,
      limit: Number.isFinite(limit)
        ? Math.min(200, Math.max(1, Math.round(limit)))
        : DEFAULT_CONFIG.limit,
    };
  }

  private static normalizeAttributeFilter(raw: unknown): SqlAttributeFilter | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const source = raw as Partial<SqlAttributeFilter>;
    const name = typeof source.name === "string" ? source.name.trim() : "";
    return name
      ? { name, match: source.match === "exact" ? "exact" : "prefix" }
      : undefined;
  }

  static normalizeFilter(raw: unknown): SqlFilter | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const source = raw as Partial<SqlFilter>;
    const field = FILTER_FIELDS.has(source.field as SqlFilterField)
      ? (source.field as SqlFilterField)
      : null;
    if (!field) {
      return null;
    }

    const operators = SQL_FILTER_OPERATORS[field];
    const operator = operators.includes(source.operator as SqlFilterOperator)
      ? (source.operator as SqlFilterOperator)
      : operators[0];

    return {
      field,
      operator,
      value: typeof source.value === "string" ? source.value.trim() : "",
    };
  }

  static buildStatement(config: SqlConfigInput): string {
    const normalized = this.normalizeConfig(config);
    const useAttributes =
      normalized.sortField === "attribute_value" ||
      normalized.filters.some((filter) => filter.field === "attribute");
    const random = normalized.sortField === "random";
    const conditions = [`${useAttributes ? "B.type" : "type"} <> ${sqlString("query_embed")}`];

    for (const filter of normalized.filters) {
      const condition = this.buildFilterCondition(filter, useAttributes);
      if (condition) {
        conditions.push(condition);
      }
    }

    return [
      useAttributes ? "SELECT DISTINCT B.* FROM blocks AS B" : "SELECT * FROM blocks",
      ...(useAttributes ? ["JOIN attributes AS A ON B.id = A.block_id"] : []),
      `WHERE ${conditions.join(" AND ")}`,
      `ORDER BY ${random ? "RANDOM()" : `${this.getSortColumn(normalized, useAttributes)} ${normalized.sortOrder}`}`,
      `LIMIT ${normalized.limit}`,
    ].join("\n");
  }

  static buildEmbedContent(config: SqlConfigInput): string {
    // 思源要求 {{ }} 查询独占一行；设置面板仍使用多行 SQL 展示。
    const statement = this.buildStatement(config).replace(/\r?\n/g, " ");
    return `{{ ${statement} }}`;
  }

  static async createSQLBlockAtCaret(options: {
    insertAfterBlockId: string;
    config?: SqlConfigInput;
  }): Promise<SqlBlockOperationResult> {
    try {
      const config = this.normalizeConfig(options.config || {});
      const operations = await insertBlock(
        "markdown",
        this.buildEmbedContent(config),
        undefined,
        options.insertAfterBlockId,
      );
      const sqlBlockId =
        operations?.[0]?.doOperations?.[0]?.id ||
        (await this.locateSiblingBlockAfter(options.insertAfterBlockId));

      if (!sqlBlockId) {
        return {
          success: false,
          message: "插入 SQL 块失败：未获取到新块 ID",
        };
      }

      await this.writeSQLBlock(sqlBlockId, config);
      return { success: true, sqlBlockId };
    } catch (error) {
      console.error("[SQL块] 插入 SQL 块失败", error);
      return { success: false, message: "插入 SQL 块失败，请查看控制台日志" };
    }
  }

  static async getSQLSettings(sqlBlockId: string): Promise<{
    ok: boolean;
    config: SqlBlockConfig;
    statement: string;
    message?: string;
  }> {
    try {
      const attrs = await getBlockAttrs(sqlBlockId);
      const config = this.parseConfig(attrs[SQL_CONFIG_ATTR]);
      return {
        ok: true,
        config,
        statement: this.buildStatement(config),
      };
    } catch (error) {
      console.error("[SQL块] 读取 SQL 设置失败", error);
      return {
        ok: false,
        config: this.getDefaultConfig(),
        statement: "",
        message: "读取 SQL 设置失败",
      };
    }
  }

  static async applySQLSettings(
    sqlBlockId: string,
    config: SqlConfigInput,
  ): Promise<SqlBlockOperationResult> {
    try {
      const normalized = this.normalizeConfig(config);
      await this.writeSQLBlock(sqlBlockId, normalized);
      return { success: true, sqlBlockId };
    } catch (error) {
      console.error("[SQL块] 应用 SQL 设置失败", error);
      return { success: false, message: "应用 SQL 设置失败，请查看控制台日志" };
    }
  }

  private static async writeSQLBlock(
    sqlBlockId: string,
    config: SqlBlockConfig,
  ): Promise<void> {
    // 查询嵌入块的 Markdown 只能是独占一行的 {{ ... }}；IAL 在更新后单独写入。
    await updateBlock("markdown", this.buildEmbedContent(config), sqlBlockId, false);
    await setBlockAttrs(sqlBlockId, {
      [SQL_BLOCK_ATTR]: SQL_BLOCK_TYPE,
      [SQL_CONFIG_ATTR]: JSON.stringify(config),
    });
    const expectedConfig = JSON.stringify(config);

    // ponytail: bounded retry for the kernel's asynchronous attribute index update.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const attrs = await getBlockAttrs(sqlBlockId);
      if (
        attrs[SQL_BLOCK_ATTR] === SQL_BLOCK_TYPE &&
        attrs[SQL_CONFIG_ATTR] === expectedConfig
      ) {
        return;
      }
      if (attempt < 19) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    console.warn("[SQL块] 属性已提交，但内核属性索引尚未立即可读", sqlBlockId);
  }

  private static migrateLegacyFilters(config: SqlConfigInput): unknown[] {
    const filters: SqlFilter[] = [];
    if (typeof config.keyword === "string" && config.keyword.trim()) {
      filters.push({
        field: "content",
        operator: "contains",
        value: config.keyword.trim(),
      });
    }
    if (typeof config.blockType === "string" && BLOCK_TYPES.has(config.blockType as SqlBlockType) && config.blockType) {
      filters.push({
        field: "type",
        operator: "equals",
        value: config.blockType,
      });
    }
    return filters;
  }

  private static buildFilterCondition(
    filter: SqlFilter,
    qualified: boolean,
  ): string {
    if (filter.field === "attribute") {
      return this.buildAttributeFilterCondition(filter);
    }
    const column = this.getFilterColumn(filter.field);
    if (!column) {
      return "";
    }
    const columnName = qualified ? `B.${column}` : column;

    if (filter.operator === "is_empty") {
      return `(${columnName} IS NULL OR ${columnName} = '')`;
    }
    if (filter.operator === "is_not_empty") {
      return `(${columnName} IS NOT NULL AND ${columnName} <> '')`;
    }
    if (!filter.value) {
      return "";
    }

    switch (filter.operator) {
        case "equals":
          return `${columnName} = ${sqlString(filter.value)}`;
        case "not_equals":
          return `${columnName} <> ${sqlString(filter.value)}`;
        case "contains":
          return `${columnName} LIKE ${sqlLikeContains(filter.value)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
        case "starts_with":
          return `${columnName} LIKE ${sqlString(`${escapeSqlLikeValue(filter.value)}%`)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
        case "ends_with":
          return `${columnName} LIKE ${sqlString(`%${escapeSqlLikeValue(filter.value)}`)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
        case "before":
          return `${columnName} < ${sqlString(filter.value)}`;
        case "after":
          return `${columnName} > ${sqlString(filter.value)}`;
        case "last_days": {
          const days = Number(filter.value);
          if (!Number.isFinite(days) || days <= 0) {
            return "";
          }
          return `${columnName} >= strftime('%Y%m%d%H%M%S', datetime('now', '-${Math.round(days)} days'))`;
        }
      default:
        return "";
    }
  }

  private static buildAttributeFilterCondition(filter: SqlFilter): string {
    const raw = filter.value.trim();
    if (!raw) {
      return "";
    }

    const parsed = this.parseAttributeFilterValue(raw);
    const nameCondition = this.buildAttributeNameCondition(parsed.name, filter.operator);
    if (parsed.value === undefined) {
      return nameCondition;
    }

    const valueCondition =
      filter.operator === "contains"
        ? `A.value LIKE ${sqlLikeContains(parsed.value)} ${SQL_LIKE_ESCAPE_CLAUSE}`
        : `A.value = ${sqlString(parsed.value)}`;
    return `(${nameCondition} AND ${valueCondition})`;
  }

  private static parseAttributeFilterValue(raw: string): {
    name: string;
    value?: string;
  } {
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex <= 0) {
      return { name: raw };
    }

    const name = raw.slice(0, equalsIndex).trim();
    let value = raw.slice(equalsIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    return { name, value };
  }

  private static buildAttributeNameCondition(
    name: string,
    operator: SqlFilterOperator,
  ): string {
    switch (operator) {
      case "equals":
        return `A.name = ${sqlString(name)}`;
      case "not_equals":
        return `A.name <> ${sqlString(name)}`;
      case "starts_with":
        return `A.name LIKE ${sqlString(`${escapeSqlLikeValue(name)}%`)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
      case "ends_with":
        return `A.name LIKE ${sqlString(`%${escapeSqlLikeValue(name)}`)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
      case "contains":
      default:
        return `A.name LIKE ${sqlLikeContains(name)} ${SQL_LIKE_ESCAPE_CLAUSE}`;
    }
  }

  private static getFilterColumn(field: SqlFilterField): string {
    switch (field) {
      case "content":
      case "type":
      case "created":
      case "updated":
      case "id":
      case "parent_id":
      case "root_id":
        return field;
      default:
        return "";
    }
  }

  private static getSortColumn(
    config: SqlBlockConfig,
    useAttributes: boolean,
  ): string {
    if (config.sortField === "attribute_value") {
      return "A.value";
    }
    return useAttributes ? `B.${config.sortField}` : config.sortField;
  }

  private static migrateAttributeFilter(raw: unknown): SqlFilter[] {
    const attribute = this.normalizeAttributeFilter(raw);
    if (!attribute) {
      return [];
    }
    return [
      {
        field: "attribute",
        operator: attribute.match === "exact" ? "equals" : "starts_with",
        value: attribute.name,
      },
    ];
  }

  private static async locateSiblingBlockAfter(blockId: string): Promise<string> {
    const rows = await sql(`SELECT parent_id FROM blocks WHERE id = ${sqlString(blockId)}`);
    const parentId = rows?.[0]?.parent_id;
    if (!parentId) {
      return "";
    }

    const children = await getChildBlocks(parentId);
    const index = children.findIndex((child) => child.id === blockId);
    return index >= 0 && index + 1 < children.length
      ? children[index + 1]?.id || ""
      : "";
  }

  static resolveDefaultConfig(): SqlBlockConfig {
    const configuredLimit = settings.getBySpace(
      pluginMetadata.name,
      "sql-default-limit",
    );
    return this.normalizeConfig({
      limit: typeof configuredLimit === "number" ? configuredLimit : DEFAULT_CONFIG.limit,
    });
  }
}
