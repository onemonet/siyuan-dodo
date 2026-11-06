import { FLOMO_QUERY_ERROR_PREFIX } from "../../config/constants";
import type { AsyncResult, HeatmapDay, MonthStat } from "../types";
import {
  buildHeatmapSQL,
  buildMonthlyStatsSQL,
  buildYearHeatmapSQL,
} from "../utils/sql";

const CONSTANTS = {
  queryHeatmapDays: "queryHeatmapDays",
  queryYearHeatmapDays: "queryYearHeatmapDays",
  queryMonthlyStats: "queryMonthlyStats",
  fieldDay: "day",
  fieldMonth: "month",
  fieldCount: "cnt",
} as const;

type SQLRow = Record<string, unknown>;

export interface HeatmapStatsServiceDeps {
  querySQL: (statement: string) => Promise<SQLRow[]>;
}

function toSafeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

function toSafeCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function buildServiceError(functionName: string, context: string, error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `${FLOMO_QUERY_ERROR_PREFIX}.${functionName}(${context}): ${errorMessage}`;
}

function toHeatmapDay(row: SQLRow): HeatmapDay | null {
  const dayKey = toSafeString(row[CONSTANTS.fieldDay]).trim();
  if (!dayKey) {
    return null;
  }

  return {
    dayKey,
    count: toSafeCount(row[CONSTANTS.fieldCount]),
  };
}

function toMonthStat(row: SQLRow): MonthStat | null {
  const month = toSafeString(row[CONSTANTS.fieldMonth]).trim();
  if (!month) {
    return null;
  }

  return {
    month,
    count: toSafeCount(row[CONSTANTS.fieldCount]),
  };
}

export class HeatmapStatsService {
  private readonly querySQL: HeatmapStatsServiceDeps["querySQL"];

  constructor(deps: HeatmapStatsServiceDeps) {
    this.querySQL = deps.querySQL;
  }

  async queryHeatmapDays(): Promise<AsyncResult<HeatmapDay[]>> {
    return this.queryDaysFromStatement(
      buildHeatmapSQL(),
      CONSTANTS.queryHeatmapDays,
      "statement=buildHeatmapSQL",
    );
  }

  async queryYearHeatmapDays(year: number): Promise<AsyncResult<HeatmapDay[]>> {
    return this.queryDaysFromStatement(
      buildYearHeatmapSQL(year),
      CONSTANTS.queryYearHeatmapDays,
      `statement=buildYearHeatmapSQL,year=${year}`,
    );
  }

  async queryMonthlyStats(): Promise<AsyncResult<MonthStat[]>> {
    try {
      const rows = await this.querySQL(buildMonthlyStatsSQL());
      const data = rows
        .map((row) => toMonthStat(row))
        .filter((monthStat): monthStat is MonthStat => Boolean(monthStat))
        .sort((leftMonth, rightMonth) =>
          leftMonth.month.localeCompare(rightMonth.month),
        );

      return { data, error: null };
    } catch (error) {
      return {
        data: [],
        error: buildServiceError(
          CONSTANTS.queryMonthlyStats,
          "statement=buildMonthlyStatsSQL",
          error,
        ),
      };
    }
  }

  private async queryDaysFromStatement(
    statement: string,
    functionName: string,
    context: string,
  ): Promise<AsyncResult<HeatmapDay[]>> {
    try {
      const rows = await this.querySQL(statement);
      const data = rows
        .map((row) => toHeatmapDay(row))
        .filter((day): day is HeatmapDay => Boolean(day))
        .sort((leftDay, rightDay) => leftDay.dayKey.localeCompare(rightDay.dayKey));

      return { data, error: null };
    } catch (error) {
      return {
        data: [],
        error: buildServiceError(
          functionName,
          context,
          error,
        ),
      };
    }
  }
}
