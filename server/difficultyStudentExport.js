import XLSX from "xlsx-js-style";
import {
  DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS,
  DEFAULT_DIFFICULTY_EXPORT_LIMIT,
  DIFFICULTY_EXPORT_COLUMNS,
  MAX_DIFFICULTY_EXPORT_LIMIT,
} from "../src/constants/difficultyExportColumns.ts";
import {
  DIFFICULTY_STUDENT_STATUS_LABELS,
  getDifficultyStudentStatusLabel,
} from "../src/constants/statusTransitions.ts";

const text = (value) => String(value ?? "").trim();
const ACADEMIC_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;
const EXPORT_PAGE_SIZE = 1000;

const makeExportError = (message, statusCode = 400, code = "INVALID_EXPORT_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const columnByKey = new Map(DIFFICULTY_EXPORT_COLUMNS.map((column) => [column.key, column]));

const normalizeAcademicYear = (value) => {
  const academicYear = text(value);
  const match = academicYear.match(ACADEMIC_YEAR_PATTERN);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw makeExportError("导出学年格式必须为连续学年，例如 2025-2026");
  }
  return academicYear;
};

const normalizeInteger = (value, fallback, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    if (label === "单次导出条数" && normalized > MAX_DIFFICULTY_EXPORT_LIMIT) {
      throw makeExportError(`单次导出上限为 ${MAX_DIFFICULTY_EXPORT_LIMIT} 条，请设置起始序号后分批导出`);
    }
    throw makeExportError(`${label}必须为 ${min} ~ ${max} 之间的整数`);
  }
  return normalized;
};

const normalizeFilters = (input) => {
  const source = input && typeof input === "object" ? input : {};
  return {
    collegeName: text(source.collegeName),
    name: text(source.name),
    studentId: text(source.studentId),
    idCard: text(source.idCard).replace(/\s|-/g, "").toUpperCase(),
    grade: text(source.grade),
    gender: text(source.gender),
    difficultyLevel: text(source.difficultyLevel),
    status: text(source.status),
  };
};

export const normalizeDifficultyExportRequest = (input, profile) => {
  const source = input && typeof input === "object" ? input : {};
  const requestedKeys = Array.isArray(source.columns)
    ? [...new Set(source.columns.map(text).filter(Boolean))]
    : [];
  const columns = requestedKeys.length > 0
    ? requestedKeys.map((key) => {
        const column = columnByKey.get(key);
        if (!column) throw makeExportError(`导出列不在允许的白名单内：${key}`);
        return column;
      })
    : DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS.map((key) => columnByKey.get(key));
  const sensitiveColumns = columns.filter((column) => column?.sensitive);
  if (sensitiveColumns.length > 0 && source.includeSensitive !== true) {
    throw makeExportError(
      `所选导出列包含敏感字段（${sensitiveColumns.map((column) => column.label).join("、")}），请勾选敏感信息确认后再导出`,
      400,
      "SENSITIVE_EXPORT_CONFIRMATION_REQUIRED"
    );
  }

  const format = text(source.format || "xlsx").toLowerCase();
  if (!new Set(["xlsx", "csv"]).has(format)) {
    throw makeExportError("导出格式仅支持 xlsx 或 csv");
  }

  const filters = normalizeFilters(source.filters);
  if (profile?.role === "college") {
    filters.collegeName = text(profile.college_name);
    if (!filters.collegeName) throw makeExportError("学院账号未配置所属学院", 403, "COLLEGE_SCOPE_MISSING");
  }

  return {
    academicYear: normalizeAcademicYear(source.academicYear),
    columns: columns.filter(Boolean),
    sensitiveColumns,
    includeSensitive: sensitiveColumns.length > 0,
    limit: normalizeInteger(
      source.limit,
      DEFAULT_DIFFICULTY_EXPORT_LIMIT,
      "单次导出条数",
      { min: 1, max: MAX_DIFFICULTY_EXPORT_LIMIT }
    ),
    offset: normalizeInteger(source.offset, 0, "导出起始序号", { min: 0 }),
    format,
    filters,
    collegeScopeExact: profile?.role === "college",
  };
};

const normalizeRawKey = (value) => text(value)
  .replace(/\s|\*|（.*?）|\(.*?\)/g, "")
  .toLowerCase();

const getRawValue = (rawData, aliases) => {
  const raw = rawData && typeof rawData === "object" ? rawData : {};
  for (const alias of aliases || []) {
    const value = raw[alias];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  const normalizedAliases = (aliases || []).map(normalizeRawKey);
  const matchedKey = Object.keys(raw).find((key) => {
    const normalizedKey = normalizeRawKey(key);
    return normalizedAliases.some((alias) =>
      normalizedKey === alias || normalizedKey.includes(alias) || alias.includes(normalizedKey)
    );
  });
  return matchedKey ? raw[matchedKey] : "";
};

const sanitizeSpreadsheetValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const normalized = String(value);
  return /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
};

const getColumnValue = (row, column) => {
  if (column.source === "base") {
    const value = column.sourceField === "status"
      ? getDifficultyStudentStatusLabel(row.status)
      : row[column.sourceField];
    return sanitizeSpreadsheetValue(value);
  }
  const fallback = column.key === "idCard"
    ? row.id_card
    : column.key === "specialDifficultyType"
      ? row.difficulty_level
      : "";
  const rawValue = getRawValue(row.raw_data, column.aliases);
  return sanitizeSpreadsheetValue(text(rawValue) ? rawValue : fallback);
};

