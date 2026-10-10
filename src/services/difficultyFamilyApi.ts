/**
 * 家庭成员信息 API
 * 支持 JWT 和 Supabase 双模式
 */
import { getAccessToken } from "../lib/apiClient";

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE || "supabase") as "supabase" | "jwt";

const FAMILY_API_URL = (
  import.meta.env.VITE_DIFFICULTY_FAMILY_API_URL || "/api/difficulty-family-members"
).replace(/\/$/, "");

export class DifficultyFamilyApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "FAMILY_API_ERROR") {
    super(message);
    this.name = "DifficultyFamilyApiError";
    this.status = status;
    this.code = code;
  }
}

export type FamilyImportValidationResult = {
  validationToken: string;
  total: number;
  passed: number;
  failed: number;
  failures: Array<{ row: number; field: string; reason: string }>;
  passedRows: Record<string, unknown>[];
  failedRows: Array<{
    row: number;
    data: Record<string, unknown>;
    errors: Array<{ field: string; reason: string }>;
  }>;
};

export type FamilyImportConfirmResult = {
  inserted: number;
  failed: number;
  status: "draft";
};

function getBaseUrl() {
  if (AUTH_MODE === "jwt") {
    return (import.meta.env.VITE_API_BASE_URL || "") + FAMILY_API_URL;
  }
  return FAMILY_API_URL;
}

async function getToken() {
  if (AUTH_MODE === "jwt") {
    const token = getAccessToken();
    if (!token) {
      throw new DifficultyFamilyApiError("登录状态已失效，请重新登录", 401, "UNAUTHENTICATED");
    }
    return token;
  }
  const { supabase } = await import("../lib/supabaseClient");
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new DifficultyFamilyApiError("登录状态已失效，请重新登录", 401, "UNAUTHENTICATED");
  }
  return accessToken;
}

async function requestApi<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const accessToken = await getToken();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}${path}`, {
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
    throw new DifficultyFamilyApiError(
      payload.message || payload.error || `家庭成员 API 请求失败（HTTP ${response.status}）`,
      response.status,
      payload.code || "FAMILY_API_ERROR"
    );
  }

  return payload as T;
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取 Excel 文件失败，请重新选择文件"));
    reader.readAsDataURL(file);
  });

export const validateFamilyMemberImport = async (
  file: File,
  options: {
    academicYear: string;
    collegeName: string;
    retryToken?: string;
    acceptedRows?: Record<string, unknown>[];
  }
): Promise<FamilyImportValidationResult> =>
  requestApi<FamilyImportValidationResult>("/import/validate", "POST", {
    fileName: file.name,
    fileBase64: await fileToBase64(file),
    academicYear: options.academicYear,
    collegeName: options.collegeName,
    retryToken: options.retryToken,
    acceptedRows: options.acceptedRows,
  });

export const confirmFamilyMemberImport = (
  validationToken: string,
  passedRows: Record<string, unknown>[],
  academicYear = ""
): Promise<FamilyImportConfirmResult> =>
  requestApi<FamilyImportConfirmResult>("/import/confirm", "POST", {
    validationToken,
    passedRows,
    academicYear,
  });

export const getFamilyMemberCount = () =>
  requestApi<{ total: number }>("/count", "GET");

export const listFamilyMembers = (studentIdCard: string) =>
  requestApi<Record<string, unknown>[]>(`/by-student/${encodeURIComponent(studentIdCard)}`, "GET");
