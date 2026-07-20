import {
  normalizeDifficultyStudentStatus,
  type DifficultyStudentStatus,
} from "../constants/statusTransitions";

export type DifficultyStudentActionRole = "college" | "school";

export type DifficultyStudentUiAction =
  | "edit"
  | "delete"
  | "confirm_upload"
  | "resubmit"
  | "start_review"
  | "approve"
  | "reject"
  | "report";

export type DifficultyStudentActionHint = {
  text: string;
  tone: "info" | "success" | "warning" | "danger" | "locked";
};

const COLLEGE_ACTIONS: Record<DifficultyStudentStatus, readonly DifficultyStudentUiAction[]> = {
  draft: ["edit", "delete", "confirm_upload"],
  college_confirmed: [],
  school_reviewing: [],
  school_approved: [],
  reported: [],
  rejected_by_school: ["edit", "delete", "resubmit"],
  returned_by_center: ["edit"],
};

const SCHOOL_ACTIONS: Record<DifficultyStudentStatus, readonly DifficultyStudentUiAction[]> = {
  draft: [],
  college_confirmed: ["start_review"],
  school_reviewing: ["approve", "reject"],
  school_approved: ["report"],
  reported: [],
  rejected_by_school: [],
  returned_by_center: ["report"],
};

const COLLEGE_HINTS: Record<DifficultyStudentStatus, DifficultyStudentActionHint> = {
  draft: { text: "草稿状态，可编辑、删除或确认上载。", tone: "info" },
  college_confirmed: { text: "等待学校审核，学院端暂不可编辑或删除。", tone: "info" },
  school_reviewing: { text: "学校审核中，学院端暂不可编辑或删除。", tone: "warning" },
  school_approved: { text: "学校已审核，等待学校上报。", tone: "success" },
  reported: { text: "已上报 · 需中心退回方可修改", tone: "locked" },
  rejected_by_school: { text: "审核退回，请修改后重新提交。", tone: "danger" },
  returned_by_center: { text: "中心已退回，可重新上报；如需修正资料，请进入处理页重新编辑。", tone: "warning" },
};

const SCHOOL_HINTS: Record<DifficultyStudentStatus, DifficultyStudentActionHint> = {
  draft: { text: "学院处理中，学校端暂不可操作。", tone: "info" },
  college_confirmed: { text: "学院已确认上载，可接收并开始学校审核。", tone: "info" },
  school_reviewing: { text: "学校审核中，请选择审核通过或审核退回。", tone: "warning" },
  school_approved: { text: "学校已审核，可执行上报。", tone: "success" },
  reported: { text: "已上报 · 需中心退回方可修改", tone: "locked" },
  rejected_by_school: { text: "已退回学院修改，等待学院重新提交。", tone: "danger" },
  returned_by_center: { text: "中心已退回，可重新上报。", tone: "warning" },
};

export const getAvailableActions = (
  status: unknown,
  role: DifficultyStudentActionRole
): readonly DifficultyStudentUiAction[] => {
  const normalizedStatus = normalizeDifficultyStudentStatus(status);
  return role === "college" ? COLLEGE_ACTIONS[normalizedStatus] : SCHOOL_ACTIONS[normalizedStatus];
};

export const getDifficultyStudentActionHint = (
  status: unknown,
  role: DifficultyStudentActionRole
): DifficultyStudentActionHint => {
  const normalizedStatus = normalizeDifficultyStudentStatus(status);
  return role === "college" ? COLLEGE_HINTS[normalizedStatus] : SCHOOL_HINTS[normalizedStatus];
};

export const DIFFICULTY_STUDENT_ACTION_LABELS: Record<DifficultyStudentUiAction, string> = {
  edit: "编辑",
  delete: "删除",
  confirm_upload: "确认上载",
  resubmit: "修改后重新提交",
  start_review: "开始审核",
  approve: "审核通过",
  reject: "审核退回",
  report: "上报",
};
