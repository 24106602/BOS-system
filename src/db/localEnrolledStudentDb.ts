/**
 * 在校生数据库 - Supabase 优先 + 本地降级
 * 当 Supabase 已配置时，数据存储到云端；否则降级到 IndexedDB
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

const DB_NAME = "bos_enrolled_student_db";
const STORE_NAME = "enrolled_students";
const LOCAL_KEY = "bos_enrolled_students";

// ---- IndexedDB 本地存储 ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "_localId", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromLocalStorage(): Promise<EnrolledStudentRecord[]> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

async function saveToLocalStorage(records: EnrolledStudentRecord[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
  } catch {
    // 如果 localStorage 也失败，静默降级
  }
}

async function getAllLocal(): Promise<EnrolledStudentRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return getFromLocalStorage();
  }
}

async function saveAllLocal(records: EnrolledStudentRecord[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      records.forEach((r) => store.put(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    await saveToLocalStorage(records);
  }
}

async function addLocal(newRecords: EnrolledStudentRecord[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      newRecords.forEach((r) => store.put(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await getFromLocalStorage();
    const existingKeys = new Set(existing.map((s) => s.idCard || s.studentId || s.name));
    const merged = [...existing];
    for (const student of newRecords) {
      const key = student.idCard || student.studentId || student.name;
      if (!existingKeys.has(key)) {
        merged.push(student);
        existingKeys.add(key);
      }
    }
    await saveToLocalStorage(merged);
  }
}

async function clearLocal() {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
  localStorage.removeItem(LOCAL_KEY);
}

// ---- 对外接口（与原 localEnrolledStudentDb 兼容）----

export const getAllEnrolledStudents = async (): Promise<EnrolledStudentRecord[]> => {
  if (isSupabaseConfigured) {
    try {
      return await fetchEnrolledStudents();
    } catch (e) {
      console.warn("Supabase 读取在校生失败，降级到本地存储", e);
    }
  }
  return getAllLocal();
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
  await saveAllLocal(students);
};

export const clearEnrolledStudents = async (): Promise<void> => {
  if (isSupabaseConfigured) {
    try {
      await clearEnrolledStudentsFromCloud();
    } catch (e) {
      console.warn("Supabase 清空在校生失败", e);
    }
  }
  await clearLocal();
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

  const all = await getAllLocal();
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

  await addLocal(newStudents);
  const all = await getAllLocal();
  return all.length;
};