export const makeDifficultyExportRows = (rows, columns) => (rows || []).map((row) =>
  Object.fromEntries(columns.map((column) => [column.label, getColumnValue(row, column)]))
);

const getStatusFilterValues = (filter) => {
  if (!filter) return [];
  return Object.entries(DIFFICULTY_STUDENT_STATUS_LABELS)
    .filter(([status, label]) => status.includes(filter) || label.includes(filter))
    .map(([status]) => status);
};

const makeStudentsQuery = (admin, request, rangeStart, rangeEnd) => {
  let query = admin
    .from("students")
    .select("*")
    .eq("is_deleted", false)
    .eq("academic_year", request.academicYear);
  const filters = request.filters;
  if (filters.collegeName) {
    query = request.collegeScopeExact
      ? query.eq("college_name", filters.collegeName)
      : query.ilike("college_name", `%${filters.collegeName}%`);
  }
  if (filters.name) query = query.ilike("name", `%${filters.name}%`);
  if (filters.studentId) query = query.ilike("student_id", `%${filters.studentId}%`);
  if (filters.idCard) query = query.ilike("id_card", `%${filters.idCard}%`);
  if (filters.grade) query = query.ilike("grade", `%${filters.grade}%`);
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.difficultyLevel) query = query.ilike("difficulty_level", `%${filters.difficultyLevel}%`);
  if (filters.status) {
    const statuses = getStatusFilterValues(filters.status);
    query = statuses.length > 0
      ? query.in("status", statuses)
      : query.ilike("status", `%${filters.status}%`);
  }
  return query
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(rangeStart, rangeEnd);
};

export const fetchDifficultyExportRows = async (admin, request) => {
  const targetCount = request.limit + 1;
  const rows = [];
  while (rows.length < targetCount) {
    const pageSize = Math.min(EXPORT_PAGE_SIZE, targetCount - rows.length);
    const rangeStart = request.offset + rows.length;
    const { data, error } = await makeStudentsQuery(
      admin,
      request,
      rangeStart,
      rangeStart + pageSize - 1
    );
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return {
    rows: rows.slice(0, request.limit),
    hasMore: rows.length > request.limit,
  };
};

export const makeDifficultyExportFile = (rows, request) => {
  const exportRows = makeDifficultyExportRows(rows, request.columns);
  const headers = request.columns.map((column) => column.label);
  const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers });
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(Math.max(header.length * 2, 12), 36) }));
  if (request.format === "csv") {
    return new TextEncoder().encode(`\uFEFF${XLSX.utils.sheet_to_csv(worksheet)}`);
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "困难生名单");
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return output instanceof Uint8Array ? output : new Uint8Array(output);
};

const getOperatorName = (context) => text(context?.profile?.display_name)
  || text(context?.profile?.college_name)
  || ({
    admin: "学校管理员",
    center: "中心管理员",
    college: "学院账号",
  }[context?.profile?.role] || "系统账号");

const makeExportRecordId = (request) => {
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${request.academicYear}:${unique}`;
};

const logDifficultyExport = async (admin, request, context, rowCount, hasMore) => {
  const selectedFilterNames = Object.entries(request.filters)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  const snapshot = {
    academic_year: request.academicYear,
    format: request.format,
    columns: request.columns.map((column) => column.key),
    column_labels: request.columns.map((column) => column.label),
    sensitive_columns: request.sensitiveColumns.map((column) => column.key),
    sensitive_included: request.includeSensitive,
    row_count: rowCount,
    limit: request.limit,
    offset: request.offset,
    has_more: hasMore,
    filter_fields: selectedFilterNames,
  };
  const { data, error } = await admin.rpc("log_operation", {
    p_table_name: "difficulty_student_export",
    p_record_id: makeExportRecordId(request),
    p_action: "export",
    p_operator_id: context?.user?.id || null,
    p_operator_role: text(context?.profile?.role) || null,
    p_operator_name: getOperatorName(context) || null,
    p_from_status: null,
    p_to_status: null,
    p_remark: `导出困难生数据：${request.format.toUpperCase()}，${rowCount} 条，${request.columns.length} 列${request.includeSensitive ? "，包含敏感字段" : "，不含敏感字段"}`,
    p_snapshot: snapshot,
  });
  if (error) throw error;
  if (!data) throw new Error("导出日志写入失败，已取消本次导出");
};

export const exportDifficultyStudents = async (admin, input, context) => {
  const request = normalizeDifficultyExportRequest(input, context?.profile);
  const { rows, hasMore } = await fetchDifficultyExportRows(admin, request);
  const file = makeDifficultyExportFile(rows, request);
  await logDifficultyExport(admin, request, context, rows.length, hasMore);

  const extension = request.format;
  const fileName = `${request.academicYear}困难生名单_第${request.offset + 1}条起_${rows.length}条.${extension}`;
  return {
    file,
    fileName,
    rowCount: rows.length,
    limit: request.limit,
    offset: request.offset,
    nextOffset: request.offset + rows.length,
    hasMore,
    format: request.format,
    contentType: request.format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
};

export const getDifficultyExportResponseHeaders = (result) => ({
  "Content-Type": result.contentType,
  "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
  "X-Export-Row-Count": String(result.rowCount),
  "X-Export-Limit": String(result.limit),
  "X-Export-Offset": String(result.offset),
  "X-Export-Next-Offset": String(result.nextOffset),
  "X-Export-Has-More": result.hasMore ? "true" : "false",
});
