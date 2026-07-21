import type { WorkbookData } from "../services/types";

export type AwardType = "national" | "inspirational" | "shanghai";
export type AwardReviewStatus = "draft" | "confirmed";
export type AwardSubmitStatus = "pending" | "submitted";

export type AwardRuleKind =
  | "text"
  | "number"
  | "date"
  | "idCard"
  | "studentId"
  | "enum"
  | "yesNo";

export type AwardDateFormat = "YYYYMMDD" | "YYYY-MM-DD" | "YYYY/MM/DD";

export type AwardFieldRule = {
  field: string;
  columnIndex: number;
  requirement: string;
  required: boolean;
  kind: AwardRuleKind;
  maxLength?: number;
  enumValues?: string[];
  dateFormat?: AwardDateFormat;
};

export type AwardProcessedRow = {
  sourceRowIndex: number;
  excelRowNumber: number;
  values: Record<string, unknown>;
};

export type AwardIssue = {
  rowIndex: number;
  rowNumber: number;
  columnIndex: number;
  field: string;
  originalValue: unknown;
  value: unknown;
  reason: string;
  severity: "error";
  suggestion: string;
};

export type AwardRepairLog = {
  rowIndex: number;
  rowNumber: number;
  columnIndex: number;
  field: string;
  originalValue: unknown;
  fixedValue: unknown;
  reason: string;
};

export type AwardProcessResult = {
  passedRows: AwardProcessedRow[];
  failedRows: AwardProcessedRow[];
  issues: AwardIssue[];
  logs: AwardRepairLog[];
};

export type AwardTemplate = {
  workbookData: WorkbookData;
  outputSheet: string;
  requirements: unknown[];
  fields: string[];
  sourceRows: unknown[][];
  rules: AwardFieldRule[];
};

export type AwardSubmission = {
  id: string;
  awardType: AwardType;
  academicYear: string;
  collegeName: string;
  createdAt: string;
  confirmedAt: string;
  reviewStatus: AwardReviewStatus;
  submitStatus: AwardSubmitStatus;
  rowCount: number;
  awardTypeCounts: Record<string, number>;
  fields: string[];
  rows: Record<string, unknown>[];
  isDeleted?: boolean;
  deletedAt?: string;
};

export type AwardAdminRecord = {
  id: string;
  submissionId: string;
  academicYear: string;
  awardType: AwardType;
  collegeName: string;
  studentId: string;
  name: string;
  idCard: string;
  major: string;
  grade: string;
  gender: string;
  status: string;
  reviewStatus: AwardReviewStatus;
  submitStatus: AwardSubmitStatus;
  submittedAt: string;
  rawData: Record<string, unknown>;
};
