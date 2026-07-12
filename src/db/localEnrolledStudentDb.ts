import type { EnrolledStudentRecord } from "../types/enrolledStudent";

const STORAGE_KEY = "bos_enrolled_students";

export const getAllEnrolledStudents = (): EnrolledStudentRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const getEnrolledStudentCount = (): number => {
  return getAllEnrolledStudents().length;
};

export const saveEnrolledStudents = (students: EnrolledStudentRecord[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
};

export const clearEnrolledStudents = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const findEnrolledStudent = (query: {
  studentId?: string;
  idCard?: string;
  name?: string;
}): EnrolledStudentRecord | null => {
  const all = getAllEnrolledStudents();
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

export const verifyEnrolledStudent = (
  studentId: string,
  idCard: string,
  name: string
): { verified: boolean; reason?: string } => {
  const all = getAllEnrolledStudents();
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
    const byIdCard = all.find((s) => s.idCard && s.idCard === idCard);
    if (byIdCard) {
      if (byId.name === name) return { verified: true };
      return { verified: false, reason: "身份证号匹配但姓名不匹配，请核对" };
    }
  }
  return { verified: false, reason: "未在在校生数据库中找到该学生，请核对学号或身份证号+姓名" };
};

export const addEnrolledStudents = (newStudents: EnrolledStudentRecord[]) => {
  const existing = getAllEnrolledStudents();
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
  saveEnrolledStudents(merged);
  return merged.length;
};
