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
  "school_approved->reported": "school_report",
  "reported->returned_by_center": "center_return",
  "returned_by_center->school_approved": "school_report",
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
  !context
    ? ""
    : text(context?.profile?.display_name)
      || text(context?.profile?.college_name)
      || (context?.profile?.role === "admin" ? "学校管理员" : "学院账号");

const getOperatorParams = (context) => ({
  p_operator_user_id: context?.user?.id || null,
  p_operator_role: text(context?.profile?.role) || null,
  p_operator_name: getOperatorName(context) || null,
});

/**
 * 困难生写操作的统一日志入口。
 * 传入的 RPC 必须在同一数据库事务内完成业务写入和 operation_log 写入，
 * 避免状态成功但日志缺失。
 */
export const logOperation = async (
  admin,
  { rpcName, params, emptyMessage = "困难生操作已处理，但未返回结果" }
) => {
  const { data, error } = await admin.rpc(rpcName, params);
  if (error) throw error;
  if (data === null || data === undefined) throw new Error(emptyMessage);
  return data;
};

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
  const data = await logOperation(admin, {
    rpcName: "apply_difficulty_student_transition",
    params: {
      p_student_record_id: student.id,
      p_expected_status: currentStatus,
      p_next_status: nextStatus,
      p_action: operationAction,
      p_remark: text(remark) || null,
      ...getOperatorParams(context),
      p_changes: changes && typeof changes === "object" ? changes : {},
    },
    emptyMessage: "困难生状态已处理，但未返回更新后的记录",
  });
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) throw new Error("困难生状态已处理，但未返回更新后的记录");
  return updated;
};

export const saveDifficultyStudentWithLog = async (
  admin,
  {
    student = null,
    payload,
    currentStatus = null,
    nextStatus,
    action,
    remark = "",
    context,
  }
) => {
  const data = await logOperation(admin, {
    rpcName: "save_difficulty_student_with_log",
    params: {
      p_student_record_id: student?.id || null,
      p_payload: payload && typeof payload === "object" ? payload : {},
      p_expected_status: currentStatus,
      p_next_status: nextStatus,
      p_action: action,
      p_remark: text(remark) || null,
      ...getOperatorParams(context),
    },
    emptyMessage: "困难生保存成功，但未返回记录",
  });
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error("困难生保存成功，但未返回记录");
  return saved;
};

export const deleteDifficultyStudentWithLog = async (
  admin,
  student,
  context,
  remark = ""
) => logOperation(admin, {
  rpcName: "delete_difficulty_student_with_log",
  params: {
    p_student_record_id: student.id,
    p_expected_status: normalizeDifficultyStudentStatus(student.status),
    p_remark: text(remark) || null,
    ...getOperatorParams(context),
  },
  emptyMessage: "困难生删除操作未返回结果",
});

export const reportDifficultyStudentRecordsWithLog = async (
  admin,
  ids,
  context,
  remark = ""
) => logOperation(admin, {
  rpcName: "report_difficulty_students_with_log",
  params: {
    p_ids: ids,
    p_remark: text(remark) || null,
    ...getOperatorParams(context),
  },
  emptyMessage: "困难生上报操作未返回结果",
});

export const getDifficultyStudentOperationHistory = async (admin, recordId) => {
  const { data, error } = await admin
    .from("operation_log")
    .select("id,table_name,record_id,action,operator_id,operator_role,operator_name,from_status,to_status,remark,snapshot,created_at")
    .eq("table_name", "difficulty_student")
    .eq("record_id", text(recordId))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};
