import { supabase } from "../lib/supabaseClient";

const DIFFICULTY_API_URL = (
  import.meta.env.VITE_DIFFICULTY_API_URL || "/api/difficulty-students"
).replace(/\/$/, "");

export class DifficultyStudentApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "DIFFICULTY_API_ERROR") {
    super(message);
    this.name = "DifficultyStudentApiError";
    this.status = status;
    this.code = code;
  }
}

const requestDifficultyApi = async <T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
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
  };
  if (!response.ok) {
    throw new DifficultyStudentApiError(
      payload.message || payload.error || `困难生 API 请求失败（HTTP ${response.status}）`,
      response.status,
      payload.code || "DIFFICULTY_API_ERROR"
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
