/**
 * Supabase 数据服务层
 * 统一封装所有后端数据操作，替代 IndexedDB/localStorage 本地存储
 * 当 Supabase 未配置时自动降级到本地存储
 */
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { EnrolledStudentRecord } from "../types/enrolledStudent";
import type { StudentRecord } from "../types/student";
import type { CollegeProcessedBatch } from "../types/merge";
import { getBatchAcademicYear, withAcademicYear } from "../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../utils/collegeDetector";

// ============================================================
// 1. 在校生数据库
// ============================================================

export async function fetchEnrolledStudents(): Promise<EnrolledStudentRecord[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("enrolled_students")
    .select("*")
    .order("student_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapEnrolledRow);
}

export async function saveEnrolledStudentsToCloud(
  students: EnrolledStudentRecord[]
): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // 先清空再批量插入
  const { error: delError } = await supabase
    .from("enrolled_students")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // 删除所有行
  if (delError) throw new Error(delError.message);

  const rows = students.map((s) => ({
    student_id: s.studentId,
    name: s.name,
    id_card: s.idCard || null,
    college: s.college || null,
    department: s.department || null,
    major: s.major || null,
    class_name: s.className || null,
    gender: s.gender || null,
    grade: s.grade || null,
    source_file: s.sourceFile || null,
  }));

  const { error } = await supabase.from("enrolled_students").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function addEnrolledStudentsToCloud(
  newStudents: EnrolledStudentRecord[]
): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // 获取已有学号集合
  const { data: existing } = await supabase
    .from("enrolled_students")
    .select("student_id");
  const existingIds = new Set((existing || []).map((r) => r.student_id));

  const rows = newStudents
    .filter((s) => !existingIds.has(s.studentId))
    .map((s) => ({
      student_id: s.studentId,
      name: s.name,
      id_card: s.idCard || null,
      college: s.college || null,
      department: s.department || null,
      major: s.major || null,
      class_name: s.className || null,
      gender: s.gender || null,
      grade: s.grade || null,
      source_file: s.sourceFile || null,
    }));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("enrolled_students").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function clearEnrolledStudentsFromCloud(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("enrolled_students")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}

export async function verifyEnrolledStudentFromCloud(
  studentId: string,
  idCard: string,
  name: string
): Promise<{ verified: boolean; reason?: string }> {
  if (!isSupabaseConfigured) {
    return { verified: true, reason: "Supabase 未配置，已跳过校验" };
  }

  // 按学号查找
  if (studentId) {
    const { data } = await supabase
      .from("enrolled_students")
      .select("name")
      .eq("student_id", studentId)
      .maybeSingle();
    if (data) {
      if (data.name === name) return { verified: true };
      return { verified: false, reason: "学号匹配但姓名不匹配，请核对" };
    }
  }

  // 按身份证号查找
  if (idCard) {
    const { data } = await supabase
      .from("enrolled_students")
      .select("name")
      .eq("id_card", idCard)
      .maybeSingle();
    if (data) {
      if (data.name === name) return { verified: true };
      return { verified: false, reason: "身份证号匹配但姓名不匹配，请核对" };
    }
  }

  return {
    verified: false,
    reason: "未在在校生数据库中找到该学生，请核对学号或身份证号+姓名",
  };
}

// ============================================================
// 2. 困难生数据库
// ============================================================

export async function fetchHardshipStudents(): Promise<StudentRecord[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("hardship_students")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(mapHardshipRow);
}

export async function saveHardshipStudentsToCloud(
  students: StudentRecord[]
): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // 清空再插入
  const { error: delError } = await supabase
    .from("hardship_students")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delError) throw new Error(delError.message);

  const rows = students.map((s) => ({
    key: s.key,
    student_id: s.studentId || null,
    name: s.name || null,
    id_card: s.idCard || null,
    college: s.college || null,
    major: s.major || null,
    class_name: s.className || null,
    hardship_level: s.hardshipLevel || null,
    year: s.year || null,
    special_type: s.specialType || null,
    remark: s.remark || null,
    source_file: s.sourceFile || null,
    imported_at: s.importedAt || null,
  }));

  const { error } = await supabase.from("hardship_students").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function mergeHardshipStudentsToCloud(
  students: StudentRecord[]
): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // upsert 模式：按 key 去重
  const rows = students.map((s) => ({
    key: s.key,
    student_id: s.studentId || null,
    name: s.name || null,
    id_card: s.idCard || null,
    college: s.college || null,
    major: s.major || null,
    class_name: s.className || null,
    hardship_level: s.hardshipLevel || null,
    year: s.year || null,
    special_type: s.specialType || null,
    remark: s.remark || null,
    source_file: s.sourceFile || null,
    imported_at: s.importedAt || null,
  }));

  const { error } = await supabase
    .from("hardship_students")
    .upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function clearHardshipStudentsFromCloud(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("hardship_students")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}

