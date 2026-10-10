/**
 * 数据服务 - SQL Server 模式（通过后端 API）
 *
 * 当 VITE_DATA_SOURCE=api 时，前端不直接连数据库，
 * 而是通过 Express 后端 API 进行所有数据操作。
 *
 * 接口与原 supabaseDataService.ts 保持一致，便于切换
 */
import { api } from "../lib/apiClient";
import type { EnrolledStudentRecord } from "../types/enrolledStudent";
import type { StudentRecord } from "../types/student";
import type { CollegeProcessedBatch } from "../types/merge";

export const isApiDataSource = import.meta.env.VITE_DATA_SOURCE === "api";

// ============================================================
// 1. 在校生数据库
// ============================================================

export async function fetchEnrolledStudents(): Promise<EnrolledStudentRecord[]> {
  if (!isApiDataSource) return [];
  const data = await api.get<EnrolledStudentRecord[]>("/enrolled-students");
  return data;
}

export async function saveEnrolledStudentsToCloud(
  students: EnrolledStudentRecord[]
): Promise<number> {
  if (!isApiDataSource) return 0;
  const result = await api.post<{ count: number }>("/enrolled-students/batch", {
    students,
    mode: "replace", // 全量替换
  });
  return result.count;
}

export async function addEnrolledStudentsToCloud(
  newStudents: EnrolledStudentRecord[]
): Promise<number> {
  if (!isApiDataSource) return 0;
  const result = await api.post<{ count: number }>("/enrolled-students/batch", {
    students: newStudents,
    mode: "append", // 追加
  });
  return result.count;
}

export async function clearEnrolledStudentsFromCloud(): Promise<void> {
  if (!isApiDataSource) return;
  await api.delete("/enrolled-students");
}

export async function verifyEnrolledStudentFromCloud(
  studentId: string,
  idCard: string,
  name: string
): Promise<{ verified: boolean; reason?: string }> {
  if (!isApiDataSource) {
    return { verified: true, reason: "API 模式未配置，已跳过校验" };
  }
  return api.post("/enrolled-students/verify", { studentId, idCard, name });
}

// ============================================================
// 2. 困难生数据库
// ============================================================

export async function fetchHardshipStudents(): Promise<StudentRecord[]> {
  if (!isApiDataSource) return [];
  return api.get<StudentRecord[]>("/hardship-students");
}

export async function saveHardshipStudentsToCloud(
  students: StudentRecord[]
): Promise<number> {
  if (!isApiDataSource) return 0;
  const result = await api.post<{ count: number }>("/hardship-students/batch", {
    students,
    mode: "replace",
  });
  return result.count;
}

export async function mergeHardshipStudentsToCloud(
  students: StudentRecord[]
): Promise<number> {
  if (!isApiDataSource) return 0;
  const result = await api.post<{ count: number }>("/hardship-students/batch", {
    students,
    mode: "merge",
  });
  return result.count;
}

export async function clearHardshipStudentsFromCloud(): Promise<void> {
  if (!isApiDataSource) return;
  await api.delete("/hardship-students");
}

export async function findHardshipStudentFromCloud(
  keyword: string
): Promise<StudentRecord | null> {
  if (!isApiDataSource) return null;
  const results = await api.get<StudentRecord[]>(`/hardship-students/search?keyword=${encodeURIComponent(keyword)}`);
  return results.length > 0 ? results[0] : null;
}

// ============================================================
// 3. 学院提交批次
// ============================================================

export async function fetchCollegeBatches(includeDeleted = false): Promise<CollegeProcessedBatch[]> {
  if (!isApiDataSource) return [];
  return api.get<CollegeProcessedBatch[]>(
    `/college-batches?includeDeleted=${includeDeleted}`
  );
}

export async function saveCollegeBatchToCloud(
  batch: CollegeProcessedBatch
): Promise<void> {
  if (!isApiDataSource) return;
  await api.post("/college-batches", batch);
}

export async function deleteCollegeBatchFromCloud(id: string): Promise<void> {
  if (!isApiDataSource) return;
  await api.delete(`/college-batches/${id}`);
}

export async function clearCollegeBatchesFromCloud(): Promise<void> {
  if (!isApiDataSource) return;
  await api.delete("/college-batches");
}

export async function restoreCollegeBatchFromCloud(id: string): Promise<void> {
  if (!isApiDataSource) return;
  await api.post(`/college-batches/${id}/restore`);
}
