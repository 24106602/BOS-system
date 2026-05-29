export type ProcessLevel = "pass" | "fixed" | "warning" | "error";

export type HighlightColor = "yellow" | "red" | "purple";

export type ProcessLog = {
  time: string;
  level: "info" | "warn" | "error";
  module: "student" | "family" | "database" | "system";
  row?: number;
  field?: string;
  message: string;
};

export type CellIssue = {
  rowIndex: number;
  fieldName: string;
  originalValue: unknown;
  fixedValue?: unknown;
  level: ProcessLevel;
  color?: HighlightColor;
  message: string;
  action: "none" | "fixed" | "marked" | "blocked";
};

export type RuleResult = {
  valid: boolean;
  fixedValue: unknown;
  level: ProcessLevel;
  color?: HighlightColor;
  message: string;
  issue?: CellIssue;
};