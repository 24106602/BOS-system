/**
 * 困难生家庭成员信息 Repository
 * 对应 dbo.difficulty_family_members 表
 */
import { query, sql, getPool } from "./connection.js";

const FIELD_MAP = {
  academicYear: "academic_year",
  semester: "semester",
  studentIdCard: "student_id_card",
  memberName: "member_name",
  memberAge: "member_age",
  relation: "relation",
  workUnit: "work_unit",
  annualIncome: "annual_income",
  occupation: "occupation",
  healthStatus: "health_status",
  sourceFile: "source_file",
  importedAt: "imported_at",
};

function toRowData(raw) {
  const row = { key: raw.key || "" };
  for (const [camel, snake] of Object.entries(FIELD_MAP)) {
    const val = raw[camel];
    row[snake] = val === undefined ? null : val;
  }
  return row;
}

const COLUMNS = Object.values(FIELD_MAP);

export const difficultyFamilyMemberRepository = {
  async bulkUpsert(members) {
    if (!members || members.length === 0) return 0;

    let count = 0;
    for (const m of members) {
      const row = toRowData(m);
      const params = { key: row.key };
      const setClauses = [];

      for (const [camel, snake] of Object.entries(FIELD_MAP)) {
        params[camel] = row[snake];
        if (snake !== "key") {
          setClauses.push(`${snake} = @${camel}`);
        }
      }

      await query(`
        MERGE dbo.difficulty_family_members AS target
        USING (SELECT @key AS [key]) AS source
        ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET ${setClauses.join(", ")}, is_deleted = 0, deleted_at = NULL, updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT ([key], ${COLUMNS.join(", ")}, is_deleted, created_at, updated_at)
          VALUES (@key, ${COLUMNS.map((c) => `@${Object.keys(FIELD_MAP).find((k) => FIELD_MAP[k] === c)}`).join(", ")}, 0, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `, params);
      count++;
    }

    return count;
  },

  async findByStudentIdCard(studentIdCard) {
    const result = await query(`
      SELECT * FROM dbo.difficulty_family_members
      WHERE student_id_card = @studentIdCard AND is_deleted = 0
      ORDER BY created_at;
    `, { studentIdCard });
    return result;
  },

  async findByAcademicYear(academicYear, semester = null) {
    const where = ["is_deleted = 0", "academic_year = @academicYear"];
    const params = { academicYear };
    if (semester) {
      where.push("semester = @semester");
      params.semester = semester;
    }

    const result = await query(`
      SELECT * FROM dbo.difficulty_family_members
      WHERE ${where.join(" AND ")}
      ORDER BY student_id_card, created_at;
    `, params);
    return result;
  },

  async count(includeDeleted = false) {
    const result = await query(`
      SELECT COUNT(*) AS total FROM dbo.difficulty_family_members
      WHERE ${includeDeleted ? "1=1" : "is_deleted = 0"};
    `);
    return result[0].total;
  },

  async softDeleteByStudentIdCard(studentIdCard) {
    await query(`
      UPDATE dbo.difficulty_family_members
      SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
      WHERE student_id_card = @studentIdCard AND is_deleted = 0;
    `, { studentIdCard });
    return true;
  },

  async softDeleteAll() {
    await query(`
      UPDATE dbo.difficulty_family_members
      SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET();
    `);
    return true;
  },
};
