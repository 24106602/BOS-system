import {
  DIFFICULTY_STUDENT_STATUS_LABELS,
  DIFFICULTY_STUDENT_STATUS_TRANSITIONS,
  getDifficultyStudentActionTarget,
  normalizeDifficultyStudentStatus,
} from "../src/constants/statusTransitions.ts";
import { ForbiddenError, guardStatus } from "../src/utils/guardStatus.ts";

const text = (value) => String(value ?? "").trim();

const TRANSITION_LOG_ACTIONS = {
  "draft->college_confirmed": "college_submit",
  "college_confirmed->school_reviewing": "school_start_review",
  "school_reviewing->school_approved": "school_approve",
  "school_reviewing->rejected_by_school": "school_reject",
  "reported->returned_by_center": "center_return",
};

export class DifficultyWorkflowValidationError extends Error {
  constructor(message, code = "DIFFICULTY_WORKFLOW_VALIDATION_FAILED") {
    super(message);
    this.name = "DifficultyWorkflowValidationError";
    this.statusCode = 400;
    this.code = code;
  }
}

export const readRequiredWorkflowRemark = (
  body,
  { fields = ["remark"], label = "说明" } = {}
) => {
  const source = body && typeof body === "object" ? body : {};
  const remark = fields.map((field) => text(source[field])).find(Boolean) || "";
  if (!remark) {
    throw new DifficultyWorkflowValidationError(
      `${label}不能为空`,
      "WORKFLOW_REMARK_REQUIRED"
    );
  }
  return remark;
};

export const getTransitionLogAction = (currentStatus, nextStatus) => {
  const action = TRANSITION_LOG_ACTIONS[`${currentStatus}->${nextStatus}`];
  if (!action) {
    throw new DifficultyWorkflowValidationError("未找到该状态转换对应的操作日志类型");
  }
  return action;
};

export const resolveResubmitTransition = (status, hasPriorRejection = false) => {
  const currentStatus = normalizeDifficultyStudentStatus(status);
  if (currentStatus !== "rejected_by_school" && !(currentStatus === "draft" && hasPriorRejection)) {
    throw new ForbiddenError(
      `当前状态“${DIFFICULTY_STUDENT_STATUS_LABELS[currentStatus]}（${currentStatus}）”不允许修改后重新提交；允许的前置状态：学校审核退回，或学校退回后已修改的草稿`,
      currentStatus,
      "submit",
      ["rejected_by_school"]
    );
  }

  let draftStatus = currentStatus;
  if (currentStatus === "rejected_by_school") {
    guardStatus(currentStatus, "edit", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
    const configuredDraftStatus = getDifficultyStudentActionTarget(currentStatus, "edit");
    if (!configuredDraftStatus) {
      throw new DifficultyWorkflowValidationError("学校退回后的草稿状态转换未配置");
    }
    draftStatus = configuredDraftStatus;
  }
  guardStatus(draftStatus, "submit", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
  const nextStatus = getDifficultyStudentActionTarget(draftStatus, "submit");
  if (!nextStatus) {
    throw new DifficultyWorkflowValidationError("学院重新提交的目标状态未配置");
  }

  return { currentStatus, draftStatus, nextStatus };
};

const getOperatorName = (context) =>
  text(context?.profile?.display_name)
  || text(context?.profile?.college_name)
  || (context?.profile?.role === "admin" ? "学校管理员" : "学院账号");

export const applyLoggedDifficultyTransition = async (
  admin,
  student,
  {
    currentStatus,
    nextStatus,
    operationAction,
    remark = "",
    changes = {},
    context,
  }
) => {
  const { data, error } = await admin.rpc("apply_difficulty_student_transition", {
    p_student_record_id: student.id,
    p_expected_status: currentStatus,
    p_next_status: nextStatus,
    p_action: operationAction,
    p_remark: text(remark) || null,
    p_operator_user_id: context?.user?.id || null,
    p_operator_role: text(context?.profile?.role) || null,
    p_operator_name: getOperatorName(context),
    p_changes: changes && typeof changes === "object" ? changes : {},
  });
  if (error) throw error;
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) throw new Error("困难生状态已处理，但未返回更新后的记录");
  return updated;
};
