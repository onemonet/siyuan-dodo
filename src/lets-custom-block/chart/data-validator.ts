import { CHART_TYPE_CONFIGS } from "./chart-types";
import { SupportedChartType, TableData, ValidationResult } from "./types";

export class DataValidatorService {
  static validateTableData(
    tableData: TableData,
    chartType: SupportedChartType
  ): ValidationResult {
    const config = CHART_TYPE_CONFIGS[chartType];

    if (!tableData.headers.length && !tableData.rows.length) {
      return { valid: false, message: "表格不能为空" };
    }

    if (tableData.rows.length < config.minRows) {
      return {
        valid: false,
        message: `数据行数不足，至少需要 ${config.minRows} 行`,
      };
    }

    const columnCount = tableData.headers.length || tableData.rows[0]?.length || 0;
    if (columnCount < config.minColumns) {
      return {
        valid: false,
        message: `列数不足，${config.label} 至少需要 ${config.minColumns} 列`,
      };
    }

    if (chartType === "pie-basic") {
      return this.validatePie(tableData);
    }

    if (chartType === "scatter-basic") {
      return this.validateScatter(tableData);
    }

    if (chartType === "radar-basic") {
      return this.validateRadar(tableData);
    }

    return this.validateCartesian(tableData);
  }

  private static validatePie(tableData: TableData): ValidationResult {
    if (tableData.numericColumns.length === 0 || !tableData.numericColumns.includes(1)) {
      return { valid: false, message: "饼图要求第二列必须为数值列" };
    }

    return { valid: true };
  }

  private static validateScatter(tableData: TableData): ValidationResult {
    if (!tableData.numericColumns.includes(0) || !tableData.numericColumns.includes(1)) {
      return { valid: false, message: "散点图要求前两列必须为数值列" };
    }

    return { valid: true };
  }

  private static validateRadar(tableData: TableData): ValidationResult {
    if (tableData.headers.length < 3) {
      return { valid: false, message: "雷达图至少需要 1 列系列名和 2 列维度" };
    }

    const allNumeric = tableData.rows.every((row) =>
      row.slice(1).every((cell) => this.isNumeric(cell))
    );
    if (!allNumeric) {
      return { valid: false, message: "雷达图除第一列外，其他列都必须为数值" };
    }

    return { valid: true };
  }

  private static validateCartesian(tableData: TableData): ValidationResult {
    if (tableData.numericColumns.length === 0) {
      return { valid: false, message: "未找到数值列，请检查表格数据" };
    }

    return { valid: true };
  }

  static isNumeric(value: string): boolean {
    if (typeof value !== "string") {
      return false;
    }
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) {
      return false;
    }
    return !Number.isNaN(Number(normalized));
  }

  static toNumber(value: string): number {
    return Number(value.trim().replace(/,/g, ""));
  }
}
