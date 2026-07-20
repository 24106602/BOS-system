import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmDifficultyStudentImport,
  validateDifficultyStudentImport,
} from "../server/validators/difficultyStudentImport.js";

const SECRET = "test-import-token-secret-with-sufficient-length";

const makeRow = (overrides = {}) => ({
  "姓名(*)": "张三",
  "学号": "S001",
  "身份证号(*)": "310101200001010010",
  "手机号码(*)": "13800138000",
  "特殊困难类型(*)": "低保家庭学生",
  "家庭人均年收入(*)": "1200.50",
  "推荐档次(*)": "A.家庭经济一般困难",
  ...overrides,
});

const createAdmin = ({ enrollments = [], students = [], rpcResult } = {}) => {
  const calls = { rpc: 0 };
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            in() {
              return Promise.resolve({
                data: table === "enrolled_students" ? enrollments : students,
                error: null,
              });
            },
          };
        },
      };
    },
    async rpc(name, params) {
      calls.rpc += 1;
      assert.equal(name, "confirm_difficulty_student_import");
      assert.equal(params.p_rows.length, 1);
      return { data: rpcResult || { inserted: 1, failed: 0, status: "draft" }, error: null };
    },
  };
};

const contextFor = (admin) => ({
  admin,
  user: { id: "00000000-0000-4000-8000-000000000001" },
  profile: {
    role: "college",
    college_name: "计算机学院",
    display_name: "学院管理员",
  },
});

test("validate 只校验并返回 token，不调用正式入库 RPC", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "S001", name: "张三", college: "计算机学院" }],
  });
  const result = await validateDifficultyStudentImport({
    context: contextFor(admin),
    body: { rows: [makeRow()], academicYear: "2025-2026" },
    secret: SECRET,
  });

  assert.equal(result.total, 1);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
  assert.ok(result.validationToken.includes("."));
  assert.equal(admin.calls.rpc, 0);
});

test("confirm 校验 token 后一次性调用原子入库 RPC", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "S001", name: "张三", college: "计算机学院" }],
  });
  const context = contextFor(admin);
  const validated = await validateDifficultyStudentImport({
    context,
    body: { rows: [makeRow()], academicYear: "2025-2026" },
    secret: SECRET,
  });
  const confirmed = await confirmDifficultyStudentImport({
    context,
    body: {
      validationToken: validated.validationToken,
      passedRows: validated.passedRows,
    },
    secret: SECRET,
  });

  assert.equal(confirmed.inserted, 1);
  assert.equal(confirmed.status, "draft");
  assert.equal(admin.calls.rpc, 1);
});

test("无学籍、手机号重复和金额格式错误会返回逐行逐字段失败明细", async () => {
  const admin = createAdmin();
  const result = await validateDifficultyStudentImport({
    context: contextFor(admin),
    body: {
      rows: [
        makeRow({ "家庭人均年收入(*)": "100.123" }),
        makeRow({ "学号": "S002", "姓名(*)": "李四", "身份证号(*)": "310101200001010029" }),
      ],
      academicYear: "2025-2026",
    },
    secret: SECRET,
  });

  assert.equal(result.passed, 0);
  assert.equal(result.failed, 2);
  assert.ok(result.failures.some((item) => item.field === "学号" && item.reason === "该学生没有学籍记录"));
  assert.ok(result.failures.some((item) => item.field === "手机号码" && item.reason.includes("本次导入中重复")));
  assert.ok(result.failures.some((item) => item.field === "家庭人均年收入" && item.reason.includes("两位小数")));
  assert.equal(admin.calls.rpc, 0);
});

test("失败文件可保留原始行号并只重新校验失败部分", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "S001", name: "张三", college: "计算机学院" }],
  });
  const context = contextFor(admin);
  const first = await validateDifficultyStudentImport({
    context,
    body: {
      rows: [
        { ...makeRow(), "原始行号": 2 },
        { ...makeRow({ "学号": "S002", "姓名(*)": "李四", "手机号码(*)": "13900139000", "身份证号(*)": "310101200001010029" }), "原始行号": 3 },
      ],
      academicYear: "2025-2026",
    },
    secret: SECRET,
  });
  assert.equal(first.passed, 1);
  assert.equal(first.failed, 1);

  admin.from = (table) => ({
    select: () => ({
      in: () => Promise.resolve({
        data: table === "enrolled_students"
          ? [
            { student_id: "S001", name: "张三", college: "计算机学院" },
            { student_id: "S002", name: "李四", college: "计算机学院" },
          ]
          : [],
        error: null,
      }),
    }),
  });
  const retried = await validateDifficultyStudentImport({
    context,
    body: {
      rows: [{
        ...makeRow({ "学号": "S002", "姓名(*)": "李四", "手机号码(*)": "13900139000", "身份证号(*)": "310101200001010029" }),
        "原始行号": 3,
      }],
      academicYear: "2025-2026",
      retryToken: first.validationToken,
      acceptedRows: first.passedRows,
    },
    secret: SECRET,
  });

  assert.equal(retried.total, 2);
  assert.equal(retried.passed, 2);
  assert.equal(retried.failed, 0);
});

test("重新校验不得遗漏上次失败行", async () => {
  const admin = createAdmin({
    enrollments: [{ student_id: "S001", name: "张三", college: "计算机学院" }],
  });
  const context = contextFor(admin);
  const first = await validateDifficultyStudentImport({
    context,
    body: {
      rows: [
        { ...makeRow(), "原始行号": 2 },
        { ...makeRow({ "学号": "S002", "姓名(*)": "李四", "手机号码(*)": "13900139000", "身份证号(*)": "310101200001010029" }), "原始行号": 3 },
        { ...makeRow({ "学号": "S003", "姓名(*)": "王五", "手机号码(*)": "13700137000", "身份证号(*)": "310101200001010037" }), "原始行号": 4 },
      ],
      academicYear: "2025-2026",
    },
    secret: SECRET,
  });
  assert.equal(first.failed, 2);

  await assert.rejects(
    () => validateDifficultyStudentImport({
      context,
      body: {
        rows: [{
          ...makeRow({ "学号": "S002", "姓名(*)": "李四", "手机号码(*)": "13900139000", "身份证号(*)": "310101200001010029" }),
          "原始行号": 3,
        }],
        academicYear: "2025-2026",
        retryToken: first.validationToken,
        acceptedRows: first.passedRows,
      },
      secret: SECRET,
    }),
    (error) => error?.code === "IMPORT_RETRY_SCOPE_INVALID"
  );
});
