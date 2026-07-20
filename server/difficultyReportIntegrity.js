import {
  evaluateDifficultyReportIntegrity,
  getEnabledDifficultyReportRules,
} from "../src/constants/difficultyReportIntegrity.ts";
import {
  DIFFICULTY_STUDENT_STATUS_TRANSITIONS,
  normalizeDifficultyStudentStatus,
} from "../src/constants/statusTransitions.ts";
import { guardStatus } from "../src/utils/guardStatus.ts";
import { reportDifficultyStudentRecordsWithLog } from "./difficultyReviewWorkflow.js";

const text = (value) => String(value ?? "").trim();
const normalizeIdCard = (value) => text(value).replace(/\s|-/g, "").toUpperCase();
const normalizeFieldName = (value) => text(value)
  .replace(/（[^）]*）|\([^)]*\)/g, "")
  .replace(/[\s*＊()（）:：，,。；;_-]/g, "")
  .toLowerCase();

const STUDENT_ID_ALIASES = ["student_id", "studentId", "学号", "学生学号", "学生编号"];
const ID_CARD_ALIASES = [
  "id_card",
  "idCard",
  "身份证号",
  "身份证件号",
  "证件号",
  "学生身份证号",
];
const PHOTO_FLAG_ALIASES = [
  "photo_uploaded",
  "photoUploaded",
  "照片已上传",
  "是否上传照片",
];
const PHOTO_VALUE_ALIASES = [
  "photo",
  "photo_url",
  "photoUrl",
  "照片",
  "学生照片",
  "照片地址",
];

const pickAliasedValue = (row, aliases) => {
  if (!row || typeof row !== "object") return undefined;
  const aliasSet = new Set(aliases.map(normalizeFieldName));
  const entry = Object.entries(row).find(([key]) => aliasSet.has(normalizeFieldName(key)));
  return entry?.[1];
};

const isTrueValue = (value) => {
  if (value === true || value === 1) return true;
  return ["true", "1", "yes", "y", "是", "已上传"].includes(text(value).toLowerCase());
};

const hasPhoto = (student) => {
  if (student.photo_uploaded === true || text(student.photo_url)) return true;
  const rawData = student.raw_data && typeof student.raw_data === "object"
    ? student.raw_data
    : {};
  return isTrueValue(pickAliasedValue(rawData, PHOTO_FLAG_ALIASES))
    || Boolean(text(pickAliasedValue(rawData, PHOTO_VALUE_ALIASES)));
};

const getFailureStudentId = (student) =>
  text(student?.student_id) || normalizeIdCard(student?.id_card) || text(student?.id);

const makeScopedIdentityKey = (academicYear, collegeName, identity) =>
  [text(academicYear), text(collegeName), text(identity)].join("::");

const assertQuerySucceeded = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

const queryEnrollmentRows = async (admin, students) => {
  const studentIds = [...new Set(students.map((student) => text(student.student_id)).filter(Boolean))];
  const idCards = [...new Set(students.map((student) => normalizeIdCard(student.id_card)).filter(Boolean))];
  const queries = [];
  if (studentIds.length > 0) {
    queries.push(admin.from("enrolled_students").select("student_id,id_card").in("student_id", studentIds));
  }
  if (idCards.length > 0) {
    queries.push(admin.from("enrolled_students").select("student_id,id_card").in("id_card", idCards));
  }
  const results = await Promise.all(queries);
  return results.flatMap(assertQuerySucceeded);
};

const queryFamilyBatches = async (admin, students) => {
  const academicYears = [...new Set(students.map((student) => text(student.academic_year)).filter(Boolean))];
  const collegeNames = [...new Set(students.map((student) => text(student.college_name)).filter(Boolean))];
  if (academicYears.length === 0 || collegeNames.length === 0) return [];

  const result = await admin
    .from("college_batches")
    .select("academic_year,college_name,batch_rows(row_data)")
    .eq("data_type", "family")
    .in("academic_year", academicYears)
    .in("college_name", collegeNames);
  return assertQuerySucceeded(result);
};

const queryPolicyDocuments = async (admin, students) => {
  const academicYears = [...new Set(students.map((student) => text(student.academic_year)).filter(Boolean))];
  if (academicYears.length === 0) return [];
  const result = await admin
    .from("difficulty_policy_documents")
    .select("academic_year,document_url,is_active")
    .in("academic_year", academicYears)
    .eq("is_active", true);
  return assertQuerySucceeded(result);
};

