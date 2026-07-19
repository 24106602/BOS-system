import type { DifficultyStudentStatus } from "./statusTransitions";

export const DIFFICULTY_REPORT_CHECK_IDS = [
  "enrollment",
  "family_members",
  "photo",
  "policy_document",
  "status",
] as const;

export type DifficultyReportCheckId = (typeof DIFFICULTY_REPORT_CHECK_IDS)[number];

export type DifficultyReportIntegrityFacts = {
  enrollmentExists: boolean;
  familyMembersExist: boolean;
  photoUploaded: boolean;
  policyDocumentUploaded: boolean;
  status: DifficultyStudentStatus;
};

export type DifficultyReportIntegrityRule = {
  id: DifficultyReportCheckId;
  reason: string;
  isSatisfied: (facts: DifficultyReportIntegrityFacts) => boolean;
};

/**
 * 学校上报前完整性规则。
 *
 * 增减校验项时只需维护本表和 DIFFICULTY_REPORT_CHECK_IDS；运行时也可通过
 * DIFFICULTY_REPORT_REQUIRED_CHECKS（逗号分隔）选择启用的规则。
 */
export const DIFFICULTY_REPORT_INTEGRITY_RULES: readonly DifficultyReportIntegrityRule[] = [
  {
    id: "enrollment",
    reason: "缺学籍记录",
    isSatisfied: (facts) => facts.enrollmentExists,
  },
  {
    id: "family_members",
    reason: "缺家庭成员信息",
    isSatisfied: (facts) => facts.familyMembersExist,
  },
  {
    id: "photo",
    reason: "缺学生照片",
    isSatisfied: (facts) => facts.photoUploaded,
  },
  {
    id: "policy_document",
    reason: "学校未上传困难生认定办法",
    isSatisfied: (facts) => facts.policyDocumentUploaded,
  },
  {
    id: "status",
    reason: "当前状态不允许学校上报（须为学校已审核或中心退回）",
    isSatisfied: (facts) => ["school_approved", "returned_by_center"].includes(facts.status),
  },
];

const CHECK_ID_SET = new Set<string>(DIFFICULTY_REPORT_CHECK_IDS);

export const getEnabledDifficultyReportRules = (
  configuredChecks?: string | readonly string[] | null
): readonly DifficultyReportIntegrityRule[] => {
  const configured = Array.isArray(configuredChecks)
    ? configuredChecks
    : String(configuredChecks ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  if (configured.length === 0) return DIFFICULTY_REPORT_INTEGRITY_RULES;

  const enabled = new Set(
    configured.filter((item): item is DifficultyReportCheckId => CHECK_ID_SET.has(item))
  );
  const enabledRules = DIFFICULTY_REPORT_INTEGRITY_RULES.filter((rule) => enabled.has(rule.id));
  return enabledRules.length > 0 ? enabledRules : DIFFICULTY_REPORT_INTEGRITY_RULES;
};

export const evaluateDifficultyReportIntegrity = (
  facts: DifficultyReportIntegrityFacts,
  configuredChecks?: string | readonly string[] | null
): string[] => getEnabledDifficultyReportRules(configuredChecks)
  .filter((rule) => !rule.isSatisfied(facts))
  .map((rule) => rule.reason);
