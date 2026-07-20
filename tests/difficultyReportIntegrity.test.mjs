import assert from "node:assert/strict";
import test from "node:test";
import {
  IncompleteDataError,
  reportDifficultyStudentsAtomically,
} from "../server/difficultyReportIntegrity.js";
import { difficultyStudentErrorHandler } from "../server/difficultyStudentRoutes.js";

class MockQuery {
  constructor(rows) {
    this.rows = rows;
  }

  select() { return this; }
  eq() { return this; }
  in() { return this; }

  then(resolve, reject) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve, reject);
  }
}

const makeAdmin = (tables, rpcResult = []) => {
  const rpcCalls = [];
  return {
    rpcCalls,
    from(table) {
      return new MockQuery(tables[table] || []);
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return { data: rpcResult, error: null };
    },
  };
};

const student = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  academic_year: "2025-2026",
  college_name: "测试学院",
  student_id: "S001",
  id_card: "310101200001010010",
  photo_uploaded: true,
  raw_data: {},
  status: "school_approved",
  ...overrides,
});

const completeTables = {
  enrolled_students: [{ student_id: "S001", id_card: "310101200001010010" }],
  college_batches: [{
    academic_year: "2025-2026",
    college_name: "测试学院",
    batch_rows: [{ row_data: { "学生身份证号*": "310101200001010010" } }],
  }],
  difficulty_policy_documents: [{
    academic_year: "2025-2026",
    document_url: "https://storage.example/policy.docx",
    is_active: true,
  }],
};

test("完整性失败时返回逐生原因且不调用原子上报 RPC", async () => {
  const admin = makeAdmin({});
  await assert.rejects(
    () => reportDifficultyStudentsAtomically(admin, [student({
      photo_uploaded: false,
      status: "draft",
    })]),
    (error) => {
      assert.ok(error instanceof IncompleteDataError);
      assert.equal(error.code, "INCOMPLETE_DATA");
      assert.equal(error.statusCode, 400);
      assert.deepEqual(error.failures, [{
        studentId: "S001",
        reasons: [
          "缺学籍记录",
          "缺家庭成员信息",
          "缺学生照片",
          "学校未上传困难生认定办法",
          "当前状态不允许学校上报（须为学校已审核或中心退回）",
        ],
      }]);
      return true;
    }
  );
  assert.equal(admin.rpcCalls.length, 0);
});

test("Express API 将完整性错误映射为 HTTP 400 结构化响应", () => {
  const failure = { studentId: "S001", reasons: ["缺家庭成员信息"] };
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  difficultyStudentErrorHandler(new IncompleteDataError([failure]), {}, response, () => {});
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    code: "INCOMPLETE_DATA",
    message: "困难生学校上报前完整性校验未通过",
    failures: [failure],
  });
});

test("批量中任一学生不完整时整批拒绝", async () => {
  const second = student({
    id: "22222222-2222-4222-8222-222222222222",
    student_id: "S002",
    id_card: "310101200001010029",
  });
  const admin = makeAdmin({
    ...completeTables,
    enrolled_students: [
      ...completeTables.enrolled_students,
      { student_id: "S002", id_card: "310101200001010029" },
    ],
  });

  await assert.rejects(
    () => reportDifficultyStudentsAtomically(admin, [student(), second]),
    (error) => {
      assert.deepEqual(error.failures, [{ studentId: "S002", reasons: ["缺家庭成员信息"] }]);
      return true;
    }
  );
  assert.equal(admin.rpcCalls.length, 0);
});

test("全部通过时只调用一次 RPC 完成整批状态写入", async () => {
  const updated = [student({ status: "reported" })];
  const admin = makeAdmin(completeTables, updated);
  const result = await reportDifficultyStudentsAtomically(admin, [student()]);

  assert.deepEqual(result, updated);
  assert.deepEqual(admin.rpcCalls, [{
    name: "report_difficulty_students_with_log",
    params: {
      p_ids: ["11111111-1111-4111-8111-111111111111"],
      p_remark: null,
      p_operator_user_id: null,
      p_operator_role: null,
      p_operator_name: null,
    },
  }]);
});
