import {
  DIFFICULTY_STUDENT_STATUS_ALLOWED_ACTIONS,
  DIFFICULTY_STUDENT_STATUS_DENIAL_MESSAGES,
  DIFFICULTY_STUDENT_STATUS_LABELS,
  DIFFICULTY_STUDENT_STATUS_TRANSITIONS,
  isDifficultyStudentStatus,
  resolveDifficultyStudentStatus,
  type DifficultyStudentStatus,
  type DifficultyStudentStatusAction,
} from "../constants/statusTransitions.ts";

export type StatusTransitionMap = Record<string, readonly string[]>;

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "STATUS_ACTION_FORBIDDEN";
  readonly currentStatus: string;
  readonly action: DifficultyStudentStatusAction;
  readonly allowedPrerequisiteStatuses: DifficultyStudentStatus[];

  constructor(
    message: string,
    currentStatus: string,
    action: DifficultyStudentStatusAction,
    allowedPrerequisiteStatuses: DifficultyStudentStatus[]
  ) {
    super(message);
    this.name = "ForbiddenError";
    this.currentStatus = currentStatus;
    this.action = action;
    this.allowedPrerequisiteStatuses = allowedPrerequisiteStatuses;
  }
}

const isDifficultyStudentStatusAction = (
  value: string
): value is DifficultyStudentStatusAction =>
  Object.values(DIFFICULTY_STUDENT_STATUS_ALLOWED_ACTIONS)
    .some((actions) => actions.includes(value as DifficultyStudentStatusAction));

export const guardStatus = (
  currentStatus: string,
  action: string,
  transitions: StatusTransitionMap = DIFFICULTY_STUDENT_STATUS_TRANSITIONS
): void => {
  const normalizedStatus = resolveDifficultyStudentStatus(currentStatus);
  const normalizedAction = action.trim();
  const actionIsKnown = isDifficultyStudentStatusAction(normalizedAction);
  const allowedActions = normalizedStatus
    ? DIFFICULTY_STUDENT_STATUS_ALLOWED_ACTIONS[normalizedStatus]
    : [];

  if (actionIsKnown && allowedActions.includes(normalizedAction)) return;

  const allowedPrerequisiteStatuses = Object.keys(transitions)
    .filter(isDifficultyStudentStatus)
    .filter((status) => actionIsKnown && (
      DIFFICULTY_STUDENT_STATUS_ALLOWED_ACTIONS[status]?.includes(normalizedAction)
    ));
  const allowedText = allowedPrerequisiteStatuses.length > 0
    ? allowedPrerequisiteStatuses
      .map((status) => `${DIFFICULTY_STUDENT_STATUS_LABELS[status]}（${status}）`)
      .join("、")
    : "无";
  const statusLabel = normalizedStatus
    ? DIFFICULTY_STUDENT_STATUS_LABELS[normalizedStatus]
    : "未知状态";
  const specificMessage = normalizedStatus && actionIsKnown
    ? DIFFICULTY_STUDENT_STATUS_DENIAL_MESSAGES[normalizedStatus]?.[normalizedAction]
    : undefined;
  const message = [
    `当前状态“${statusLabel}（${normalizedStatus || currentStatus}）”不允许执行操作“${normalizedAction || action}”`,
    `允许该操作的前置状态：${allowedText}`,
    specificMessage,
  ].filter(Boolean).join("；");

  throw new ForbiddenError(
    message,
    normalizedStatus || currentStatus,
    actionIsKnown ? normalizedAction : (normalizedAction as DifficultyStudentStatusAction),
    allowedPrerequisiteStatuses
  );
};
