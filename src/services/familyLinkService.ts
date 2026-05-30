import type {
  FamilyMemberRecord,
  FamilyValidationStatus,
  MergedStudentRecord,
  StudentRecord,
} from "../types/platform";

const normalizeIdCard = (value: string) => String(value || "").trim().toUpperCase();

const makeValidation = (
  status: FamilyValidationStatus,
  message: string
) => ({ status, message });

export function linkStudentsWithFamilyMembers(
  students: StudentRecord[],
  familyMembers: FamilyMemberRecord[]
): MergedStudentRecord[] {
  const familyByStudentIdCard = new Map<string, FamilyMemberRecord[]>();

  familyMembers.forEach((member) => {
    const key = normalizeIdCard(member.student_id_card);
    if (!key) return;
    const current = familyByStudentIdCard.get(key) || [];
    current.push(member);
    familyByStudentIdCard.set(key, current);
  });

  return students.map((student) => {
    const studentIdCard = normalizeIdCard(student.id_card);
    const matchedFamilyMembers = studentIdCard
      ? familyByStudentIdCard.get(studentIdCard) || []
      : [];
    const expectedCount = Number(student.family_count ?? 0);

    let validation;
    if (!studentIdCard) {
      validation = makeValidation("need_review", "学生身份证号为空，无法关联家庭成员信息");
    } else if (expectedCount > 0 && matchedFamilyMembers.length !== expectedCount) {
      validation = makeValidation(
        "missing_family_members",
        `家庭成员数量不一致：本专科信息登记 ${expectedCount} 人，家庭成员表找到 ${matchedFamilyMembers.length} 人`
      );
    } else if (expectedCount === 0 && matchedFamilyMembers.length > 0) {
      validation = makeValidation(
        "unexpected_family_members",
        "本专科信息家庭成员数为 0，但家庭成员表存在记录"
      );
    } else if (expectedCount === 0) {
      validation = makeValidation(
        "orphan_confirmed",
        "家庭成员数为 0，未发现家庭成员记录，请确认是否为孤儿或特殊情况"
      );
    } else {
      validation = makeValidation("matched", "家庭成员信息已按学生身份证号匹配");
    }

    return {
      student,
      familyMembers: matchedFamilyMembers,
      familyValidationStatus: validation.status,
      familyValidationMessage: validation.message,
    };
  });
}
