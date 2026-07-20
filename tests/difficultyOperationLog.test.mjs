import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteDifficultyStudentWithLog,
  getDifficultyStudentOperationHistory,
  getTransitionLogAction,
  reportDifficultyStudentRecordsWithLog,
  saveDifficultyStudentWithLog,
} from "../server/difficultyReviewWorkflow.js";

const context = {
  user: { id: "operator-user-id" },
  profile: {
    role: "admin",
    display_name: "学校管理员王老师",
    college_name: null,
  },
};

test("所有独立写入路径通过统一日志入口调用原子 RPC", async () => {
  const rpcCalls = [];
  const admin = {
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      if (name === "delete_difficulty_student_with_log") return { data: true, error: null };
      if (name === "report_difficulty_students_with_log") {
        return { data: [{ id: "record-id", status: "reported" }], error: null };
      }
      return { data: [{ id: "record-id", status: "college_confirmed" }], error: null };
    },
  };

  await saveDifficultyStudentWithLog(admin, {
    payload: { student_id: "S001", academic_year: "2025-2026" },
    nextStatus: "college_confirmed",
    action: "confirm",
    context,
  });
  await deleteDifficultyStudentWithLog(
    admin,
    { id: "record-id", status: "draft" },
    context,
    "删除重复草稿"
  );
  await reportDifficultyStudentRecordsWithLog(admin, ["record-id"], context);

  assert.deepEqual(
    rpcCalls.map((call) => call.name),
    [
      "save_difficulty_student_with_log",
      "delete_difficulty_student_with_log",
      "report_difficulty_students_with_log",
    ]
  );
  rpcCalls.forEach((call) => {
    assert.equal(call.params.p_operator_user_id, "operator-user-id");
    assert.equal(call.params.p_operator_role, "admin");
    assert.equal(call.params.p_operator_name, "学校管理员王老师");
  });
});

test("学校上报状态转换具有专用日志映射", () => {
  assert.equal(getTransitionLogAction("school_approved", "reported"), "school_report");
  assert.equal(
    getTransitionLogAction("returned_by_center", "school_approved"),
    "school_report"
  );
});

test("操作历史按记录和时间倒序查询", async () => {
  const calls = [];
  const expected = [{
    id: "log-id",
    table_name: "difficulty_student",
    record_id: "record-id",
    action: "reject",
    created_at: "2026-07-20T00:00:00Z",
  }];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    async order(column, options) {
      calls.push(["order", column, options]);
      return { data: expected, error: null };
    },
  };
  const admin = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };

  const result = await getDifficultyStudentOperationHistory(admin, "record-id");
  assert.deepEqual(result, expected);
  assert.deepEqual(calls.slice(-3), [
    ["eq", "table_name", "difficulty_student"],
    ["eq", "record_id", "record-id"],
    ["order", "created_at", { ascending: false }],
  ]);
});