const buildEnrollmentIdentitySets = (rows) => ({
  studentIds: new Set(rows.map((row) => text(row.student_id)).filter(Boolean)),
  idCards: new Set(rows.map((row) => normalizeIdCard(row.id_card)).filter(Boolean)),
});

const buildFamilyIdentitySet = (batches) => {
  const identities = new Set();
  batches.forEach((batch) => {
    const rows = Array.isArray(batch.batch_rows) ? batch.batch_rows : [];
    rows.forEach((entry) => {
      const row = entry?.row_data && typeof entry.row_data === "object" ? entry.row_data : {};
      const idCard = normalizeIdCard(pickAliasedValue(row, ID_CARD_ALIASES));
      const studentId = text(pickAliasedValue(row, STUDENT_ID_ALIASES));
      if (idCard) {
        identities.add(makeScopedIdentityKey(batch.academic_year, batch.college_name, idCard));
      }
      if (studentId) {
        identities.add(makeScopedIdentityKey(batch.academic_year, batch.college_name, studentId));
      }
    });
  });
  return identities;
};

export class IncompleteDataError extends Error {
  constructor(failures) {
    super("困难生学校上报前完整性校验未通过");
    this.name = "IncompleteDataError";
    this.statusCode = 400;
    this.code = "INCOMPLETE_DATA";
    this.failures = failures;
  }
}

export const collectDifficultyReportFailures = async (
  admin,
  students,
  { configuredChecks, additionalFailures = [] } = {}
) => {
  const enabledRules = getEnabledDifficultyReportRules(configuredChecks);
  const enabledIds = new Set(enabledRules.map((rule) => rule.id));

  const [enrollmentRows, familyBatches, policyDocuments] = await Promise.all([
    enabledIds.has("enrollment") ? queryEnrollmentRows(admin, students) : [],
    enabledIds.has("family_members") ? queryFamilyBatches(admin, students) : [],
    enabledIds.has("policy_document") ? queryPolicyDocuments(admin, students) : [],
  ]);

  const enrollment = buildEnrollmentIdentitySets(enrollmentRows);
  const familyIdentities = buildFamilyIdentitySet(familyBatches);
  const policyYears = new Set(
    policyDocuments
      .filter((document) => text(document.document_url))
      .map((document) => text(document.academic_year))
  );

  const failures = students.flatMap((student) => {
    const studentId = text(student.student_id);
    const idCard = normalizeIdCard(student.id_card);
    const scopedIdCard = idCard
      ? makeScopedIdentityKey(student.academic_year, student.college_name, idCard)
      : "";
    const scopedStudentId = studentId
      ? makeScopedIdentityKey(student.academic_year, student.college_name, studentId)
      : "";
    const facts = {
      enrollmentExists: Boolean(
        (studentId && enrollment.studentIds.has(studentId))
        || (idCard && enrollment.idCards.has(idCard))
      ),
      familyMembersExist: Boolean(
        (scopedIdCard && familyIdentities.has(scopedIdCard))
        || (scopedStudentId && familyIdentities.has(scopedStudentId))
      ),
      photoUploaded: hasPhoto(student),
      policyDocumentUploaded: policyYears.has(text(student.academic_year)),
      status: normalizeDifficultyStudentStatus(student.status),
    };
    const reasons = evaluateDifficultyReportIntegrity(facts, enabledRules.map((rule) => rule.id));
    return reasons.length > 0 ? [{ studentId: getFailureStudentId(student), reasons }] : [];
  });

  return [...additionalFailures, ...failures];
};

export const assertDifficultyReportIntegrity = async (admin, students, options = {}) => {
  const failures = await collectDifficultyReportFailures(admin, students, options);
  if (failures.length > 0) throw new IncompleteDataError(failures);
};

export const reportDifficultyStudentsAtomically = async (admin, students, options = {}) => {
  await assertDifficultyReportIntegrity(admin, students, options);
  students.forEach((student) => {
    guardStatus(student.status, "report", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
  });
  const ids = [...new Set(students.map((student) => text(student.id)).filter(Boolean))];
  const data = await reportDifficultyStudentRecordsWithLog(
    admin,
    ids,
    options.context,
    options.remark
  );
  return data || [];
};
