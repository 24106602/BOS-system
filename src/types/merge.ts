export type CollegeProcessedBatch = {
  id: string;
  collegeName: string;
  dataType: "student" | "family";
  rowCount: number;
  createdAt: string;
  rows: Record<string, unknown>[];
};

export type MergeResult = {
  totalRows: number;
  collegeCount: number;
  rows: Record<string, unknown>[];
};