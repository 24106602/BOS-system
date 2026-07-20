const text = (value) => String(value ?? "").trim();

const makeStudentYearKey = (studentId, academicYear) =>
  `${text(studentId)}::${text(academicYear)}`;

const getFailureStudentId = (row, index) =>
  text(row?.student_id) || text(row?.name) || `第 ${index + 1} 条记录`;

const assertQuerySucceeded = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

const queryEnrollmentRows = async (admin, rows) => {
  const studentIds = [...new Set(rows.map((row) => text(row.student_id)).filter(Boolean))];
  if (studentIds.length === 0) return [];
  const result = await admin
    .from("enrolled_students")
    .select("student_id,name,college")
    .in("student_id", studentIds);
  return assertQuerySucceeded(result);
};

const queryExistingDifficultyStudents = async (admin, rows) => {
  const studentIds = [...new Set(rows.map((row) => text(row.student_id)).filter(Boolean))];
  const academicYears = [...new Set(rows.map((row) => text(row.academic_year)).filter(Boolean))];
  if (studentIds.length === 0 || academicYears.length === 0) return [];
  const result = await admin
    .from("students")
    .select("id,student_id,academic_year,name,college_name")
    .in("student_id", studentIds)
    .in("academic_year", academicYears);
  return assertQuerySucceeded(result);
};

export class DifficultyImportValidationError extends Error {
  constructor(
    failures,
    {
      statusCode = 400,
      code = "DIFFICULTY_IMPORT_VALIDATION_FAILED",
      message = "困难生导入校验未通过",
    } = {}
  ) {
    super(message);
    this.name = "DifficultyImportValidationError";
    this.statusCode = statusCode;
    this.code = code;
    this.failures = failures;
  }
}

/**
 * 当前 BOS 项目是单校单库，记录存在于 enrolled_students 即表示属于当前学校。
 * 这里同时预检请求内重复和 students 中的既有认定，避免进入写入阶段后才暴露数据库原始错误。
 */
export const collectDifficultyImportFailures = async (
  admin,
  rows,
  { allowExisting = false } = {}
) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const [enrollmentRows, existingRows] = await Promise.all([
    queryEnrollmentRows(admin, rows),
    queryExistingDifficultyStudents(admin, rows),
  ]);
  const enrollmentIds = new Set(
    enrollmentRows.map((row) => text(row.student_id)).filter(Boolean)
  );
  const existingByKey = new Map(
    existingRows.map((row) => [makeStudentYearKey(row.student_id, row.academic_year), row])
  );
  const requestPairCounts = new Map();
  rows.forEach((row) => {
    const key = makeStudentYearKey(row.student_id, row.academic_year);
    requestPairCounts.set(key, (requestPairCounts.get(key) || 0) + 1);
  });

  return rows.flatMap((row, index) => {
    const studentId = text(row.student_id);
    const academicYear = text(row.academic_year);
    const key = makeStudentYearKey(studentId, academicYear);
    const reasons = [];

    if (!studentId || !enrollmentIds.has(studentId)) {
      reasons.push("该学生没有学籍记录");
    }
    if ((requestPairCounts.get(key) || 0) > 1) {
      reasons.push(`学号 ${studentId || "未填写"} 在 ${academicYear || "未填写学年"} 学年于本次导入中重复`);
    }

    const existing = existingByKey.get(key);
    if (existing && !allowExisting) {
      reasons.push(
        `学号 ${studentId} 在 ${academicYear} 学年已存在困难生认定记录（姓名：${text(existing.name) || "未填写姓名"}）`
      );
    }

    return reasons.length > 0
      ? [{ studentId: getFailureStudentId(row, index), reasons }]
      : [];
  });
};

export const assertDifficultyImportConstraints = async (admin, rows, options) => {
  const failures = await collectDifficultyImportFailures(admin, rows, options);
  if (failures.length === 0) return;
  const hasDuplicate = failures.some((failure) =>
    failure.reasons.some((reason) => reason.includes("重复") || reason.includes("已存在困难生认定记录"))
  );
  throw new DifficultyImportValidationError(failures, hasDuplicate ? {
    statusCode: 409,
    code: "DUPLICATE_DIFFICULTY_STUDENT",
    message: "存在同一学生同一学年的重复困难生认定，导入已取消",
  } : undefined);
};

export const translateDifficultyStudentUniqueError = (error, row) => {
  const detail = [error?.message, error?.details, error?.hint, error?.constraint]
    .map(text)
    .filter(Boolean)
    .join(" ");
  if (String(error?.code || "") !== "23505"
    || !/students_student_academic_year_uq|同一学生同一学年|已存在困难生认定记录/.test(detail)) {
    return error;
  }

  const studentId = text(row?.student_id) || "未填写学号";
  const academicYear = text(row?.academic_year) || "未填写学年";
  const reason = `学号 ${studentId} 在 ${academicYear} 学年已存在困难生认定记录`;
  return new DifficultyImportValidationError(
    [{ studentId, reasons: [reason] }],
    {
      statusCode: 409,
      code: "DUPLICATE_DIFFICULTY_STUDENT",
      message: reason,
    }
  );
};
