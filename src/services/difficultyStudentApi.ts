import { supabase } from "../lib/supabaseClient";

const DIFFICULTY_API_URL = (
  import.meta.env.VITE_DIFFICULTY_API_URL || "/api/difficulty-students"
).replace(/\/$/, "");

export class DifficultyStudentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly failures: DifficultyReportFailure[];

  constructor(
    message: string,
    status: number,
    code = "DIFFICULTY_API_ERROR",
    failures: DifficultyReportFailure[] = []
  ) {
    super(message);
    this.name = "DifficultyStudentApiError";
    this.status = status;
    this.code = code;
    this.failures = failures;
  }
}

export type DifficultyReportFailure = {
  studentId: string;
  reasons: string[];
};

export type DifficultyImportFailure = {
  row: number;
  field: string;
  reason: string;
};

export type DifficultyImportFailedRow = {
  row: number;
  data: Record<string, unknown>;
  errors: Array<Pick<DifficultyImportFailure, "field" | "reason">>;
};

export type DifficultyImportValidationResult = {
  validationToken: string;
  total: number;
  passed: number;
  failed: number;
  failures: DifficultyImportFailure[];
  passedRows: Record<string, unknown>[];
  failedRows: DifficultyImportFailedRow[];
};

export type DifficultyImportConfirmResult = {
  inserted: number;
  failed: number;
  status: "draft";
};

export type DifficultyOperationAction =
  | "confirm"
  | "approve"
  | "reject"
  | "report"
  | "return"
  | "edit"
  | "delete"
  | "resubmit";

export type DifficultyOperationLog = {
  id: string;
  table_name: "difficulty_student";
  record_id: string;
  action: DifficultyOperationAction;
  operator_id?: string | null;
  operator_role?: "college_admin" | "school_admin" | "center_admin" | null;
  operator_name?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  remark?: string | null;
  snapshot?: Record<string, unknown> | null;
  created_at: string;
};

const requestDifficultyApi = async <T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new DifficultyStudentApiError("登录状态已失效，请重新登录", 401, "UNAUTHENTICATED");

  const response = await fetch(`${DIFFICULTY_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({})) as {
    message?: string;
    error?: string;
    code?: string;
    failures?: DifficultyReportFailure[];
  };
  if (!response.ok) {
    throw new DifficultyStudentApiError(
      payload.message || payload.error || `困难生 API 请求失败（HTTP ${response.status}）`,
      response.status,
      payload.code || "DIFFICULTY_API_ERROR",
      Array.isArray(payload.failures) ? payload.failures : []
    );
  }
  return payload as T;
};

export type DifficultyBatchSubmitResult = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
};

export const submitDifficultyStudentBatch = (rows: Record<string, unknown>[]) =>
  requestDifficultyApi<DifficultyBatchSubmitResult>("/batch-submit", "POST", { rows });

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("读取 Excel 文件失败，请重新选择文件"));
  reader.readAsDataURL(file);
});

export const validateDifficultyStudentImport = async (
  file: File,
  options: {
    academicYear: string;
    collegeName: string;
    retryToken?: string;
    acceptedRows?: Record<string, unknown>[];
  }
) => requestDifficultyApi<DifficultyImportValidationResult>(
  "/import/validate",
  "POST",
  {
    fileName: file.name,
    fileBase64: await fileToBase64(file),
    academicYear: options.academicYear,
    collegeName: options.collegeName,
    retryToken: options.retryToken,
    acceptedRows: options.acceptedRows,
  }
);

export const confirmDifficultyStudentImport = (
  validationToken: string,
  passedRows: Record<string, unknown>[]
) => requestDifficultyApi<DifficultyImportConfirmResult>(
  "/import/confirm",
  "POST",
  { validationToken, passedRows }
);

export const importHistoricalDifficultyStudent = (row: Record<string, unknown>) =>
  requestDifficultyApi<{ inserted: number; updated: number }>("/historical-import", "POST", { row });

export const editDifficultyStudent = (id: string | number, changes: Record<string, unknown>) =>
  requestDifficultyApi<{ data: Record<string, unknown> }>(`/${id}`, "PATCH", changes);

export const deleteDifficultyStudent = (id: string | number) =>
  requestDifficultyApi<void>(`/${id}`, "DELETE");

export const transitionDifficultyStudent = (
  id: string | number,
  action: "submit" | "approve" | "reject" | "report" | "return-by-center",
  body?: Record<string, unknown>
) => requestDifficultyApi<{ data: Record<string, unknown> }>(`/${id}/${action}`, "POST", body);

export const resubmitDifficultyStudent = (
  id: string | number,
  remark: string
) => requestDifficultyApi<{ data: Record<string, unknown> }>(
  `/${id}/resubmit`,
  "POST",
  { remark }
);

export const reportDifficultyStudentBatch = (ids: (string | number)[]) =>
  requestDifficultyApi<{ data: Record<string, unknown>[]; processed: number }>(
    "/batch-report",
    "POST",
    { ids }
  );

export const getDifficultyStudentOperationLogs = (id: string | number) =>
  requestDifficultyApi<{ data: DifficultyOperationLog[] }>(`/${id}/logs`, "GET");
