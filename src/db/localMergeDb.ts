/**
 * 学院提交批次 - Supabase 优先 + 本地降级
 * 当 Supabase 已配置时，数据存储到云端；否则降级到 IndexedDB/localStorage
 */
import { isSupabaseConfigured } from "../lib/supabaseClient";
import type { CollegeProcessedBatch } from "../types/merge";
import { getBatchAcademicYear, withAcademicYear } from "../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../utils/collegeDetector";
import {
  fetchCollegeBatches,
  saveCollegeBatchToCloud,
  deleteCollegeBatchFromCloud,
  clearCollegeBatchesFromCloud,
} from "../services/supabaseDataService";

// ---- 本地存储降级 ----

const DB_NAME = "bos_merge_db";
const STORE_NAME = "batches";
const LOCAL_KEY = "bos_merge_batches";

const normalizeBatch = (batch: CollegeProcessedBatch): CollegeProcessedBatch => {
  const academicYear = getBatchAcademicYear(batch);
  return {
    ...batch,
    academic_year: academicYear,
    collegeName: normalizeSubmissionCollegeName(batch.collegeName),
    rows: withAcademicYear(batch.rows || [], academicYear),
  };
};

const isSameYearScope = (left: CollegeProcessedBatch, right: CollegeProcessedBatch) =>
  normalizeSubmissionCollegeName(left.collegeName) === normalizeSubmissionCollegeName(right.collegeName) &&
  left.dataType === right.dataType &&
  getBatchAcademicYear(left) === getBatchAcademicYear(right);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromLocalStorage(): Promise<CollegeProcessedBatch[]> {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as CollegeProcessedBatch[]).map(normalizeBatch);
  } catch {
    return [];
  }
}

async function saveToLocalStorage(batches: CollegeProcessedBatch[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(batches.map(normalizeBatch)));
}

async function saveMergeBatchLocal(batch: CollegeProcessedBatch) {
  const normalizedBatch = normalizeBatch(batch);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        (request.result || [])
          .map(normalizeBatch)
          .filter((item) => item.id !== normalizedBatch.id && isSameYearScope(item, normalizedBatch))
          .forEach((item) => store.delete(item.id));
        store.put(normalizedBatch);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const batches = await getFromLocalStorage();
    const next = [
      ...batches.filter((item) => item.id !== normalizedBatch.id && !isSameYearScope(item, normalizedBatch)),
      normalizedBatch,
    ];
    await saveToLocalStorage(next);
  }
}

async function getMergeBatchesLocal(): Promise<CollegeProcessedBatch[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []).map(normalizeBatch));
      request.onerror = () => reject(request.error);
    });
  } catch {
    return getFromLocalStorage();
  }
}

async function deleteMergeBatchLocal(id: string) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const batches = await getFromLocalStorage();
    await saveToLocalStorage(batches.filter((item) => item.id !== id));
  }
}

async function clearMergeBatchesLocal() {
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

// ---- 对外接口（Supabase 优先 + 本地降级）----

export async function saveMergeBatch(batch: CollegeProcessedBatch) {
  if (isSupabaseConfigured) {
    try {
      await saveCollegeBatchToCloud(batch);
      return;
    } catch (e) {
      console.warn("Supabase 保存批次失败，降级到本地存储", e);
    }
  }
  await saveMergeBatchLocal(batch);
}

export async function getMergeBatches(): Promise<CollegeProcessedBatch[]> {
  if (isSupabaseConfigured) {
    try {
      return await fetchCollegeBatches();
    } catch (e) {
      console.warn("Supabase 读取批次失败，降级到本地存储", e);
    }
  }
  return getMergeBatchesLocal();
}

export async function deleteMergeBatch(id: string) {
  if (isSupabaseConfigured) {
    try {
      await deleteCollegeBatchFromCloud(id);
      return;
    } catch (e) {
      console.warn("Supabase 删除批次失败，降级到本地存储", e);
    }
  }
  await deleteMergeBatchLocal(id);
}

export async function clearMergeBatches() {
  if (isSupabaseConfigured) {
    try {
      await clearCollegeBatchesFromCloud();
    } catch (e) {
      console.warn("Supabase 清空批次失败", e);
    }
  }
  await clearMergeBatchesLocal();
}
