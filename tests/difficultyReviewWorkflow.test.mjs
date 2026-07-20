import assert from "node:assert/strict";
import test from "node:test";
import {
  DifficultyWorkflowValidationError,
  applyLoggedDifficultyTransition,
  getTransitionLogAction,
  readRequiredWorkflowRemark,
  resolveResubmitTransition,
} from "../server/difficultyReviewWorkflow.js";

test("学校审核退回必须填写退回原因，并兼容旧 reason 字段", () => {
  assert.throws(
    () => readRequiredWorkflowRemark({ remark: "  " }, { label: "退回原因" }),
    (error) => {
      assert.ok(error instanceof DifficultyWorkflowValidationError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "WORKFLOW_REMARK_REQUIRED");
      assert.equal(error.message, "退回原因不能为空");
      return true;
    }
  );

  assert.equal(
    readRequiredWorkflowRemark(
      { reason: "材料证明不完整" },
      { fields: ["remark", "reason"], label: "退回原因" }
    ),
    "材料证明不完整"
  );
});

test("学院重新提交必须从学校审核退回状态开始，并沿用既有合法路径", () => {
  const transition = resolveResubmitTransition("rejected_by_school");
  assert.deepEqual(transition, {
    currentStatus: "rejected_by_school",
    draftStatus: "draft",
    nextStatus: "college_confirmed",
  });
  assert.deepEqual(resolveResubmitTransition("draft", true), {
    currentStatus: "draft",
    draftStatus: "draft",
    nextStatus: "college_confirmed",
  });

  assert.throws(
    () => resolveResubmitTransition("school_reviewing"),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.match(error.message, /不允许修改后重新提交/);
      return true;
    }
  );
});

test("退回、重新审核和审核通过均有明确操作日志类型", () => {
  assert.equal(
    getTransitionLogAction("school_reviewing", "rejected_by_school"),
    "school_reject"
  );
  assert.equal(
    getTransitionLogAction("college_confirmed", "school_reviewing"),
    "school_start_review"
  );
  assert.equal(
    getTransitionLogAction("school_reviewing", "school_approved"),
    "school_approve"
  );
});

test("状态更新通过原子 RPC 传递操作人、原因和前后状态", async () => {
  let rpcName = "";
  let rpcArgs;
  const admin = {
    async rpc(name, args) {
      rpcName = name;
      rpcArgs = args;
      return {
        data: [{ id: "student-record-id", status: "rejected_by_school" }],
        error: null,
      };
    },
  };
  const context = {
    user: { id: "operator-user-id" },
    profile: {
      role: "admin",
      display_name: "学校审核员",
      college_name: null,
    },
  };

  const updated = await applyLoggedDifficultyTransition(
    admin,
    { id: "student-record-id" },
    {
      currentStatus: "school_reviewing",
      nextStatus: "rejected_by_school",
      operationAction: "school_reject",
      remark: "材料证明不完整",
      changes: { difficulty_level: "特别困难" },
      context,
    }
  );

  assert.equal(rpcName, "apply_difficulty_student_transition");
  assert.equal(rpcArgs.p_expected_status, "school_reviewing");
  assert.equal(rpcArgs.p_next_status, "rejected_by_school");
  assert.equal(rpcArgs.p_action, "school_reject");
  assert.equal(rpcArgs.p_remark, "材料证明不完整");
  assert.equal(rpcArgs.p_operator_user_id, "operator-user-id");
  assert.equal(rpcArgs.p_operator_name, "学校审核员");
  assert.deepEqual(rpcArgs.p_changes, { difficulty_level: "特别困难" });
  assert.equal(updated.status, "rejected_by_school");
});
