/**
 * 困难生本专科信息 Repository
 * 对应 dbo.difficulty_students 表
 */
import { query, sql, getPool } from "./connection.js";

// 字段映射：camelCase -> snake_case 列名
const FIELD_MAP = {
  academicYear: "academic_year",
  semester: "semester",
  collegeName: "college_name",
  name: "name",
  studentId: "student_id",
  idCard: "id_card",
  nativePlace: "native_place",
  phone: "phone",
  counselorName: "counselor_name",
  familyPopulation: "family_population",
  laborPopulation: "labor_population",
  unemployedPopulation: "unemployed_population",
  dependentPopulation: "dependent_population",
  familyIncome: "family_income",
  familyAddress: "family_address",
  postcode: "postcode",
  parentPhone: "parent_phone",
  incomeSource: "income_source",
  familyDebtAmount: "family_debt_amount",
  familyDebtReason: "family_debt_reason",
  specialDifficultyType: "special_difficulty_type",
  householdType: "household_type",
  isWubaoHousehold: "is_wubao_household",
  isSingleParentChild: "is_single_parent_child",
  disabilityCategory: "disability_category",
  parentsLostLaborAbility: "parents_lost_labor_ability",
  hasMajorDiseasePatient: "has_major_disease_patient",
  hasNaturalDisaster: "has_natural_disaster",
  naturalDisasterDescription: "natural_disaster_description",
  hasUnexpectedEvent: "has_unexpected_event",
  unexpectedEventDescription: "unexpected_event_description",
  familyDisabilityWeakLaborSituation: "family_disability_weak_labor",
  familyUnemploymentSituation: "family_unemployment_situation",
  otherSituation: "other_situation",
  applicationDate: "application_date",
  finalRecommendLevel: "final_recommend_level",
  studentStatement: "student_statement",
  recognitionDate: "recognition_date",
  agreesReviewGroup: "agrees_review_group",
  collegeRecommendLevel: "college_recommend_level",
  collegeOpinion: "college_opinion",
  agreesCollegeWorkingGroup: "agrees_college_working_group",
  schoolRecommendLevel: "school_recommend_level",
  schoolOpinion: "school_opinion",
  sourceFile: "source_file",
  importedAt: "imported_at",
};

function toRowData(raw) {
  const row = { key: raw.key || "" };
  for (const [camel, snake] of Object.entries(FIELD_MAP)) {
    row[snake] = raw[camel] ?? null;
  }
  return row;
}

const COLUMNS = Object.values(FIELD_MAP);

export const difficultyStudentDetailRepository = {
  async bulkUpsert(students) {
    if (!students || students.length === 0) return 0;

    let count = 0;
    for (const s of students) {
      const row = toRowData(s);
      const params = { key: row.key };
      const setClauses = [];

      for (const [camel, snake] of Object.entries(FIELD_MAP)) {
        const val = row[snake];
        params[camel] = val;
        if (snake !== "key" && snake !== "name") {
          setClauses.push(`${snake} = @${camel}`);
        }
      }

      await query(`
        MERGE dbo.difficulty_students AS target
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

  async findByCollegeYear(collegeName, academicYear, options = {}) {
    const { includeDeleted = false, offset = 0, limit = 1000 } = options;
    const where = [
      includeDeleted ? "1=1" : "is_deleted = 0",
    ];
    const params = {};
    if (collegeName) {
      where.push("college_name = @collegeName");
      params.collegeName = collegeName;
    }
    if (academicYear) {
      where.push("academic_year = @academicYear");
      params.academicYear = academicYear;
    }

    const result = await query(`
      SELECT * FROM dbo.difficulty_students
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY;
    `, params);

    return result;
  },

  async findByIdCard(idCard) {
    const result = await query(`
      SELECT * FROM dbo.difficulty_students
      WHERE id_card = @idCard AND is_deleted = 0;
    `, { idCard });
    return result[0] || null;
  },

  async count(includeDeleted = false) {
    const result = await query(`
      SELECT COUNT(*) AS total FROM dbo.difficulty_students
      WHERE ${includeDeleted ? "1=1" : "is_deleted = 0"};
    `);
    return result[0].total;
  },

  async softDeleteAll() {
    await query(`
      UPDATE dbo.difficulty_students
      SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET();
    `);
    return true;
  },

  async softDeleteByKey(key) {
    await query(`
      UPDATE dbo.difficulty_students
      SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
      WHERE [key] = @key AND is_deleted = 0;
    `, { key });
    return true;
  },
};
