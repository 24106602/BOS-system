import { getMergeBatches } from "../db/localMergeDb";
import {
  normalizeDifficultyStudentStatus,
  type DifficultyStudentStatus,
} from "../constants/statusTransitions";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import {
  resubmitDifficultyStudent,
  submitDifficultyStudentBatch,
  transitionDifficultyStudent,
} from "./difficultyStudentApi";
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
  status: DifficultyStudentStatus;
  rejected_reason?: string;
  resubmission_remark?: string;
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
  resubmission_remark?: string | null;
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
  status: DifficultyStudentStatus;
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
  status: string = "college_confirmed"
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
      status: normalizeDifficultyStudentStatus(status, "college_confirmed"),
      raw_data: row,
    }))
    .filter((row) => row.name || row.student_id || row.id_card);
};

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
  try {
    const result = await submitDifficultyStudentBatch(payloads);
    return {
      configured: true,
      ...result,
      message: `困难生 API 同步完成：新增 ${result.inserted} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条，失败 ${result.failed} 条`,
    };
  } catch (error) {
    return {
      configured: true,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: payloads.length,
      message: error instanceof Error ? error.message : "困难生 API 同步失败",
    };
  }
};

const toDifficultyStudent = (row: CloudStudentRow): DifficultyStudentRow => ({
  id: row.id,
  academic_year: String(row.academic_year || ""),
  college_name: normalizeSubmissionCollegeName(String(row.college_name || "")),
  student_id: String(row.student_id || ""),
  name: String(row.name || ""),
  id_card: normalizeIdCard(String(row.id_card || "")),
  difficulty_level: String(row.difficulty_level || ""),
  status: normalizeDifficultyStudentStatus(row.status, "college_confirmed"),
  rejected_reason: String(row.rejected_reason || ""),
  resubmission_remark: String(row.resubmission_remark || ""),
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
        status: "college_confirmed",
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
    const fullSelect = "id,academic_year,college_name,student_id,name,id_card,grade,gender,difficulty_level,status,rejected_reason,resubmission_remark,raw_data";
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

  try {
    for (const id of ids) {
      await transitionDifficultyStudent(id, "reject", { remark: reason });
    }
  } catch (error) {
    return { success: false, message: `退回失败：${error instanceof Error ? error.message : "未知错误"}` };
  }

  return { success: true, message: `成功退回 ${ids.length} 条记录` };
};

export const resubmitStudentRecords = async (
  ids: (number | string)[],
  remark: string
): Promise<{ success: boolean; message: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Supabase 未配置，无法执行重新提交操作。" };
  }

  try {
    for (const id of ids) {
      await resubmitDifficultyStudent(id, remark);
    }
  } catch (error) {
    return { success: false, message: `重新提交失败：${error instanceof Error ? error.message : "未知错误"}` };
  }

  return { success: true, message: `成功重新提交 ${ids.length} 条记录` };
};
