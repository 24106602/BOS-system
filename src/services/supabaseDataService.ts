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
    .eq("is_deleted", false)
    .order("student_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapEnrolledRow);
}

export async function saveEnrolledStudentsToCloud(
  students: EnrolledStudentRecord[]
): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // 全量替换改为“禁用旧记录 + upsert 新记录”，保留历史数据。
  const { error: delError } = await supabase
    .from("enrolled_students")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("is_deleted", false);
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
    academic_year: s.academicYear || null,
    semester: s.semester || null,
    examinee_id: s.examineeId || null,
    id_card_type: s.idCardType || null,
    birth_date: s.birthDate || null,
    political_status: s.politicalStatus || null,
    nationality: s.nationality || null,
    student_type: s.studentType || null,
    study_form: s.studyForm || null,
    counselor_name: s.counselorName || null,
    major_category: s.majorCategory || null,
    level: s.level || null,
    school_system: s.schoolSystem || null,
    enrollment_date: s.enrollmentDate || null,
    is_rural_student: s.isRuralStudent || null,
    student_source: s.studentSource || null,
    phone: s.phone || null,
    source_file: s.sourceFile || null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
  }));

  const { error } = await supabase
    .from("enrolled_students")
    .upsert(rows, { onConflict: "student_id" });
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
    .select("student_id,is_deleted");
  const activeIds = new Set(
    (existing || []).filter((row) => row.is_deleted !== true).map((row) => row.student_id)
  );

  const rows = newStudents
    .filter((s) => !activeIds.has(s.studentId))
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
      academic_year: s.academicYear || null,
      source_file: s.sourceFile || null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
    }));

  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from("enrolled_students")
    .upsert(rows, { onConflict: "student_id" });
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function clearEnrolledStudentsFromCloud(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("enrolled_students")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("is_deleted", false);
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
      .eq("is_deleted", false)
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
      .eq("is_deleted", false)
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
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(mapHardshipRow);
}

export async function saveHardshipStudentsToCloud(
  students: StudentRecord[]
): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // 全量替换保留旧记录，仅将其标记为已禁用。
  const { error: delError } = await supabase
    .from("hardship_students")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("is_deleted", false);
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
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
  }));

  const { error } = await supabase
    .from("hardship_students")
    .upsert(rows, { onConflict: "key" });
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
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
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
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("is_deleted", false);
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
    .eq("is_deleted", false)
    .or(`student_id.eq.${text},id_card.eq.${text},name.eq.${text}`)
    .limit(1)
    .maybeSingle();
  if (data) return mapHardshipRow(data);

  // 模糊匹配
  const { data: fuzzy } = await supabase
    .from("hardship_students")
    .select("*")
    .eq("is_deleted", false)
    .or(`name.ilike.%${text},student_id.ilike.%${text},id_card.ilike.%${text}`)
    .limit(1)
    .maybeSingle();
  return fuzzy ? mapHardshipRow(fuzzy) : null;
}

// ============================================================
// 3. 学院提交批次
// ============================================================

export async function fetchCollegeBatches(includeDeleted = false): Promise<CollegeProcessedBatch[]> {
  if (!isSupabaseConfigured) return [];

  let query = supabase
    .from("college_batches")
    .select("*, batch_rows(*)")
    .order("created_at", { ascending: true });
  if (!includeDeleted) query = query.eq("is_deleted", false);
  const { data, error } = await query;
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
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
      },
      { onConflict: "college_name,data_type,academic_year" }
    )
    .select("id")
    .single();

  if (batchError) throw new Error(batchError.message);
  const batchId = batchData.id;

  // 旧明细保留为禁用，新明细单独写入，便于追溯覆盖历史。
  const { error: disableRowsError } = await supabase
    .from("batch_rows")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("is_deleted", false);
  if (disableRowsError) throw new Error(disableRowsError.message);

  // 插入新的明细行
  const rows = (batch.rows || []).map((row, index) => ({
    batch_id: batchId,
    row_data: row,
    row_index: index,
    is_deleted: false,
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
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from("college_batches")
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq("id", id)
    .eq("is_deleted", false);
  if (error) throw new Error(error.message);
}

export async function clearCollegeBatchesFromCloud(): Promise<void> {
  if (!isSupabaseConfigured) return;
  // 父批次禁用后默认查询不可见；明细继续保留，恢复批次时可直接复用。
  const deletedAt = new Date().toISOString();
  const { error: batchError } = await supabase
    .from("college_batches")
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq("is_deleted", false);
  if (batchError) throw new Error(batchError.message);
}

export async function restoreCollegeBatchFromCloud(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("college_batches")
    .update({ is_deleted: false, deleted_at: null, deleted_by: null })
    .eq("id", id)
    .eq("is_deleted", true);
  if (error) throw new Error(error.message);
}

// ============================================================
// 4. 行映射工具函数
// ============================================================

function mapEnrolledRow(row: Record<string, unknown>): EnrolledStudentRecord {
  return {
    academicYear: String(row.academic_year ?? ""),
    semester: String(row.semester ?? ""),
    examineeId: String(row.examinee_id ?? ""),
    studentId: String(row.student_id ?? ""),
    name: String(row.name ?? ""),
    idCardType: String(row.id_card_type ?? ""),
    idCard: String(row.id_card ?? ""),
    gender: String(row.gender ?? ""),
    birthDate: String(row.birth_date ?? ""),
    politicalStatus: String(row.political_status ?? ""),
    nationality: String(row.nationality ?? ""),
    studentType: String(row.student_type ?? ""),
    studyForm: String(row.study_form ?? ""),
    department: String(row.department ?? ""),
    counselorName: String(row.counselor_name ?? ""),
    grade: String(row.grade ?? ""),
    className: String(row.class_name ?? ""),
    majorCategory: String(row.major_category ?? ""),
    major: String(row.major ?? ""),
    level: String(row.level ?? ""),
    schoolSystem: String(row.school_system ?? ""),
    enrollmentDate: String(row.enrollment_date ?? ""),
    isRuralStudent: String(row.is_rural_student ?? ""),
    studentSource: String(row.student_source ?? ""),
    phone: String(row.phone ?? ""),
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
    .filter((row) => row.is_deleted !== true)
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
    isDeleted: batch.is_deleted === true,
    deletedAt: batch.deleted_at ? String(batch.deleted_at) : undefined,
  };
}
