/**
 * 困难生数据库 - Supabase 优先 + 本地降级
 * 当 Supabase 已配置时，数据存储到云端；否则降级到 IndexedDB/localStorage
 */
import { isSupabaseConfigured } from "../lib/supabaseClient";
import type { StudentRecord } from "../types/student";
import {
  fetchHardshipStudents,
  saveHardshipStudentsToCloud,
  mergeHardshipStudentsToCloud,
  clearHardshipStudentsFromCloud,
  findHardshipStudentFromCloud,
} from "../services/supabaseDataService";

const DB_NAME = "bos_student_db";
const STORE_NAME = "students";
const LOCAL_KEY = "bos_student_records";

// ---- 本地存储降级 ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromLocalStorage(): Promise<StudentRecord[]> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

async function saveToLocalStorage(records: StudentRecord[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
}

async function getAllLocal(): Promise<StudentRecord[]> {
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

async function saveAllLocal(records: StudentRecord[]) {
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

async function mergeLocal(newRecords: StudentRecord[]) {
  const existing = await getAllLocal();
  const map = new Map(existing.map((r) => [r.key, r]));
  for (const r of newRecords) {
    map.set(r.key, r);
  }
  const merged = Array.from(map.values());
  await saveAllLocal(merged);
  return merged.length;
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
    localStorage.removeItem(LOCAL_KEY);
  }
}

async function findLocal(keyword: string): Promise<StudentRecord | null> {
  const all = await getAllLocal();
  const text = keyword.trim();
  if (!text) return null;
  return (
    all.find(
      (r) => r.studentId === text || r.idCard === text || r.name === text
    ) ||
    all.find(
      (r) =>
        r.name.includes(text) ||
        r.studentId.includes(text) ||
        r.idCard.includes(text)
    ) ||
    null
  );
}

// ---- 对外接口（Supabase 优先 + 本地降级）----

export async function getAllStudents(): Promise<StudentRecord[]> {
  if (isSupabaseConfigured) {
    try {
      return await fetchHardshipStudents();
    } catch (e) {
      console.warn("Supabase 读取困难生失败，降级到本地存储", e);
    }
  }
  return getAllLocal();
}

export async function saveAllStudents(records: StudentRecord[]): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await saveHardshipStudentsToCloud(records);
      return;
    } catch (e) {
      console.warn("Supabase 保存困难生失败，降级到本地存储", e);
    }
  }
  await saveAllLocal(records);
}

export async function mergeStudents(newRecords: StudentRecord[]): Promise<number> {
  if (isSupabaseConfigured) {
    try {
      return await mergeHardshipStudentsToCloud(newRecords);
    } catch (e) {
      console.warn("Supabase 合并困难生失败，降级到本地存储", e);
    }
  }
  return mergeLocal(newRecords);
}

export async function clearStudents(): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await clearHardshipStudentsFromCloud();
    } catch (e) {
      console.warn("Supabase 清空困难生失败", e);
    }
  }
  await clearLocal();
}

export async function findStudent(keyword: string): Promise<StudentRecord | null> {
  if (isSupabaseConfigured) {
    try {
      return await findHardshipStudentFromCloud(keyword);
    } catch (e) {
      console.warn("Supabase 查找困难生失败，降级到本地存储", e);
    }
  }
  return findLocal(keyword);
}

export async function getStudentCount(): Promise<number> {
  const all = await getAllStudents();
  return all.length;
}

// 兼容旧接口
export const saveStudents = saveAllStudents;
