/**
 * 在校生数据库 - Supabase 优先 + 本地降级
 * 当 Supabase 已配置时，数据存储到云端；否则降级到 localStorage
 */
import { isSupabaseConfigured } from "../lib/supabaseClient";
import type { EnrolledStudentRecord } from "../types/enrolledStudent";
import {
  fetchEnrolledStudents,
  saveEnrolledStudentsToCloud,
  addEnrolledStudentsToCloud,
  clearEnrolledStudentsFromCloud,
  verifyEnrolledStudentFromCloud,
} from "../services/supabaseDataService";

const STORAGE_KEY = "bos_enrolled_students";

// ---- 本地存储降级 ----

const getLocalStudents = (): EnrolledStudentRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setLocalStudents = (students: EnrolledStudentRecord[]) => {
  try {
    const data = JSON.stringify(students);
    if (data.length > 4 * 1024 * 1024) {
      throw new Error("数据量过大，超出本地存储限制（建议配置 Supabase）");
    }
    localStorage.setItem(STORAGE_KEY, data);
  } catch (e) {
    console.error("本地存储在校生数据失败", e);
    throw e;
  }
};

// ---- 对外接口（与原 localEnrolledStudentDb 兼容）----

export const getAllEnrolledStudents = async (): Promise<EnrolledStudentRecord[]> => {
  if (isSupabaseConfigured) {
    try {
      return await fetchEnrolledStudents();
    } catch (e) {
      console.warn("Supabase 读取在校生失败，降级到本地存储", e);
    }
  }
  return getLocalStudents();
};

export const getEnrolledStudentCount = async (): Promise<number> => {
  const students = await getAllEnrolledStudents();
  return students.length;
};

export const saveEnrolledStudents = async (students: EnrolledStudentRecord[]): Promise<void> => {
  if (isSupabaseConfigured) {
    try {
      await saveEnrolledStudentsToCloud(students);
      return;
    } catch (e) {
      console.warn("Supabase 保存在校生失败，降级到本地存储", e);
    }
  }
  setLocalStudents(students);
};

export const clearEnrolledStudents = async (): Promise<void> => {
  if (isSupabaseConfigured) {
    try {
      await clearEnrolledStudentsFromCloud();
    } catch (e) {
      console.warn("Supabase 清空在校生失败", e);
    }
  }
  localStorage.removeItem(STORAGE_KEY);
};

export const findEnrolledStudent = async (query: {
  studentId?: string;
  idCard?: string;
  name?: string;
}): Promise<EnrolledStudentRecord | null> => {
  const all = await getAllEnrolledStudents();
  if (query.studentId) {
    const byId = all.find((s) => s.studentId && s.studentId === query.studentId);
    if (byId) return byId;
  }
  if (query.idCard && query.name) {
    const byIdCardAndName = all.find(
      (s) => s.idCard === query.idCard && s.name === query.name
    );
    if (byIdCardAndName) return byIdCardAndName;
  }
  if (query.idCard) {
    const byIdCard = all.find((s) => s.idCard === query.idCard);
    if (byIdCard) return byIdCard;
  }
  return null;
};

export const verifyEnrolledStudent = async (
  studentId: string,
  idCard: string,
  name: string
): Promise<{ verified: boolean; reason?: string }> => {
  if (isSupabaseConfigured) {
    try {
      return await verifyEnrolledStudentFromCloud(studentId, idCard, name);
    } catch (e) {
      console.warn("Supabase 校验在校生失败，降级到本地存储", e);
    }
  }

  // 本地降级校验
  const all = getLocalStudents();
  if (all.length === 0) {
    return { verified: true, reason: "在校生数据库未配置，已跳过校验" };
  }
  if (studentId) {
    const byId = all.find((s) => s.studentId && s.studentId === studentId);
    if (byId) {
      if (byId.name === name) return { verified: true };
      return { verified: false, reason: "学号匹配但姓名不匹配，请核对" };
    }
  }
  if (idCard) {
    const byIdCard = all.find((s) => s.idCard === idCard);
    if (byIdCard) {
      if (byIdCard.name === name) return { verified: true };
      return { verified: false, reason: "身份证号匹配但姓名不匹配，请核对" };
    }
  }
  return { verified: false, reason: "未在在校生数据库中找到该学生" };
};

export const addEnrolledStudents = async (newStudents: EnrolledStudentRecord[]): Promise<number> => {
  if (isSupabaseConfigured) {
    try {
      return await addEnrolledStudentsToCloud(newStudents);
    } catch (e) {
      console.warn("Supabase 增量保存在校生失败，降级到本地存储", e);
    }
  }

  // 本地降级
  const existing = getLocalStudents();
  const existingKeys = new Set(
    existing.map((s) => s.idCard || s.studentId || s.name)
  );
  const merged = [...existing];
  for (const student of newStudents) {
    const key = student.idCard || student.studentId || student.name;
    if (!existingKeys.has(key)) {
      merged.push(student);
      existingKeys.add(key);
    }
  }
  setLocalStudents(merged);
  return merged.length;
};
