const TABLE_NAME = "difficulty_recognition_windows";
const ACADEMIC_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BUSINESS_TIME_ZONE = "Asia/Shanghai";

const text = (value) => String(value ?? "").trim();

const makeApiError = (message, statusCode = 400, code = "INVALID_RECOGNITION_WINDOW") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export class RecognitionWindowForbiddenError extends Error {
  constructor({ academicYear, startDate, endDate, currentDate, action }) {
    super(`当前不在认定时间范围内（${startDate} ~ ${endDate}）`);
    this.name = "RecognitionWindowForbiddenError";
    this.statusCode = 403;
    this.code = "OUTSIDE_RECOGNITION_WINDOW";
    this.academicYear = academicYear;
    this.startDate = startDate;
    this.endDate = endDate;
    this.currentDate = currentDate;
    this.action = action;
  }
}

export const normalizeRecognitionAcademicYear = (value) => {
  const academicYear = text(value);
  const match = academicYear.match(ACADEMIC_YEAR_PATTERN);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw makeApiError("学年格式必须为连续学年，例如 2025-2026");
  }
  return academicYear;
};

export const normalizeRecognitionDate = (value, label) => {
  const date = text(value);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (
    !DATE_PATTERN.test(date)
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw makeApiError(`${label}格式必须为 YYYY-MM-DD`);
  }
  return date;
};

export const getBusinessDate = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const evaluateDifficultyRecognitionWindow = (
  record,
  { academicYear = record?.academic_year, now = new Date() } = {}
) => {
  const normalizedAcademicYear = normalizeRecognitionAcademicYear(academicYear);
  const currentDate = getBusinessDate(now);
  if (!record || record.status === "disabled") {
    return {
      academicYear: normalizedAcademicYear,
      startDate: "",
      endDate: "",
      currentDate,
      configured: false,
      isOpen: true,
      message: `${normalizedAcademicYear} 学年尚未配置困难生认定时间，当前暂不限制操作`,
    };
  }

  const startDate = normalizeRecognitionDate(record.start_date, "开始日期");
  const endDate = normalizeRecognitionDate(record.end_date, "结束日期");
  const isOpen = currentDate >= startDate && currentDate <= endDate;
  return {
    academicYear: normalizedAcademicYear,
    startDate,
    endDate,
    currentDate,
    configured: true,
    isOpen,
    message: isOpen
      ? `当前处于困难生认定时间范围内（${startDate} ~ ${endDate}）`
      : `当前不在认定时间范围内（${startDate} ~ ${endDate}）`,
  };
};

const readRecognitionWindowRecord = async (admin, academicYear) => {
  const { data, error } = await admin
    .from(TABLE_NAME)
    .select("id,academic_year,start_date,end_date,status,created_by,updated_by,created_at,updated_at")
    .eq("academic_year", academicYear)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    if (error.code === "42P01") {
      throw makeApiError(
        "困难生认定时间配置表尚未初始化，请先执行数据库迁移",
        503,
        "RECOGNITION_WINDOW_NOT_INITIALIZED"
      );
    }
    throw error;
  }
  return data || null;
};

export const getDifficultyRecognitionWindow = async (
  admin,
  academicYear,
  options = {}
) => {
  const normalizedAcademicYear = normalizeRecognitionAcademicYear(academicYear);
  const record = await readRecognitionWindowRecord(admin, normalizedAcademicYear);
  return evaluateDifficultyRecognitionWindow(record, {
    academicYear: normalizedAcademicYear,
    now: options.now,
  });
};

export const guardDifficultyRecognitionWindow = async (
  admin,
  academicYear,
  { action = "write", now = new Date() } = {}
) => {
  const result = await getDifficultyRecognitionWindow(admin, academicYear, { now });
  if (!result.isOpen) {
    throw new RecognitionWindowForbiddenError({ ...result, action });
  }
  return result;
};

export const guardDifficultyRecognitionWindows = async (
  admin,
  academicYears,
  options = {}
) => {
  const years = [...new Set((academicYears || []).map(text).filter(Boolean))];
  const results = [];
  for (const academicYear of years) {
    results.push(await guardDifficultyRecognitionWindow(admin, academicYear, options));
  }
  return results;
};

export const saveDifficultyRecognitionWindow = async (
  admin,
  academicYear,
  input,
  context
) => {
  const normalizedAcademicYear = normalizeRecognitionAcademicYear(academicYear);
  const startDate = normalizeRecognitionDate(input?.startDate ?? input?.start_date, "开始日期");
  const endDate = normalizeRecognitionDate(input?.endDate ?? input?.end_date, "结束日期");
  if (startDate > endDate) {
    throw makeApiError("开始日期不能晚于结束日期");
  }

  const existing = await readRecognitionWindowRecord(admin, normalizedAcademicYear);
  const operatorId = text(context?.user?.id) || null;
  const payload = {
    academic_year: normalizedAcademicYear,
    start_date: startDate,
    end_date: endDate,
    status: "active",
    created_by: existing?.created_by || operatorId,
    updated_by: operatorId,
  };
  const { data, error } = await admin
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: "academic_year" })
    .select("id,academic_year,start_date,end_date,status,created_by,updated_by,created_at,updated_at")
    .single();
  if (error) throw error;
  return evaluateDifficultyRecognitionWindow(data, { academicYear: normalizedAcademicYear });
};
