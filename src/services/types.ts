// 业务服务共享类型：供模板解析、数据处理和页面状态共同使用。
import type * as XLSX from "xlsx-js-style";

export type LogType = "info" | "success" | "error";
export type MarkColor = "yellow" | "red" | "purple";

export type LogItem = { type: LogType; message: string; time: string };

export type WorkbookData = {
  book: XLSX.WorkBook;
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
  worksheets: Record<string, XLSX.WorkSheet>;
};

export type ColumnMapItem = {
  templateField: string;
  templateIndex: number;
  sourceIndex: number;
  sourceHeader: string;
  mode: "字段匹配" | "同列兜底" | "未匹配";
};

export type HighlightInfo = { color: MarkColor; reason: string };

export type CheckResult = {
  value: string;
  valid: boolean;
  repaired: boolean;
  reason: string;
  highlight: boolean;
  highlightColor?: MarkColor;
  disqualified?: boolean;
};

export type DisqualifiedRow = {
  rowNumber: number;
  name: string;
  idCard: string;
  income: string;
  reason: string;
};

export type FamilyReviewRow = {
  rowNumber: number;
  studentId: string;
  memberName: string;
  relation: string;
  reason: string;
};

export type ProcessingStats = {
  total: number;
  repaired: number;
  errors: number;
  missingFields: number;
  removedFields: number;
  highlighted: number;
  disqualified: number;
};

export type FamilyProcessingStats = {
  total: number;
  repaired: number;
  errors: number;
  missingFields: number;
  removedFields: number;
  highlighted: number;
  review: number;
  databaseMiss: number;
};

export type TemplateParseResult = {
  workbookData: WorkbookData;
  outputSheet: string;
  dictSheet: string;
  firstRow: unknown[];
  secondRow: unknown[];
  fields: string[];
  dictionaries: Record<string, string[]>;
  fieldToDict: Record<string, string>;
};

export type ProcessLog = Omit<LogItem, "time">;

export type ErrorReportItem = {
  rowIndex: number;
  fieldName: string;
  originalValue: unknown;
  fixedValue: unknown;
  issueType: string;
  action: string;
};
