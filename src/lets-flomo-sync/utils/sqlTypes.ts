export interface MemoFilter {
  dateMode: "all" | "recent" | "day" | "range";
  recentDays?: number;
  day?: string;
  rangeStart?: string;
  rangeEnd?: string;
  keyword?: string;
  tagMode: "all" | "include_and" | "include_or" | "exclude" | "none";
  tags?: string[];
  orderBy: "desc" | "asc";
  limit: number;
}

export type ReviewTimeRange = "all" | "1year" | "6months" | "3months" | "1month";
