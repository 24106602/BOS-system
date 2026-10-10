/**
 * 在校生 Repository - SQL Server 实现
 */
import { query, sql, getPool } from "./connection.js";

function mapEnrolledRow(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    idCard: row.id_card,
    college: row.college,
    department: row.department,
    major: row.major,
    className: row.class_name,
    gender: row.gender,
    grade: row.grade,
    academicYear: row.academic_year,
    semester: row.semester,
    examineeId: row.examinee_id,
    idCardType: row.id_card_type,
    birthDate: row.birth_date,
    politicalStatus: row.political_status,
    nationality: row.nationality,
    studentType: row.student_type,
    studyForm: row.study_form,
    counselorName: row.counselor_name,
    majorCategory: row.major_category,
    level: row.level,
    schoolSystem: row.school_system,
    enrollmentDate: row.enrollment_date,
    isRuralStudent: row.is_rural_student,
    studentSource: row.student_source,
    phone: row.phone,
    sourceFile: row.source_file,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRowData(student) {
  return {
    student_id: student.studentId,
    name: student.name,
    id_card: student.idCard || null,
    college: student.college || null,
    department: student.department || null,
    major: student.major || null,
    class_name: student.className || null,
    gender: student.gender || null,
    grade: student.grade || null,
    academic_year: student.academicYear || null,
    semester: student.semester || null,
    examinee_id: student.examineeId || null,
    id_card_type: student.idCardType || null,
    birth_date: student.birthDate || null,
    political_status: student.politicalStatus || null,
    nationality: student.nationality || null,
    student_type: student.studentType || null,
    study_form: student.studyForm || null,
    counselor_name: student.counselorName || null,
    major_category: student.majorCategory || null,
    level: student.level || null,
    school_system: student.schoolSystem || null,
    enrollment_date: student.enrollmentDate || null,
    is_rural_student: student.isRuralStudent || null,
    student_source: student.studentSource || null,
    phone: student.phone || null,
    source_file: student.sourceFile || null,
  };
}

export const enrolledStudentRepository = {
  async findAll(options = {}) {
    const { includeDeleted = false, college, offset = 0, limit = 1000 } = options;
    let sqlText = "SELECT * FROM dbo.enrolled_students WHERE 1=1";
    const params = { offset, limit };

    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    if (college) {
      sqlText += " AND college = @college";
      params.college = college;
    }

    sqlText += " ORDER BY student_id ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    const rows = await query(sqlText, params);
    return rows.map(mapEnrolledRow);
  },

  async findByStudentId(studentId, includeDeleted = false) {
    let sqlText = "SELECT * FROM dbo.enrolled_students WHERE student_id = @studentId";
    const params = { studentId };
    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    const rows = await query(sqlText, params);
    return rows.length > 0 ? mapEnrolledRow(rows[0]) : null;
  },

  async findByIdCard(idCard, includeDeleted = false) {
    let sqlText = "SELECT * FROM dbo.enrolled_students WHERE id_card = @idCard";
    const params = { idCard };
    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    const rows = await query(sqlText, params);
    return rows.length > 0 ? mapEnrolledRow(rows[0]) : null;
  },

  async verifyStudent(studentId, idCard, name) {
    // 按学号查找
    if (studentId) {
      const rows = await query(
        "SELECT name FROM dbo.enrolled_students WHERE student_id = @studentId AND is_deleted = 0",
        { studentId }
      );
      if (rows.length > 0) {
        if (rows[0].name === name) return { verified: true };
        return { verified: false, reason: "学号匹配但姓名不匹配，请核对" };
      }
    }

    // 按身份证号查找
    if (idCard) {
      const rows = await query(
        "SELECT name FROM dbo.enrolled_students WHERE id_card = @idCard AND is_deleted = 0",
        { idCard }
      );
      if (rows.length > 0) {
        if (rows[0].name === name) return { verified: true };
        return { verified: false, reason: "身份证号匹配但姓名不匹配，请核对" };
      }
    }

    return {
      verified: false,
      reason: "未在在校生数据库中找到该学生，请核对学号或身份证号+姓名",
    };
  },

  async count(includeDeleted = false) {
    let sqlText = "SELECT COUNT(*) as total FROM dbo.enrolled_students";
    if (!includeDeleted) {
      sqlText += " WHERE is_deleted = 0";
    }
    const rows = await query(sqlText);
    return rows[0].total;
  },

  async bulkUpsert(students) {
    if (students.length === 0) return 0;

    let count = 0;
    for (const s of students) {
      const row = toRowData(s);
      const params = {
        student_id: row.student_id,
        name: row.name,
        id_card: row.id_card,
        college: row.college,
        department: row.department,
        major: row.major,
        class_name: row.class_name,
        gender: row.gender,
        grade: row.grade,
        academic_year: row.academic_year,
        semester: row.semester,
        examinee_id: row.examinee_id,
        id_card_type: row.id_card_type,
        birth_date: row.birth_date,
        political_status: row.political_status,
        nationality: row.nationality,
        student_type: row.student_type,
        study_form: row.study_form,
        counselor_name: row.counselor_name,
        major_category: row.major_category,
        level: row.level,
        school_system: row.school_system,
        enrollment_date: row.enrollment_date,
        is_rural_student: row.is_rural_student,
        student_source: row.student_source,
        phone: row.phone,
        source_file: row.source_file,
      };

      await query(`
        MERGE dbo.enrolled_students AS target
        USING (SELECT @student_id AS student_id) AS source
        ON target.student_id = source.student_id
        WHEN MATCHED THEN
          UPDATE SET
            name = @name, id_card = @id_card, college = @college,
            department = @department, major = @major, class_name = @class_name,
            gender = @gender, grade = @grade, academic_year = @academic_year,
            semester = @semester, examinee_id = @examinee_id,
            id_card_type = @id_card_type, birth_date = @birth_date,
            political_status = @political_status, nationality = @nationality,
            student_type = @student_type, study_form = @study_form,
            counselor_name = @counselor_name, major_category = @major_category,
            level = @level, school_system = @school_system,
            enrollment_date = @enrollment_date,
            is_rural_student = @is_rural_student,
            student_source = @student_source, phone = @phone,
            source_file = @source_file,
            is_deleted = 0, deleted_at = NULL
        WHEN NOT MATCHED THEN
          INSERT (student_id, name, id_card, college, department, major,
                  class_name, gender, grade, academic_year, semester,
                  examinee_id, id_card_type, birth_date, political_status,
                  nationality, student_type, study_form, counselor_name,
                  major_category, level, school_system, enrollment_date,
                  is_rural_student, student_source, phone, source_file, is_deleted)
          VALUES (@student_id, @name, @id_card, @college, @department, @major,
                  @class_name, @gender, @grade, @academic_year, @semester,
                  @examinee_id, @id_card_type, @birth_date, @political_status,
                  @nationality, @student_type, @study_form, @counselor_name,
                  @major_category, @level, @school_system, @enrollment_date,
                  @is_rural_student, @student_source, @phone, @source_file, 0);
      `, params);
      count++;
    }

    return count;
  },

  async softDeleteAll() {
    await query(
      "UPDATE dbo.enrolled_students SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET() WHERE is_deleted = 0"
    );
  },

  async softDeleteByStudentIds(studentIds) {
    if (studentIds.length === 0) return;
    const ids = studentIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    await query(
      `UPDATE dbo.enrolled_students SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
       WHERE student_id IN (${ids}) AND is_deleted = 0`
    );
  },
};
