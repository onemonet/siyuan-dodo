import { TimelineTableData } from "../types";

export class TimelineTableParserService {
  static parseTableKramdown(kramdown: string): TimelineTableData {
    const lines = kramdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|") && line.endsWith("|"));

    if (lines.length === 0) {
      return {
        headers: [],
        rows: [],
        hasHeader: false,
      };
    }

    const parsedLines = lines.map((line) => this.parseTableLine(line));
    const hasSeparator = parsedLines.length > 1 && this.isSeparatorRow(parsedLines[1]);

    return {
      headers: hasSeparator ? parsedLines[0] : [],
      rows: hasSeparator ? parsedLines.slice(2) : parsedLines,
      hasHeader: hasSeparator,
    };
  }

  private static parseTableLine(line: string): string[] {
    return line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
  }

  private static isSeparatorRow(cells: string[]): boolean {
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
  }
}
