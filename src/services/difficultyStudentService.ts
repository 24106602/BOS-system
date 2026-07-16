import { getMergeBatches } from "../db/localMergeDb";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { getBatchAcademicYear, isBatchInAcademicYear } from "../utils/academicYear";
import { isSameSubmissionCollege, normalizeSubmissionCollegeName } from "../utils/collegeDetector";

export type DifficultyStudentRow = {
  id?: number | string;
  academic_year: string;
  college_name: string;
  student_id: string;
  name: string;
  id_card: string;
  difficulty_level: string;
  status: string;
  rejected_reason?: string;
  raw_data?: Record<string, unknown> | null;
  source: "supabase" | "local";
};

type CloudStudentRow = {
  id?: number | string;
  academic_year?: string | null;
  college_name?: string | null;
  student_id?: string | null;
  name?: string | null;
  id_card?: string | null;
  grade?: string | null;
  gender?: string | null;
  difficulty_level?: string | null;
  status?: string | null;
  rejected_reason?: string | null;
  raw_data?: Record<string, unknown> | null;
};

type StudentPayload = {
  academic_year: string;
  college_name: string;
  student_id: string;
  name: string;
  id_card: string;
  grade: string;
  gender: string;
  difficulty_level: string;
  status: string;
  raw_data: Record<string, unknown>;
};

export type StudentSyncResult = {
  configured: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  message: string;
};

export const normalizeIdCard = (value: string) => value.replace(/\s|-/g, "").toUpperCase();

const normalizeHeader = (value: string) =>
  String(value ?? "")
    .trim()
    .replace(/\s|\*|（.*?）|\(.*?\)/g, "")
    .toLowerCase();

const getText = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const normalizedAliases = aliases.map(normalizeHeader);
  const matchedKey = Object.keys(row).find((key) => {
    const normalizedKey = normalizeHeader(key);
    return normalizedAliases.some((alias) => normalizedKey.includes(alias) || alias.includes(normalizedKey));
  });
  return matchedKey ? String(row[matchedKey] ?? "").trim() : "";
};

const makeStudentKey = (row: Pick<StudentPayload, "student_id" | "id_card">) =>
  normalizeIdCard(row.id_card) || row.student_id.trim();

const formatSupabaseError = (error: unknown) => {
  const detail = error as { message?: string; details?: string; hint?: string; code?: string };
  return [
    detail?.message,
    detail?.details ? `details: ${detail.details}` : "",
    detail?.hint ? `hint: ${detail.hint}` : "",
    detail?.code ? `code: ${detail.code}` : "",
  ].filter(Boolean).join("；") || "未知 Supabase 错误";
};

export const buildStudentPayloads = (
  rows: Record<string, unknown>[],
  academicYear: string,
  collegeName: string,
  status = "college_submitted"
): StudentPayload[] => {
  const normalizedCollege = normalizeSubmissionCollegeName(collegeName);
  return rows
    .map((row) => ({
      academic_year: academicYear,
      college_name: normalizedCollege,
      student_id: getText(row, ["student_id", "学号", "学生学号", "学生编号"]),
      name: getText(row, ["name", "姓名", "学生姓名"]),
      id_card: normalizeIdCard(getText(row, ["id_card", "身份证号", "身份证件号", "证件号", "学生身份证号"])),
      grade: getText(row, ["grade", "年级", "所在年级"]),
      gender: getText(row, ["gender", "性别"]),
      difficulty_level: getText(row, ["difficulty_level", "困难等级", "困难认定等级", "特殊困难类型", "认定等级", "推荐档次"]),
      status,
      raw_data: row,
    }))
    .filter((row) => row.name || row.student_id || row.id_card);
};

const makeFullPayload = (row: StudentPayload) => ({
  academic_year: row.academic_year,
  college_name: row.college_name,
  student_id: row.student_id,
  name: row.name,
  id_card: row.id_card,
  grade: row.grade,
  gender: row.gender,
  difficulty_level: row.difficulty_level,
  status: row.status,
  raw_data: row.raw_data,
});

const makeCompatiblePayload = (row: StudentPayload) => ({
  academic_year: row.academic_year,
  college_name: row.college_name,
  student_id: row.student_id,
  name: row.name,
  id_card: row.id_card,
  difficulty_level: row.difficulty_level,
  status: row.status,
});