export async function findHardshipStudentFromCloud(
  keyword: string
): Promise<StudentRecord | null> {
  if (!isSupabaseConfigured) return null;
  const text = keyword.trim();
  if (!text) return null;

  // 精确匹配学号/身份证号/姓名
  const { data } = await supabase
    .from("hardship_students")
    .select("*")
    .or(`student_id.eq.${text},id_card.eq.${text},name.eq.${text}`)
    .limit(1)
    .maybeSingle();
  if (data) return mapHardshipRow(data);

  // 模糊匹配
  const { data: fuzzy } = await supabase
    .from("hardship_students")
    .select("*")
    .or(`name.ilike.%${text},student_id.ilike.%${text},id_card.ilike.%${text}`)
    .limit(1)
    .maybeSingle();
  return fuzzy ? mapHardshipRow(fuzzy) : null;
}

// ============================================================
// 3. 学院提交批次
// ============================================================

export async function fetchCollegeBatches(): Promise<CollegeProcessedBatch[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("college_batches")
    .select("*, batch_rows(*)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data || []).map(mapBatchWithRows);
}

export async function saveCollegeBatchToCloud(
  batch: CollegeProcessedBatch
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const academicYear = getBatchAcademicYear(batch);
  const collegeName = normalizeSubmissionCollegeName(batch.collegeName);

  // upsert 批次
  const { data: batchData, error: batchError } = await supabase
    .from("college_batches")
    .upsert(
      {
        college_name: collegeName,
        data_type: batch.dataType,
        academic_year: academicYear,
        row_count: batch.rowCount,
        status: "uploaded",
      },
      { onConflict: "college_name,data_type,academic_year" }
    )
    .select("id")
    .single();

  if (batchError) throw new Error(batchError.message);
  const batchId = batchData.id;

  // 删除旧的明细行
  await supabase.from("batch_rows").delete().eq("batch_id", batchId);

  // 插入新的明细行
  const rows = (batch.rows || []).map((row, index) => ({
    batch_id: batchId,
    row_data: row,
    row_index: index,
  }));

  if (rows.length > 0) {
    const { error: rowsError } = await supabase
      .from("batch_rows")
      .insert(rows);
    if (rowsError) throw new Error(rowsError.message);
  }
}

export async function deleteCollegeBatchFromCloud(
  id: string
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("college_batches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function clearCollegeBatchesFromCloud(): Promise<void> {
  if (!isSupabaseConfigured) return;
  // 先删明细，再删批次
  const { error: rowsError } = await supabase
    .from("batch_rows")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (rowsError) throw new Error(rowsError.message);
  const { error: batchError } = await supabase
    .from("college_batches")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (batchError) throw new Error(batchError.message);
}

// ============================================================
// 4. 行映射工具函数
// ============================================================

function mapEnrolledRow(row: Record<string, unknown>): EnrolledStudentRecord {
  return {
    studentId: String(row.student_id ?? ""),
    name: String(row.name ?? ""),
    idCard: String(row.id_card ?? ""),
    college: String(row.college ?? ""),
    department: String(row.department ?? ""),
    major: String(row.major ?? ""),
    className: String(row.class_name ?? ""),
    gender: String(row.gender ?? ""),
    grade: String(row.grade ?? ""),
    sourceFile: String(row.source_file ?? ""),
    importedAt: String(row.created_at ?? ""),
  };
}

function mapHardshipRow(row: Record<string, unknown>): StudentRecord {
  return {
    key: String(row.key ?? ""),
    studentId: String(row.student_id ?? ""),
    name: String(row.name ?? ""),
    idCard: String(row.id_card ?? ""),
    college: String(row.college ?? ""),
    major: String(row.major ?? ""),
    className: String(row.class_name ?? ""),
    hardshipLevel: String(row.hardship_level ?? ""),
    year: String(row.year ?? ""),
    specialType: String(row.special_type ?? ""),
    remark: String(row.remark ?? ""),
    sourceFile: String(row.source_file ?? ""),
    importedAt: String(row.imported_at ?? ""),
  };
}

function mapBatchWithRows(
  batch: Record<string, unknown>
): CollegeProcessedBatch {
  const batchRows = (batch.batch_rows || []) as Record<string, unknown>[];
  const academicYear = String(batch.academic_year || "");
  const rows = batchRows
    .sort((a, b) => Number(a.row_index) - Number(b.row_index))
    .map((r) => (r.row_data || {}) as Record<string, unknown>);

  return {
    id: String(batch.id),
    academicYear,
    collegeName: String(batch.college_name ?? ""),
    dataType: String(batch.data_type) as "student" | "family",
    rowCount: Number(batch.row_count ?? 0),
    createdAt: String(batch.created_at ?? ""),
    rows: withAcademicYear(rows, academicYear),
  };
}
