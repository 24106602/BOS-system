import type { CollegeProcessedBatch } from "../types/merge";

const DB_NAME = "bos_merge_db";
const STORE_NAME = "batches";
const LOCAL_KEY = "bos_merge_batches";

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
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

async function saveToLocalStorage(batches: CollegeProcessedBatch[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(batches));
}

export async function saveMergeBatch(batch: CollegeProcessedBatch) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(batch);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const batches = await getFromLocalStorage();
    const next = [...batches.filter((item) => item.id !== batch.id), batch];
    await saveToLocalStorage(next);
  }
}

export async function getMergeBatches(): Promise<CollegeProcessedBatch[]> {
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