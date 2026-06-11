import type { CollegeProcessedBatch } from "../types/merge";
import { getBatchAcademicYear, withAcademicYear } from "../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../utils/collegeDetector";

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

export async function saveMergeBatch(batch: CollegeProcessedBatch) {
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

export async function getMergeBatches(): Promise<CollegeProcessedBatch[]> {
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

export async function deleteMergeBatch(id: string) {
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

export async function clearMergeBatches() {
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
