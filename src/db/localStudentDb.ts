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

const disableRecord = (record: StudentRecord, deletedAt = new Date().toISOString()): StudentRecord => ({
  ...record,
  isDeleted: true,
  deletedAt,
});

const activeRecord = (record: StudentRecord): StudentRecord => ({
  ...record,
  isDeleted: false,
  deletedAt: undefined,
});

async function saveToLocalStorage(records: StudentRecord[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
}

async function getAllLocal(): Promise<StudentRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(
        (request.result || []).filter((record: StudentRecord) => !record.isDeleted)
      );
      request.onerror = () => reject(request.error);
    });
  } catch {
    return (await getFromLocalStorage()).filter((record) => !record.isDeleted);
  }
}

async function saveAllLocal(records: StudentRecord[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const deletedAt = new Date().toISOString();
        const incomingKeys = new Set(records.map((record) => record.key));
        (request.result || []).forEach((record: StudentRecord) => {
          if (incomingKeys.has(record.key) && !record.isDeleted) {
            store.put({
              ...disableRecord(record, deletedAt),
              key: `${record.key}__disabled__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            });
          } else {
            store.put(disableRecord(record, deletedAt));
          }
        });
        records.forEach((record) => store.put(activeRecord(record)));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await getFromLocalStorage();
    const deletedAt = new Date().toISOString();
    const incomingKeys = new Set(records.map((record) => record.key));
    const archived = existing.map((record) =>
      incomingKeys.has(record.key) && !record.isDeleted
        ? {
            ...disableRecord(record, deletedAt),
            key: `${record.key}__disabled__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          }
        : disableRecord(record, deletedAt)
    );
    await saveToLocalStorage([...archived, ...records.map(activeRecord)]);
  }
}

async function mergeLocal(newRecords: StudentRecord[]) {
  const existing = await getAllLocal();
  const map = new Map(existing.map((r) => [r.key, r]));
  for (const r of newRecords) {
    map.set(r.key, activeRecord(r));
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
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const deletedAt = new Date().toISOString();
        (request.result || []).forEach((record: StudentRecord) => {
          store.put(disableRecord(record, deletedAt));
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const deletedAt = new Date().toISOString();
    const existing = await getFromLocalStorage();
    await saveToLocalStorage(existing.map((record) => disableRecord(record, deletedAt)));
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
