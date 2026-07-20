import assert from "node:assert/strict";
import test from "node:test";
import {
  DifficultyImportValidationError,
  assertDifficultyImportConstraints,
  collectDifficultyImportFailures,
  translateDifficultyStudentUniqueError,
} from "../server/difficultyImportValidation.js";
import { difficultyStudentErrorHandler } from "../server/difficultyStudentRoutes.js";

const createAdmin = ({ enrollments = [], students = [] } = {}) => ({
  from(table) {
    const rows = table === "enrolled_students" ? enrollments : students;
    const filters = [];
    const query = {
      select() {
        return query;
      },
      in(column, values) {
        filters.push({ column, values });
        return query;
      },
      then(resolve, reject) {
        const data = rows.filter((row) =>
          filters.every(({ column, values }) => values.includes(row[column]))
        );
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
});

test("困难生导入会拒绝没有学籍记录的学生", async () => {
  const admin = createAdmin();
  const rows = [{ student_id: "20260001", academic_year: "2026-2027", name: "测试学生" }];

  await assert.rejects(
    () => assertDifficultyImportConstraints(admin, rows),
    (error) => {
      assert.ok(error instanceof DifficultyImportValidationError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.failures[0].studentId, "20260001");
      assert.deepEqual(error.failures[0].reasons, ["该学生没有学籍记录"]);
      return true;
    }
  );
});

test("困难生导入会拒绝请求内相同学号和学年的重复记录", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "20260001", name: "测试学生", college: "测试学院" }],
  });
  const rows = [
    { student_id: "20260001", academic_year: "2026-2027", name: "测试学生" },
    { student_id: "20260001", academic_year: "2026-2027", name: "测试学生" },
  ];

  await assert.rejects(
    () => assertDifficultyImportConstraints(admin, rows),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "DUPLICATE_DIFFICULTY_STUDENT");
      assert.equal(error.failures.length, 2);
      assert.match(error.failures[0].reasons[0], /本次导入中重复/);
      return true;
    }
  );
});

test("困难生导入会拒绝数据库中已存在的同学年认定", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "20260001", name: "测试学生", college: "测试学院" }],
    students: [{
      id: "existing-id",
      student_id: "20260001",
      academic_year: "2026-2027",
      name: "测试学生",
      college_name: "测试学院",
    }],
  });

  const failures = await collectDifficultyImportFailures(admin, [
    { student_id: "20260001", academic_year: "2026-2027", name: "测试学生" },
  ]);

  assert.equal(failures.length, 1);
  assert.match(failures[0].reasons[0], /已存在困难生认定记录/);
  assert.match(failures[0].reasons[0], /测试学生/);
});

test("学籍存在且无重复时导入校验通过", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "20260001", name: "测试学生", college: "测试学院" }],
  });

  await assert.doesNotReject(() => assertDifficultyImportConstraints(admin, [
    { student_id: "20260001", academic_year: "2026-2027", name: "测试学生" },
  ]));
});

test("数据库联合唯一约束冲突会转换为友好结构化错误", () => {
  const translated = translateDifficultyStudentUniqueError(
    {
      code: "23505",
      message: 'duplicate key value violates unique constraint "students_student_academic_year_uq"',
    },
    { student_id: "20260001", academic_year: "2026-2027" }
  );

  assert.ok(translated instanceof DifficultyImportValidationError);
  assert.equal(translated.statusCode, 409);
  assert.equal(translated.failures[0].studentId, "20260001");
  assert.match(translated.message, /2026-2027 学年已存在困难生认定记录/);
});

test("Express 错误处理中间件保留结构化失败明细", () => {
  const error = new DifficultyImportValidationError(
    [{ studentId: "20260001", reasons: ["该学生没有学籍记录"] }]
  );
  let statusCode = 0;
  let responseBody;
  const response = {
    status(value) {
      statusCode = value;
      return response;
    },
    json(value) {
      responseBody = value;
    },
  };

  difficultyStudentErrorHandler(error, {}, response, () => {});

  assert.equal(statusCode, 400);
  assert.deepEqual(responseBody.failures, error.failures);
  assert.equal(responseBody.message, "困难生导入校验未通过");
});
