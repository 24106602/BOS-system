export type StudentRecord = {
  college_name: string;
  student_id: string;
  name: string;
  id_card: string;
  difficulty_level: string;
  status: string;
  family_count?: number;
};

export type FamilyMemberRecord = {
  college_name: string;
  student_name: string;
  student_id_card: string;
  member_name: string;
  relationship: string;
  member_id_card?: string;
  work_status?: string;
  income?: string;
};

export type FamilyValidationStatus =
  | "matched"
  | "missing_family_members"
  | "unexpected_family_members"
  | "orphan_confirmed"
  | "need_review";

export type MergedStudentRecord = {
  student: StudentRecord;
  familyMembers: FamilyMemberRecord[];
  familyValidationStatus: FamilyValidationStatus;
  familyValidationMessage: string;
};