export const syncCollegeStudentsToSupabase = async (
  rows: Record<string, unknown>[],
  academicYear: string,
  collegeName: string
): Promise<StudentSyncResult> => {
  if (!isSupabaseConfigured) {
    return {
      configured: false,
      inserted: 0,
      updated: 0,
      skipped: rows.length,
      failed: 0,
      message: "Supabase 未配置，已保留本地上载记录。",
    };
  }

  const payloads = buildStudentPayloads(rows, academicYear, collegeName);
  const normalizedCollege = normalizeSubmissionCollegeName(collegeName);
  const { data: existingRows, error: fetchError } = await supabase
    .from("students")
    .select("id,academic_year,college_name,student_id,id_card")
    .eq("academic_year", academicYear)
    .eq("college_name", normalizedCollege);

  if (fetchError) {
    return {
      configured: true,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: payloads.length,
      message: `读取 students 表失败：${formatSupabaseError(fetchError)}`,
    };
  }

  const existingMap = new Map<string, CloudStudentRow>();
  ((existingRows || []) as CloudStudentRow[]).forEach((row) => {
    const key = normalizeIdCard(String(row.id_card || "")) || String(row.student_id || "").trim();
    if (key) existingMap.set(key, row);
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of payloads) {
    const key = makeStudentKey(row);
    if (!key) {
      skipped += 1;
      continue;
    }

    const existing = existingMap.get(key);
    const fullAction = existing?.id !== undefined
      ? supabase.from("students").update(makeFullPayload(row)).eq("id", existing.id)
      : supabase.from("students").insert(makeFullPayload(row));
    const { error } = await fullAction;

    if (error) {
      const compatibleAction = existing?.id !== undefined
        ? supabase.from("students").update(makeCompatiblePayload(row)).eq("id", existing.id)
        : supabase.from("students").insert(makeCompatiblePayload(row));
      const { error: compatibleError } = await compatibleAction;
      if (compatibleError) {
        failed += 1;
        console.error("College student sync failed", compatibleError);
        continue;
      }
    }

    if (existing?.id !== undefined) updated += 1;
    else inserted += 1;
    existingMap.set(key, { id: existing?.id, ...row });
  }

  return {
    configured: true,
    inserted,
    updated,
    skipped,
    failed,
    message: `students 表同步完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条`,
  };
};

const toDifficultyStudent = (row: CloudStudentRow): DifficultyStudentRow => ({
  id: row.id,
  academic_year: String(row.academic_year || ""),
  college_name: normalizeSubmissionCollegeName(String(row.college_name || "")),
  student_id: String(row.student_id || ""),
  name: String(row.name || ""),
  id_card: normalizeIdCard(String(row.id_card || "")),
  difficulty_level: String(row.difficulty_level || ""),
  status: String(row.status || "college_submitted"),
  rejected_reason: String(row.rejected_reason || ""),
  raw_data: row.raw_data || null,
  source: "supabase",
});

export const getLocalCollegeDifficultyStudents = async (
  academicYear: string,
  collegeName: string
): Promise<DifficultyStudentRow[]> => {
  const batches = await getMergeBatches();
  return batches
    .filter((batch) => batch.dataType === "student")
    .filter((batch) => isBatchInAcademicYear(batch, academicYear))
    .filter((batch) => isSameSubmissionCollege(batch.collegeName, collegeName))
    .flatMap((batch) =>
      buildStudentPayloads(batch.rows, getBatchAcademicYear(batch), batch.collegeName, "local_uploaded").map((row) => ({
        academic_year: row.academic_year,
        college_name: row.college_name,
        student_id: row.student_id,
        name: row.name,
        id_card: row.id_card,
        difficulty_level: row.difficulty_level,
        status: "local_uploaded",
        raw_data: row.raw_data,
        source: "local" as const,
      }))
    );
};

export const fetchCollegeDifficultyStudents = async (
  academicYear: string,
  collegeName: string
): Promise<{ rows: DifficultyStudentRow[]; source: "supabase" | "local"; error: string }> => {
  const normalizedCollege = normalizeSubmissionCollegeName(collegeName);
  let cloudRows: DifficultyStudentRow[] = [];
  let errorMessage = "";

  if (isSupabaseConfigured) {
    const fullSelect = "id,academic_year,college_name,student_id,name,id_card,grade,gender,difficulty_level,status,rejected_reason,raw_data";
    const { data, error } = await supabase
      .from("students")
      .select(fullSelect)
      .eq("academic_year", academicYear)
      .eq("college_name", normalizedCollege);

    if (!error) {
      cloudRows = ((data || []) as CloudStudentRow[]).map(toDifficultyStudent);
    } else {
      const fallback = await supabase
        .from("students")
        .select("id,academic_year,college_name,student_id,name,id_card,difficulty_level,status")
        .eq("academic_year", academicYear)
        .eq("college_name", normalizedCollege);
      if (fallback.error) errorMessage = `读取 students 表失败：${formatSupabaseError(fallback.error)}`;
      else {
        cloudRows = ((fallback.data || []) as CloudStudentRow[]).map(toDifficultyStudent);
        errorMessage = `students 表部分字段读取失败，已使用兼容字段显示：${formatSupabaseError(error)}`;
      }
    }
  } else {
    errorMessage = "Supabase 未配置，当前显示本地上载记录。";
  }

  if (cloudRows.length > 0) return { rows: cloudRows, source: "supabase", error: errorMessage };

  const localRows = await getLocalCollegeDifficultyStudents(academicYear, normalizedCollege);
  return { rows: localRows, source: "local", error: errorMessage };
};

export const rejectStudentRecords = async (
  ids: (number | string)[],
  reason: string
): Promise<{ success: boolean; message: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Supabase 未配置，无法执行退回操作。" };
  }

  const { error } = await supabase
    .from("students")
    .update({ status: "rejected", rejected_reason: reason })
    .in("id", ids);

  if (error) {
    return { success: false, message: `退回失败：${formatSupabaseError(error)}` };
  }

  return { success: true, message: `成功退回 ${ids.length} 条记录` };
};

export const resubmitStudentRecords = async (
  ids: (number | string)[]
): Promise<{ success: boolean; message: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Supabase 未配置，无法执行重新提交操作。" };
  }

  const { error } = await supabase
    .from("students")
    .update({ status: "pending_review", rejected_reason: "" })
    .in("id", ids);

  if (error) {
    return { success: false, message: `重新提交失败：${formatSupabaseError(error)}` };
  }

  return { success: true, message: `成功重新提交 ${ids.length} 条记录` };
};
