import * as XLSX from "xlsx-js-style";
import { supabase } from "../lib/supabaseClient";

const BASE_INFO_API_URL = (import.meta.env.VITE_BASE_INFO_API_URL || "/api/base-info").replace(/\/$/, "");

export const IMMUTABLE_FIELD_TIP = "导入后不可修改，如需调整请删除后重新导入";

export type DepartmentInfo = {
  id: string;
  department_name: string;
  school_name: string;
  department_type: string;
  contact_person: string | null;
  contact_phone: string | null;
  login_account: string;
  contact_address: string | null;
  contact_postcode: string | null;
  contact_fax: string | null;
  sort_order: number;
  status: "active" | "disabled";
  created_at?: string;
  updated_at?: string;
};

export type CounselorInfo = {
  id: string;
  auth_user_id: string;
  role: "college";
  college_name: string;
  display_name: string;
  login_email: string;
  phone: string;
  sort_order: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type BaseInfoImportResult = {
  inserted: number;
  reactivated: number;
  total: number;
};

export class BaseInfoApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "BASE_INFO_API_ERROR") {
    super(message);
    this.name = "BaseInfoApiError";
    this.status = status;
    this.code = code;
  }
}

const requestBaseInfoApi = async <T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new BaseInfoApiError("登录状态已失效，请重新登录", 401, "UNAUTHENTICATED");

  const response = await fetch(`${BASE_INFO_API_URL}${path}`, {
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
    throw new BaseInfoApiError(
      payload.message || payload.error || `基础信息 API 请求失败（HTTP ${response.status}）`,
      response.status,
      payload.code || "BASE_INFO_API_ERROR"
    );
  }
  return payload as T;
};

export const listDepartments = async (includeDisabled = false) => {
  const query = includeDisabled ? "?includeDisabled=true" : "";
  const result = await requestBaseInfoApi<{ data: DepartmentInfo[] }>(`/departments${query}`, "GET");
  return result.data;
};

export const updateDepartment = (id: string, changes: Partial<DepartmentInfo>) =>
  requestBaseInfoApi<{ data: DepartmentInfo }>(`/departments/${encodeURIComponent(id)}`, "PATCH", changes);

export const disableDepartment = (id: string) =>
  requestBaseInfoApi<void>(`/departments/${encodeURIComponent(id)}`, "DELETE");

export const restoreDepartment = (id: string) =>
  requestBaseInfoApi<{ data: DepartmentInfo }>(`/departments/${encodeURIComponent(id)}/restore`, "POST");

export const renameDepartment = (id: string, departmentName: string) =>
  requestBaseInfoApi<{ data: DepartmentInfo }>(
    `/departments/${encodeURIComponent(id)}/rename`,
    "POST",
    { department_name: departmentName }
  );

export const importDepartments = (rows: Array<Partial<DepartmentInfo>>) =>
  requestBaseInfoApi<BaseInfoImportResult>("/departments/import", "POST", { rows });

export const listCounselors = async (includeDisabled = false) => {
  const query = includeDisabled ? "?includeDisabled=true" : "";
  const result = await requestBaseInfoApi<{ data: CounselorInfo[] }>(`/counselors${query}`, "GET");
  return result.data;
};

export const updateCounselor = (id: string, changes: Partial<CounselorInfo>) =>
  requestBaseInfoApi<{ data: CounselorInfo }>(`/counselors/${encodeURIComponent(id)}`, "PATCH", changes);

export const disableCounselor = (id: string) =>
  requestBaseInfoApi<void>(`/counselors/${encodeURIComponent(id)}`, "DELETE");

export const restoreCounselor = (id: string) =>
  requestBaseInfoApi<{ data: CounselorInfo }>(`/counselors/${encodeURIComponent(id)}/restore`, "POST");

export const importCounselors = (rows: Array<Partial<CounselorInfo>>) =>
  requestBaseInfoApi<BaseInfoImportResult>("/counselors/import", "POST", { rows });

const normalizeHeader = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, "");
const normalizeCell = (value: unknown) => String(value ?? "").trim();

const readWorkbookRows = async (file: File) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("导入文件中没有可读取的工作表");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
};

const mapRows = <T extends Record<string, unknown>>(
  rows: Record<string, unknown>[],
  aliases: Record<keyof T, string[]>
) => rows
  .filter((row) => Object.values(row).some((value) => normalizeCell(value)))
  .map((row) => {
    const normalizedEntries = new Map(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
    );
    return Object.fromEntries(
      Object.entries(aliases).map(([field, names]) => [
        field,
        normalizeCell(names.map(normalizeHeader).map((name) => normalizedEntries.get(name)).find((value) => normalizeCell(value))),
      ])
    ) as T;
  });

export const parseDepartmentImportFile = async (file: File) => {
  const rows = await readWorkbookRows(file);
  return mapRows<Partial<DepartmentInfo> & Record<string, unknown>>(rows, {
    school_name: ["学校名称"],
    department_name: ["院系名称*", "院系名称", "学院名称"],
    department_type: ["院系类型", "学院类型"],
    contact_person: ["联系人", "辅导员姓名"],
    contact_phone: ["联系电话", "手机号", "手机号码"],
    login_account: ["登录账号", "联系邮箱", "登录邮箱"],
    contact_address: ["联系地址", "地址"],
    contact_postcode: ["联系邮编", "邮编"],
    contact_fax: ["联系传真", "传真"],
    sort_order: ["排序号*", "排序号"],
  }).map((row) => ({ ...row, sort_order: Number.parseInt(String(row.sort_order || ""), 10) }));
};

export const parseCounselorImportFile = async (file: File) => {
  const rows = await readWorkbookRows(file);
  return mapRows<Partial<CounselorInfo> & Record<string, unknown>>(rows, {
    display_name: ["辅导员姓名*", "辅导员姓名", "姓名"],
    college_name: ["所属院系*", "所属院系", "学院", "院系"],
    phone: ["手机号*", "手机号", "手机号码", "联系电话"],
    login_email: ["登录账号*", "登录账号", "登录邮箱"],
    sort_order: ["排序号*", "排序号"],
  }).map((row) => ({ ...row, sort_order: Number.parseInt(String(row.sort_order || ""), 10) }));
};
