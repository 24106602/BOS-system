export const DIFFICULTY_STUDENT_STATUSES = [
  "draft",
  "college_confirmed",
  "school_reviewing",
  "school_approved",
  "reported",
  "rejected_by_school",
  "returned_by_center",
] as const;

export type DifficultyStudentStatus = (typeof DIFFICULTY_STUDENT_STATUSES)[number];

export const DIFFICULTY_STUDENT_STATUS_LABELS: Record<DifficultyStudentStatus, string> = {
  draft: "草稿/学院处理中",
  college_confirmed: "学院确认审核及上载",
  school_reviewing: "学校审核中",
  school_approved: "学校已审核",
  reported: "学校已上报",
  rejected_by_school: "学校审核退回",
  returned_by_center: "中心退回",
};

export type DifficultyStudentStatusAction =
  | "edit"
  | "delete"
  | "submit"
  | "approve"
  | "reject"
  | "report";

/** 合法状态转换路径。未列出的目标状态均视为非法转换。 */
export const DIFFICULTY_STUDENT_STATUS_TRANSITIONS: Record<
  DifficultyStudentStatus,
  readonly DifficultyStudentStatus[]
> = {
  draft: ["college_confirmed"],
  college_confirmed: ["school_reviewing"],
  school_reviewing: ["school_approved", "rejected_by_school"],
  school_approved: ["reported"],
  reported: ["returned_by_center"],
  rejected_by_school: ["draft"],
  returned_by_center: ["school_approved"],
};

/** 每个状态允许发起的操作。reported 下的 reject 专指中心退回。 */
export const DIFFICULTY_STUDENT_STATUS_ALLOWED_ACTIONS: Record<
  DifficultyStudentStatus,
  readonly DifficultyStudentStatusAction[]
> = {
  draft: ["edit", "delete", "submit"],
  college_confirmed: ["submit"],
  school_reviewing: ["approve", "reject"],
  school_approved: ["report"],
  reported: ["reject"],
  rejected_by_school: ["edit", "delete"],
  returned_by_center: ["report"],
};

/** 每个合法操作对应的目标状态；edit/delete 不改变状态，因此不在本表中。 */
export const DIFFICULTY_STUDENT_STATUS_ACTION_TARGETS: Record<
  DifficultyStudentStatus,
  Partial<Record<DifficultyStudentStatusAction, DifficultyStudentStatus>>
> = {
  draft: { submit: "college_confirmed" },
  college_confirmed: { submit: "school_reviewing" },
  school_reviewing: {
    approve: "school_approved",
    reject: "rejected_by_school",
  },
  school_approved: { report: "reported" },
  reported: { reject: "returned_by_center" },
  rejected_by_school: { edit: "draft" },
  returned_by_center: { report: "school_approved" },
};

export const DIFFICULTY_STUDENT_STATUS_DENIAL_MESSAGES: Partial<
  Record<DifficultyStudentStatus, Partial<Record<DifficultyStudentStatusAction, string>>>
> = {
  reported: {
    edit: "已上报，需中心退回后方可修改",
    delete: "已上报，需中心退回后方可修改",
    submit: "已上报，需中心退回后方可修改",
  },
};

export const CENTER_ONLY_DIFFICULTY_STATUS_TRANSITIONS = [
  "reported->returned_by_center",
] as const;

const LEGACY_DIFFICULTY_STATUS_ALIASES: Record<string, DifficultyStudentStatus> = {
  college_submitted: "college_confirmed",
  local_uploaded: "college_confirmed",
  pending_review: "school_reviewing",
  rejected: "rejected_by_school",
  archived: "reported",
  "学院已确认": "college_confirmed",
  "学院已提交": "college_confirmed",
  "已上载学校端": "college_confirmed",
  "待学校确认": "school_reviewing",
  "管理员归档": "reported",
};

const STATUS_SET = new Set<string>(DIFFICULTY_STUDENT_STATUSES);

export const isDifficultyStudentStatus = (value: unknown): value is DifficultyStudentStatus =>
  typeof value === "string" && STATUS_SET.has(value);

export const resolveDifficultyStudentStatus = (
  value: unknown
): DifficultyStudentStatus | null => {
  const status = String(value ?? "").trim();
  if (isDifficultyStudentStatus(status)) return status;
  return LEGACY_DIFFICULTY_STATUS_ALIASES[status] || null;
};

/**
 * 将旧状态转换为新状态。未知值使用调用方给定的安全回退值，
 * 使旧 Excel 或旧数据库记录不会导致新约束写入失败。
 */
export const normalizeDifficultyStudentStatus = (
  value: unknown,
  fallback: DifficultyStudentStatus = "draft"
): DifficultyStudentStatus => {
  return resolveDifficultyStudentStatus(value) || fallback;
};

export const getDifficultyStudentStatusLabel = (value: unknown): string => {
  const status = String(value ?? "").trim();
  if (!status) return DIFFICULTY_STUDENT_STATUS_LABELS.draft;
  const normalized = isDifficultyStudentStatus(status)
    ? status
    : LEGACY_DIFFICULTY_STATUS_ALIASES[status];
  return normalized ? DIFFICULTY_STUDENT_STATUS_LABELS[normalized] : status;
};

export const canTransitionDifficultyStudentStatus = (
  from: DifficultyStudentStatus,
  to: DifficultyStudentStatus
) => DIFFICULTY_STUDENT_STATUS_TRANSITIONS[from].includes(to);

export const getDifficultyStudentActionTarget = (
  status: DifficultyStudentStatus,
  action: DifficultyStudentStatusAction
) => DIFFICULTY_STUDENT_STATUS_ACTION_TARGETS[status][action];
