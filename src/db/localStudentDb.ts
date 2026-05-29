import type { StudentRecord } from "../types/student";

// 本地困难生数据库封装：优先使用 IndexedDB，失败时回退到 localStorage。
const DB_NAME = "bos-student-local-database";
const DB_VERSION = 1;
const STORE_NAME = "hardship_students";
const FALLBACK_KEY = "bos-hardship-students-fallback";

function readFallbackStudents(): StudentRecord[] {
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as StudentRecord[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackStudents(students: StudentRecord[]) {
  window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(students));
}

function mergeStudents(oldStudents: StudentRecord[], newStudents: StudentRecord[]) {
  const map = new Map<string, StudentRecord>();

  oldStudents.forEach((student) => map.set(student.key, student));
  newStudents.forEach((student) => {
    if (student.key) map.set(student.key, student);
  });

  return Array.from(map.values());
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("当前浏览器不支持本地数据库 IndexedDB"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("studentId", "studentId", { unique: false });
        store.createIndex("idCard", "idCard", { unique: false });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("college", "college", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStudentsToIndexedDb(students: StudentRecord[]) {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    students.forEach((student) => {
      if (student.key) store.put(student);
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAllStudentsFromIndexedDb(): Promise<StudentRecord[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result as StudentRecord[]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function getStudentCountFromIndexedDb() {
  const db = await openDb();

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function clearStudentsFromIndexedDb() {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function saveStudents(students: StudentRecord[]) {
  try {
    await saveStudentsToIndexedDb(students);
  } catch {
    writeFallbackStudents(mergeStudents(readFallbackStudents(), students));
  }
}

export async function getAllStudents(): Promise<StudentRecord[]> {
  try {
    const indexedStudents = await getAllStudentsFromIndexedDb();
    if (indexedStudents.length > 0) return indexedStudents;
  } catch {
    return readFallbackStudents();
  }

  return readFallbackStudents();
}

export async function getStudentCount() {
  try {
    const indexedCount = await getStudentCountFromIndexedDb();
    if (indexedCount > 0) return indexedCount;
  } catch {
    return readFallbackStudents().length;
  }

  return readFallbackStudents().length;
}

export async function findStudent(keyword: string): Promise<StudentRecord | null> {
  const text = String(keyword ?? "").trim();

  if (!text) return null;

  const students = await getAllStudents();
  const exact = students.find((student) => {
    return student.idCard === text || student.studentId === text || student.name === text;
  });

  if (exact) return exact;

  return (
    students.find((student) => {
      return (
        Boolean(student.name && text.includes(student.name)) ||
        Boolean(student.name && student.name.includes(text)) ||
        Boolean(student.idCard && student.idCard.includes(text)) ||
        Boolean(student.studentId && student.studentId.includes(text))
      );
    }) || null
  );
}

export async function clearStudents() {
  try {
    await clearStudentsFromIndexedDb();
  } catch {
    // IndexedDB may be unavailable on file:// pages. The fallback is cleared below.
  }

  window.localStorage.removeItem(FALLBACK_KEY);
}
